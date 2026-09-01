<?php
/**
 * NAS 파일 목록 검색
 *
 * scan.sh 가 만든 목록(data/nasfiles.tsv)에서 찾아줍니다.
 * 파일 자체는 건드리지 않고, 어디에 있는지만 알려줍니다.
 *
 *   ?action=check              목록 상태 확인
 *   ?action=search&q=검색어    파일 찾기
 */

header('Content-Type: application/json; charset=utf-8');

$FILE = __DIR__ . '/data/nasfiles.tsv';

function jout($arr, $code = 200) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

function human($b) {
    if ($b < 1024) return $b . ' B';
    if ($b < 1048576) return round($b / 1024) . ' KB';
    if ($b < 1073741824) return round($b / 1048576, 1) . ' MB';
    return round($b / 1073741824, 2) . ' GB';
}

$ROOT_FILE = __DIR__ . '/data/nasroot.txt';

/** 훑은 폴더 안의 파일인지 확인합니다. 그 밖의 경로는 절대 열지 않습니다. */
function safe_real_path($path, $rootFile) {
    if (!is_file($rootFile)) return null;
    $root = rtrim(trim(file_get_contents($rootFile)), '/');
    if ($root === '') return null;

    $real     = realpath($path);
    $realRoot = realpath($root);
    if ($real === false || $realRoot === false) return null;
    if (strpos($real, $realRoot . DIRECTORY_SEPARATOR) !== 0) return null;   // 폴더 밖이면 거부
    if (!is_file($real)) return null;
    return $real;
}

$action = $_GET['action'] ?? '';

if ($action === 'check') {
    jout([
        'ok'       => is_file($FILE),
        '목록'     => is_file($FILE) ? '있음' : '없음 — scan.sh 를 한 번 실행해 주세요',
        '파일수'   => is_file($FILE) ? (int)trim(shell_exec('wc -l < ' . escapeshellarg($FILE)) ?: '0') : 0,
        '목록크기' => is_file($FILE) ? human(filesize($FILE)) : '-',
        '만든시각' => is_file($FILE) ? date('c', filemtime($FILE)) : null,
        '훑은폴더' => is_file($ROOT_FILE) ? trim(file_get_contents($ROOT_FILE)) : '기록 없음',
    ]);
}

if ($action === 'search') {
    if (!is_file($FILE)) {
        jout(['ok' => false, 'error' =>
            '파일 목록이 아직 없습니다. NAS 작업 스케줄러에서 scan.sh 를 한 번 실행해 주세요.'], 404);
    }

    $q     = trim($_GET['q'] ?? '');
    $limit = min(max((int)($_GET['limit'] ?? 200), 1), 500);
    $ext   = strtolower(trim($_GET['ext'] ?? ''));

    if ($q === '' && $ext === '') {
        jout(['ok' => false, 'error' => '검색어를 입력해 주세요'], 400);
    }

    // 검색어를 공백으로 나눠 모두 포함하는 파일을 찾습니다
    $terms = array_values(array_filter(preg_split('/\s+/u', mb_strtolower($q, 'UTF-8'))));

    $fp = fopen($FILE, 'r');
    if (!$fp) jout(['ok' => false, 'error' => '목록을 열지 못했습니다'], 500);

    $hits = [];
    $matched = 0;
    while (($line = fgets($fp)) !== false) {
        $line = rtrim($line, "\r\n");
        if ($line === '') continue;
        $p = explode("\t", $line, 3);
        if (count($p) < 3) continue;
        [$date, $size, $path] = $p;

        $lower = mb_strtolower($path, 'UTF-8');
        $ok = true;
        foreach ($terms as $t) { if (strpos($lower, $t) === false) { $ok = false; break; } }
        if ($ok && $ext !== '') {
            $ok = strtolower(pathinfo($path, PATHINFO_EXTENSION)) === $ext;
        }
        if (!$ok) continue;

        $matched++;
        if (count($hits) < $limit) {
            $hits[] = [
                'name' => basename($path),
                'dir'  => dirname($path),
                'path' => $path,
                'date' => $date,
                'size' => human((int)$size),
                'ext'  => strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            ];
        }
    }
    fclose($fp);

    jout([
        'ok'      => true,
        'matched' => $matched,
        'shown'   => count($hits),
        'scanAt'  => date('c', filemtime($FILE)),
        'results' => $hits,
    ]);
}

/* ---------------- 폴더 안의 파일 목록 ---------------- */
if ($action === 'under') {
    if (!is_file($FILE)) jout(['ok' => false, 'error' => '파일 목록이 아직 없습니다'], 404);

    $dir   = rtrim(trim($_GET['dir'] ?? ''), '/');
    $limit = min(max((int)($_GET['limit'] ?? 300), 1), 1000);
    $q     = mb_strtolower(trim($_GET['q'] ?? ''), 'UTF-8');
    if ($dir === '') jout(['ok' => false, 'error' => '폴더를 지정해 주세요'], 400);

    $fp = fopen($FILE, 'r');
    if (!$fp) jout(['ok' => false, 'error' => '목록을 열지 못했습니다'], 500);

    $prefix = $dir . '/';
    $hits = [];
    $matched = 0;
    $bytes = 0;
    while (($line = fgets($fp)) !== false) {
        $p = explode("\t", rtrim($line, "\r\n"), 3);
        if (count($p) < 3) continue;
        [$date, $size, $path] = $p;
        if (strpos($path, $prefix) !== 0) continue;
        if ($q !== '' && strpos(mb_strtolower($path, 'UTF-8'), $q) === false) continue;

        $matched++;
        $bytes += (int)$size;
        if (count($hits) < $limit) {
            $hits[] = [
                'name' => basename($path),
                'sub'  => trim(str_replace($prefix, '', dirname($path) . '/'), '/'),
                'path' => $path,
                'date' => $date,
                'size' => human((int)$size),
                'ext'  => strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            ];
        }
    }
    fclose($fp);

    jout(['ok' => true, 'matched' => $matched, 'shown' => count($hits),
          'totalSize' => human($bytes), 'results' => $hits]);
}

/* ---------------- 있는 자리에서 바로 내려받기 ---------------- */
if ($action === 'download') {
    $path = $_GET['path'] ?? '';
    $real = safe_real_path($path, $ROOT_FILE);
    if (!$real) {
        jout(['ok' => false, 'error' =>
            '내려받을 수 없는 파일입니다. 목록을 만든 폴더 안의 파일만 받을 수 있습니다.'], 403);
    }

    $name  = str_replace(["\r", "\n", '"', '\\'], '', basename($real));
    $ascii = preg_replace('/[^\x20-\x7E]/', '_', $name);
    if (trim($ascii, '_ ') === '') $ascii = 'download';

    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($real));
    header('Content-Disposition: attachment; filename="' . $ascii . '"; '
         . "filename*=UTF-8''" . rawurlencode($name));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=0');

    // 큰 파일도 메모리를 적게 쓰도록 조금씩 내보냅니다
    $fp = fopen($real, 'rb');
    if (!$fp) { http_response_code(500); exit; }
    while (!feof($fp)) { echo fread($fp, 262144); flush(); }
    fclose($fp);
    exit;
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
