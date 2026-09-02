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
    // 웹 스테이션이 200 이 아닌 응답의 내용을 자기 오류 페이지로 바꿔치기 하므로,
    // 항상 200 으로 보내고 실패 여부는 JSON 안의 ok 로만 알립니다.
    http_response_code(200);
    if ($code !== 200 && is_array($arr) && !isset($arr['status'])) $arr['status'] = $code;
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

/**
 * 같은 이름이 있으면 "이름 (2).pdf" 처럼 번호를 붙입니다.
 *
 * 두 사람이 같은 이름을 같은 순간에 올릴 수도 있어서,
 * "없더라" 를 보고 쓰는 게 아니라 '내가 먼저 만들기'(x 모드)로 자리를 잡습니다.
 * 그래야 한쪽이 다른 쪽 파일을 덮어쓰지 않습니다.
 */
function unique_path($dir, $name) {
    $ext  = pathinfo($name, PATHINFO_EXTENSION);
    $base = pathinfo($name, PATHINFO_FILENAME);
    $try  = $name;
    for ($i = 1; $i < 500; $i++) {
        if ($i > 1) {
            $try = $base . ' (' . $i . ')' . ($ext !== '' ? '.' . $ext : '');
        }
        $h = @fopen($dir . '/' . $try, 'x');      // 이미 있으면 실패합니다
        if ($h) { fclose($h); return $try; }
    }
    return $base . '-' . substr(md5(uniqid('', true)), 0, 6)
         . ($ext !== '' ? '.' . $ext : '');
}

/** brand-data.json 에서 fileId 에 해당하는 자료 항목을 찾습니다 */
function lookup_asset($manifest, $fileId) {
    if (!file_exists($manifest)) return null;
    $json = json_decode(file_get_contents($manifest), true);
    if (!is_array($json) || !isset($json['brands'])) return null;
    foreach ($json['brands'] as $b) {
        // 브랜드 기록부 문서도 같이 찾습니다
        if (isset($b['record']['id']) && $b['record']['id'] === $fileId) {
            $r = $b['record'];
            return ['fileId' => $r['id'], 'fileName' => $r['name'] ?? '',
                    'filePath' => $r['filePath'] ?? ''];
        }
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

    // 브랜드 폴더 > 종류 폴더 로 나눠 저장합니다.
    // 탐색기에서 열었을 때도 바로 알아볼 수 있어야 하기 때문입니다.
    //   자료 / 기록부 / 자동화도구
    $subs = ['자료' => '자료', '기록부' => '기록부', '도구' => '자동화도구'];
    $sub  = $subs[trim($_POST['sub'] ?? '')] ?? '자료';
    $brandDir = $FILE_DIR . '/' . safe_name($_POST['brand'] ?? '', '기타') . '/' . $sub;

    if (!is_dir($brandDir) && !@mkdir($brandDir, 0775, true) && !is_dir($brandDir)) {
        jout(['ok' => false, 'error' =>
            "저장 폴더를 만들 수 없습니다: $brandDir / data폴더 쓰기가능="
            . (is_writable($DATA_DIR) ? '예' : '아니오')], 500);
    }

    $fileName = unique_path($brandDir, safe_name($f['name'], 'file'));
    $dest = $brandDir . '/' . $fileName;

    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        @unlink($dest);      // 자리만 잡아둔 빈 파일을 치웁니다
        jout(['ok' => false, 'error' =>
            'NAS에 파일을 저장하지 못했습니다 / 폴더 쓰기가능='
            . (is_writable($brandDir) ? '예' : '아니오')], 500);
    }
    @chmod($dest, 0664);

    jout([
        'ok'       => true,
        'fileId'   => bin2hex(random_bytes(16)),
        'fileName' => $fileName,
        'filePath' => basename(dirname($brandDir)) . '/' . basename($brandDir) . '/' . $fileName,
        'fileSize' => $f['size'],
        'mime'     => $f['type'] ?: 'application/octet-stream',
    ]);
}

