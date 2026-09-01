<?php
/**
 * 브랜드 허브 - 자료 파일 업로드 / 다운로드 / 삭제
 *
 * 파일은 NAS의 data/files/ 폴더에 저장됩니다.
 * 저장할 때 원본 이름 대신 임의의 32자리 이름을 쓰기 때문에,
 * 주소를 추측해서 남의 파일을 받아가는 일이 어렵습니다.
 * 원본 파일명은 brand-data.json 에 기록되고, 내려받을 때 다시 붙여줍니다.
 */

$DATA_DIR = __DIR__ . '/data';
$FILE_DIR = $DATA_DIR . '/files';
$MANIFEST = $DATA_DIR . '/brand-data.json';
$MAX_BYTES = 200 * 1024 * 1024;   // 200MB (PHP 설정이 더 낮으면 그쪽이 우선 적용됩니다)

function jout($arr, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

/** php.ini 의 "8M" 같은 표기를 바이트로 바꿉니다 */
function to_bytes($v) {
    $v = trim((string)$v);
    if ($v === '') return 0;
    $unit = strtolower(substr($v, -1));
    $num = (int)$v;
    if ($unit === 'g') return $num * 1024 * 1024 * 1024;
    if ($unit === 'm') return $num * 1024 * 1024;
    if ($unit === 'k') return $num * 1024;
    return $num;
}

function php_limit_bytes() {
    return min(to_bytes(ini_get('upload_max_filesize')), to_bytes(ini_get('post_max_size')));
}

/** 폴더·파일 이름으로 쓸 수 없는 문자를 걸러냅니다 */
function safe_name($s, $fallback = '기타') {
    $s = str_replace(['\\', '/', "\0"], '_', (string)$s);
    $s = preg_replace('/[\x00-\x1F<>:"|?*]/u', '_', $s);
    $s = trim($s, " .\t");
    if ($s === '') return $fallback;
    if (mb_strlen($s, 'UTF-8') > 120) $s = mb_substr($s, 0, 120, 'UTF-8');
    return $s;
}

/** 같은 이름이 있으면 "이름 (2).pdf" 처럼 번호를 붙입니다 */
function unique_path($dir, $name) {
    $ext  = pathinfo($name, PATHINFO_EXTENSION);
    $base = pathinfo($name, PATHINFO_FILENAME);
    $try  = $name;
    $i    = 1;
    while (file_exists($dir . '/' . $try)) {
        $i++;
        $try = $base . ' (' . $i . ')' . ($ext !== '' ? '.' . $ext : '');
    }
    return $try;
}

/** brand-data.json 에서 fileId 에 해당하는 자료 항목을 찾습니다 */
function lookup_asset($manifest, $fileId) {
    if (!file_exists($manifest)) return null;
    $json = json_decode(file_get_contents($manifest), true);
    if (!is_array($json) || !isset($json['brands'])) return null;
    foreach ($json['brands'] as $b) {
        if (!isset($b['assets']) || !is_array($b['assets'])) continue;
        foreach ($b['assets'] as $a) {
            if (isset($a['fileId']) && $a['fileId'] === $fileId) return $a;
        }
    }
    return null;
}

/** fileId 에 해당하는 실제 파일 경로를 구합니다 (예전 방식도 함께 지원) */
function resolve_path($fileDir, $manifest, $fileId) {
    $a = lookup_asset($manifest, $fileId);

    if ($a && !empty($a['filePath'])) {
        $p = $fileDir . '/' . $a['filePath'];
        $real = realpath($p);
        $root = realpath($fileDir);
        // files 폴더 밖으로 벗어나는 경로는 거부합니다
        if ($real && $root && strpos($real, $root . DIRECTORY_SEPARATOR) === 0) {
            return [$real, $a['fileName'] ?? basename($real)];
        }
        return [null, null];
    }

    // 예전에 올린 파일 (임의 이름 .bin)
    $old = $fileDir . '/' . $fileId . '.bin';
    if (is_file($old)) return [$old, ($a['fileName'] ?? ($fileId . '.bin'))];

    return [null, null];
}

/** brand-data.json 에서 fileId 에 해당하는 원본 파일명을 찾습니다 */
function lookup_name($manifest, $fileId) {
    if (!file_exists($manifest)) return null;
    $json = json_decode(file_get_contents($manifest), true);
    if (!is_array($json) || !isset($json['brands'])) return null;
    foreach ($json['brands'] as $b) {
        if (!isset($b['assets']) || !is_array($b['assets'])) continue;
        foreach ($b['assets'] as $a) {
            if (isset($a['fileId']) && $a['fileId'] === $fileId) {
                return $a['fileName'] ?? null;
            }
        }
    }
    return null;
}

$action = $_GET['action'] ?? '';

/* ---------------- 상태 확인 ---------------- */
if ($action === 'check') {
    jout([
        'ok'                => true,
        'php업로드한도'     => ini_get('upload_max_filesize'),
        'php요청한도'       => ini_get('post_max_size'),
        '실제적용한도_바이트' => php_limit_bytes(),
        'files폴더_존재'    => is_dir($FILE_DIR) ? '예' : '아니오',
        'files폴더_쓰기가능' => is_dir($FILE_DIR)
            ? (is_writable($FILE_DIR) ? '예' : '아니오')
            : ((is_dir($DATA_DIR) ? is_writable($DATA_DIR) : is_writable(__DIR__))
                 ? '아직 없지만 만들 수 있음' : '상위 폴더에 쓸 수 없음'),
        '보관파일수'        => is_dir($FILE_DIR)
            ? count(array_filter((array)glob($FILE_DIR . '/*/*'), 'is_file'))
              + count(array_filter((array)glob($FILE_DIR . '/*.bin'), 'is_file'))
            : 0,
    ]);
}

/* ---------------- 업로드 ---------------- */
if ($action === 'upload') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }

    // 파일이 너무 커서 PHP가 아예 받지 못한 경우 $_FILES 가 비어 있습니다
    if (empty($_FILES) && empty($_POST)) {
        jout(['ok' => false, 'error' =>
            '파일이 너무 커서 서버가 받지 못했습니다. 현재 한도: '
            . ini_get('upload_max_filesize') . ' / 요청 ' . ini_get('post_max_size')
            . ' — Web Station의 PHP 프로필에서 한도를 올려주세요'], 413);
    }

    if (!isset($_FILES['file'])) {
        jout(['ok' => false, 'error' => '전달된 파일이 없습니다'], 400);
    }

    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        $msgs = [
            UPLOAD_ERR_INI_SIZE   => '파일이 서버 한도(' . ini_get('upload_max_filesize') . ')보다 큽니다',
            UPLOAD_ERR_FORM_SIZE  => '파일이 허용 크기보다 큽니다',
            UPLOAD_ERR_PARTIAL    => '파일이 일부만 전송되었습니다. 다시 시도해 주세요',
            UPLOAD_ERR_NO_FILE    => '파일이 선택되지 않았습니다',
            UPLOAD_ERR_NO_TMP_DIR => '서버에 임시 폴더가 없습니다',
            UPLOAD_ERR_CANT_WRITE => '서버가 파일을 쓰지 못했습니다 (권한 확인 필요)',
        ];
        jout(['ok' => false, 'error' => $msgs[$f['error']] ?? ('업로드 오류 코드 ' . $f['error'])], 400);
    }

    if ($f['size'] > $MAX_BYTES) {
        jout(['ok' => false, 'error' => '파일이 너무 큽니다 (최대 200MB)'], 413);
    }

    // 브랜드별 폴더에 원래 이름 그대로 저장합니다.
    // 탐색기에서 열었을 때도 바로 알아볼 수 있어야 하기 때문입니다.
    $brandDir = $FILE_DIR . '/' . safe_name($_POST['brand'] ?? '', '기타');

    if (!is_dir($brandDir) && !@mkdir($brandDir, 0775, true) && !is_dir($brandDir)) {
        jout(['ok' => false, 'error' =>
            "저장 폴더를 만들 수 없습니다: $brandDir / data폴더 쓰기가능="
            . (is_writable($DATA_DIR) ? '예' : '아니오')], 500);
    }

    $fileName = unique_path($brandDir, safe_name($f['name'], 'file'));
    $dest = $brandDir . '/' . $fileName;

    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        jout(['ok' => false, 'error' =>
            'NAS에 파일을 저장하지 못했습니다 / 폴더 쓰기가능='
            . (is_writable($brandDir) ? '예' : '아니오')], 500);
    }
    @chmod($dest, 0664);

    jout([
        'ok'       => true,
        'fileId'   => bin2hex(random_bytes(16)),
        'fileName' => $fileName,
        'filePath' => basename($brandDir) . '/' . $fileName,
        'fileSize' => $f['size'],
        'mime'     => $f['type'] ?: 'application/octet-stream',
    ]);
}

/* ---------------- 다운로드 ---------------- */
if ($action === 'download') {
    $id = $_GET['id'] ?? '';
    if (!preg_match('/^[0-9a-f]{32}$/', $id)) {
        jout(['ok' => false, 'error' => '잘못된 파일 주소입니다'], 400);
    }

    [$path, $name] = resolve_path($FILE_DIR, $MANIFEST, $id);
    if (!$path) {
        jout(['ok' => false, 'error' =>
            '파일을 찾을 수 없습니다. 삭제되었거나 탐색기에서 이름이 바뀌었을 수 있습니다'], 404);
    }
    $name = $name ?: basename($path);
    $name = str_replace(["\r", "\n", '"', '\\'], '', $name);   // 헤더 조작 방지

    // 한글 등 비ASCII 파일명을 위해 두 가지 형식을 함께 보냅니다.
    //  filename   : 옛 브라우저용 ASCII 대체 이름
    //  filename*  : UTF-8 원본 이름 (요즘 브라우저가 이쪽을 씁니다)
    $ascii = preg_replace('/[^\x20-\x7E]/', '_', $name);
    if (trim($ascii, '_ ') === '') $ascii = 'download';

    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $ascii . '"; '
         . "filename*=UTF-8''" . rawurlencode($name));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=0');

    readfile($path);
    exit;
}

/* ---------------- 삭제 ---------------- */
if ($action === 'delete') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }

    $body = json_decode(file_get_contents('php://input'), true);
    $id = $body['fileId'] ?? '';
    if (!preg_match('/^[0-9a-f]{32}$/', $id)) {
        jout(['ok' => false, 'error' => '잘못된 파일 주소입니다'], 400);
    }

    [$path, ] = resolve_path($FILE_DIR, $MANIFEST, $id);
    if ($path && is_file($path) && !@unlink($path)) {
        jout(['ok' => false, 'error' => '파일을 삭제하지 못했습니다 (권한 확인 필요)'], 500);
    }
    jout(['ok' => true]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