/* ---------------- 다운로드 ---------------- */
/* ---------------- NAS 공유폴더로 옮기기 ----------------
   대시보드에 올린 파일을 실제 공유폴더 안으로 옮깁니다.
   훑은 폴더(nasroot.txt) 안쪽으로만 옮길 수 있고, 덮어쓰지 않습니다.
   ------------------------------------------------------ */
if ($action === 'movetonas') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }
    $in   = json_decode(file_get_contents('php://input'), true) ?: [];
    $rel  = str_replace('\\', '/', trim($in['path'] ?? ''));
    $dest = rtrim(str_replace('\\', '/', trim($in['dest'] ?? '')), '/');
    if ($rel === '' || $dest === '') jout(['ok' => false, 'error' => '옮길 파일과 폴더를 지정해 주세요'], 400);

    // 1) 원본은 반드시 data/files 안에 있어야 합니다
    $src  = realpath($FILE_DIR . '/' . $rel);
    $root = realpath($FILE_DIR);
    if (!$src || !$root || strpos($src, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($src)) {
        jout(['ok' => false, 'error' => '옮길 파일을 찾지 못했습니다: ' . $rel], 404);
    }

    // 2) 목적지는 반드시 훑은 공유폴더 안이어야 합니다
    $rootFile = $DATA_DIR . '/nasroot.txt';
    if (!is_file($rootFile)) {
        jout(['ok' => false, 'error' =>
            '먼저 NAS 자료에서 [🔎 지금 파일 목록 만들기] 를 한 번 해주세요. '
            . '어느 공유폴더를 쓰는지 알아야 옮길 수 있습니다.'], 400);
    }
    $nasRoot = realpath(rtrim(trim(file_get_contents($rootFile)), '/'));
    $destReal = realpath($dest);
    if (!$nasRoot || !$destReal || !is_dir($destReal)
        || ($destReal !== $nasRoot && strpos($destReal, $nasRoot . DIRECTORY_SEPARATOR) !== 0)) {
        jout(['ok' => false, 'error' => '그 폴더로는 옮길 수 없습니다. '
            . '목록을 만든 공유폴더 안쪽만 됩니다.', '옮기려던곳' => $dest], 403);
    }

    // 3) 쓰기 권한 확인
    if (!is_writable($destReal)) {
        $who = 'http';
        if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
            $u = @posix_getpwuid(@posix_geteuid());
            if (!empty($u['name'])) $who = $u['name'];
        }
        jout(['ok' => false, 'error' =>
            "이 폴더에 파일을 넣을 권한이 없습니다:\n" . $destReal . "\n\n"
            . "웹 서버는 \"" . $who . "\" 계정으로 돌아갑니다. 지금은 읽기만 되고 쓰기가 안 됩니다.\n\n"
            . "DSM → 제어판 → 공유 폴더 → 그 폴더 → [편집] → [권한] 탭\n"
            . "  1. 위 드롭다운을 \"시스템 내부 사용자\" 로 바꿉니다\n"
            . "  2. " . $who . " 를 찾아 \"읽기/쓰기\" 에 체크합니다\n"
            . "  3. 저장"], 403);
    }

    // 4) 같은 이름이 있으면 번호를 붙입니다 (덮어쓰지 않습니다)
    $name   = unique_path($destReal, basename($src));
    $target = $destReal . '/' . $name;

    if (!@rename($src, $target)) {                 // 볼륨이 다르면 rename 이 안 됩니다
        if (!@copy($src, $target)) {
            @unlink($target);   // 자리만 잡아둔 빈 파일을 치웁니다
            jout(['ok' => false, 'error' => '파일을 옮기지 못했습니다 (복사 실패)'], 500);
        }
        @unlink($src);
    }
    @chmod($target, 0664);

    jout(['ok' => true, '옮긴곳' => $target, '파일이름' => $name,
          '다음' => '다음번 목록 만들기 때 NAS 폴더 목록에도 나타납니다']);
}

/* ---------------- 자동화 도구 실행하기 ----------------
   생성기처럼 스크립트가 살아 있어야 동작하는 HTML 도구를 그대로 띄웁니다.
   (읽기 전용 문서는 아래 view 를 씁니다 — 그쪽은 스크립트를 막습니다)
   ---------------------------------------------------- */
if ($action === 'run') {
    $rel = trim($_GET['path'] ?? '');
    if ($rel === '') jout(['ok' => false, 'error' => '도구 경로가 없습니다'], 400);

    $rel  = str_replace('\\', '/', $rel);
    $real = realpath($FILE_DIR . '/' . $rel);
    $root = realpath($FILE_DIR);
    if (!$real || !$root || strpos($real, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
        jout(['ok' => false, 'error' => '그런 도구가 없습니다: ' . $rel], 404);
    }
    $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
    if ($ext !== 'html' && $ext !== 'htm') {
        jout(['ok' => false, 'error' => 'HTML 도구만 실행할 수 있습니다 (' . $ext . ')'], 400);
    }

    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($real));
    header('Cache-Control: private, max-age=0');
    while (ob_get_level()) ob_end_flush();
    readfile($real);
    exit;
}

/* ---------------- 문서 그대로 보여주기 (내려받지 않고) ----------------
   브랜드 기록부 같은 문서를 대시보드 안에서 바로 읽기 위한 것입니다.
   스크립트는 실행되지 않도록 막습니다.
   ------------------------------------------------------------------- */
if ($action === 'view') {
    $path = null;
    $name = null;

    // 1) 파일 경로를 직접 받은 경우 (저장이 끝나기 전에도 바로 볼 수 있습니다)
    $rel = trim($_GET['path'] ?? '');
    if ($rel !== '') {
        $rel  = str_replace('\\', '/', $rel);
        $try  = $FILE_DIR . '/' . $rel;
        $real = realpath($try);
        $root = realpath($FILE_DIR);
        // files 폴더 밖으로 벗어나는 경로는 거부합니다
        if ($real && $root && strpos($real, $root . DIRECTORY_SEPARATOR) === 0 && is_file($real)) {
            $path = $real;
            $name = basename($real);
        } else {
            jout(['ok' => false, 'error' => '그런 문서가 없습니다: ' . $rel], 404);
        }
    } else {
        // 2) 예전 방식 — 저장된 목록에서 찾습니다
        $id = $_GET['id'] ?? '';
        if (!preg_match('/^[0-9a-f]{32}$/', $id)) {
            jout(['ok' => false, 'error' => '잘못된 파일 주소입니다'], 400);
        }
        [$path, $name] = resolve_path($FILE_DIR, $MANIFEST, $id);
        if (!$path) jout(['ok' => false, 'error' =>
            '아직 저장되지 않은 문서입니다. 잠시 뒤 새로고침해 주세요.'], 404);
    }

    $ext = strtolower(pathinfo($name ?: $path, PATHINFO_EXTENSION));
    $types = [
        'html' => 'text/html; charset=utf-8',
        'htm'  => 'text/html; charset=utf-8',
        'txt'  => 'text/plain; charset=utf-8',
        'md'   => 'text/plain; charset=utf-8',
    ];
    if (!isset($types[$ext])) {
        jout(['ok' => false, 'error' =>
            '이 형식은 화면에서 바로 볼 수 없습니다 (' . $ext . '). 내려받아 주세요.'], 400);
    }

    // 문서 안의 스크립트는 실행되지 않게 막습니다. 글꼴과 그림은 허용합니다.
    header('Content-Type: ' . $types[$ext]);
    header("Content-Security-Policy: script-src 'none'; object-src 'none'; base-uri 'none'");
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=0');
    while (ob_get_level()) ob_end_flush();
    readfile($path);
    exit;
}

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
