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

/* 경고문이 JSON 앞에 섞여 나오면 화면이 깨지므로, 출력을 붙잡아 둡니다.
   치명적 오류가 나도 이유를 JSON 으로 돌려줍니다. */
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
ob_start();
register_shutdown_function(function () {
    $e = error_get_last();
    $fatal = $e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
    if (!ob_get_level()) return;              // 이미 내보냈으면 그대로 둡니다
    if ($fatal) {
        ob_end_clean();
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['ok' => false, 'error' => '서버 오류: ' . $e['message']
            . ' (' . basename($e['file']) . ' ' . $e['line'] . '줄)'], JSON_UNESCAPED_UNICODE);
    } else {
        ob_end_flush();
    }
});

/* PHP 가 이 폴더를 읽도록 허용돼 있는지 봅니다 (open_basedir).
   시놀로지 웹 스테이션 기본값이 웹 폴더로 묶여 있어 공유폴더를 못 읽습니다. */
function basedir_error($path) {
    $ob = @ini_get('open_basedir');
    if ($ob === false || trim((string)$ob) === '') return null;

    $cands = [$path];
    $bare  = preg_replace('#^/volume\d+/#', '/', $path);
    for ($i = 1; $i <= 8; $i++) $cands[] = '/volume' . $i . $bare;

    foreach (explode(PATH_SEPARATOR, $ob) as $a) {
        $a = rtrim(trim($a), '/');
        if ($a === '') continue;
        foreach ($cands as $c) {
            if ($c === $a || strpos($c, $a . '/') === 0) return null;   // 허용됨
        }
    }
    return "PHP 가 공유폴더를 읽지 못하도록 막혀 있습니다.\n\n"
         . "DSM → 웹 스테이션 → 스크립트 언어 설정 → 쓰고 계신 PHP 프로필 → 편집 →\n"
         . "\"open_basedir\" 칸에 아래 경로를 추가하고 저장해 주세요.\n\n"
         . "    " . $path . "\n\n"
         . "지금 허용된 경로: " . $ob;
}

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

/* 사람이 넣은 폴더 경로를 NAS 경로 모양으로 다듬습니다.
   Y:\공유폴더\...        →  /공유폴더/...
   \\netformrnd\공유폴더\... →  /공유폴더/...
   /volume1/공유폴더/...  →  그대로                              */
function normalize_nas_input($raw) {
    $p = trim((string)$raw);
    $p = str_replace('\\', '/', $p);
    $p = preg_replace('#^//[^/]+/#', '/', $p);     // \\서버\공유폴더
    $p = preg_replace('#^[A-Za-z]:/#', '/', $p);   // Y:\공유폴더
    $p = preg_replace('#/+#', '/', $p);
    $p = rtrim($p, '/');
    if ($p === '' || $p[0] !== '/') return null;
    return $p;
}

/* 다듬은 경로가 실제로 어느 볼륨에 있는지 찾아냅니다.
   못 찾으면 어떤 경로들을 시도했는지 같이 돌려줍니다. */
function resolve_nas_dir($p) {
    $bare  = preg_replace('#^/volume\d+/#', '/', $p);
    $cands = [$p];
    $vols  = glob('/volume*', GLOB_ONLYDIR) ?: [];
    sort($vols);
    foreach ($vols as $v) $cands[] = $v . $bare;

    $tried = [];
    foreach ($cands as $c) {
        $c = preg_replace('#/+#', '/', $c);
        if (in_array($c, $tried, true)) continue;
        $tried[] = $c;
        if (is_dir($c)) {
            $real = realpath($c);
            return [$real !== false ? $real : $c, $tried];
        }
    }
    return [null, $tried];
}

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
        '다음에훑을폴더' => is_file(__DIR__ . '/data/scanroot.txt')
            ? trim(file_get_contents(__DIR__ . '/data/scanroot.txt')) : '(기본값)',
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

/* ---------------- 폴더 탐색 (탐색기처럼) ---------------- */
if ($action === 'browse') {
    if (!is_file($FILE)) jout(['ok' => false, 'error' => '파일 목록이 아직 없습니다'], 404);

    $dir = rtrim(trim($_GET['dir'] ?? ''), '/');
    if ($dir === '') {
        $dir = is_file($ROOT_FILE) ? rtrim(trim(file_get_contents($ROOT_FILE)), '/') : '';
    }
    if ($dir === '') jout(['ok' => false, 'error' => '폴더를 지정해 주세요'], 400);

    $fp = fopen($FILE, 'r');
    if (!$fp) jout(['ok' => false, 'error' => '목록을 열지 못했습니다'], 500);

    $prefix   = $dir . '/';
    $preLen   = strlen($prefix);
    $folders  = [];   // 바로 아래 하위 폴더
    $files    = [];   // 바로 아래 파일
    $totalIn  = 0;    // 이 폴더 아래 전체 파일 수

    while (($line = fgets($fp)) !== false) {
        $p = explode("\t", rtrim($line, "\r\n"), 3);
        if (count($p) < 3) continue;
        [$date, $size, $path] = $p;
        if (strncmp($path, $prefix, $preLen) !== 0) continue;

        $totalIn++;
        $rest = substr($path, $preLen);
        $slash = strpos($rest, '/');

        if ($slash === false) {
            $files[] = [
                'name' => $rest,
                'path' => $path,
                'date' => $date,
                'size' => human((int)$size),
                'ext'  => strtolower(pathinfo($rest, PATHINFO_EXTENSION)),
            ];
        } else {
            $sub = substr($rest, 0, $slash);
            if (!isset($folders[$sub])) $folders[$sub] = ['count' => 0, 'bytes' => 0];
            $folders[$sub]['count']++;
            $folders[$sub]['bytes'] += (int)$size;
        }
    }
    fclose($fp);

    $folderList = [];
    foreach ($folders as $name => $v) {
        $folderList[] = ['name' => $name, 'path' => $dir . '/' . $name,
                         'count' => $v['count'], 'size' => human($v['bytes'])];
    }
    usort($folderList, function ($a, $b) { return strnatcasecmp($a['name'], $b['name']); });
    usort($files, function ($a, $b) { return strnatcasecmp($a['name'], $b['name']); });

    $root = is_file($ROOT_FILE) ? rtrim(trim(file_get_contents($ROOT_FILE)), '/') : '';
    jout([
        'ok'      => true,
        'dir'     => $dir,
        'root'    => $root,
        'parent'  => ($root !== '' && $dir !== $root) ? dirname($dir) : null,
        'total'   => $totalIn,
        'folders' => $folderList,
        'files'   => array_slice($files, 0, 500),
        'fileCount' => count($files),
    ]);
}

/* ---------------- 폴더 나무 (브랜드 자동 연결용) ----------------
   목록을 한 번만 훑어서 depth 단계까지의 폴더를 모두 뽑아옵니다.
   ---------------------------------------------------------------- */
if ($action === 'tree') {
    if (!is_file($FILE)) jout(['ok' => false, 'error' => '파일 목록이 아직 없습니다'], 404);
    $root = is_file($ROOT_FILE) ? rtrim(trim(file_get_contents($ROOT_FILE)), '/') : '';
    if ($root === '') jout(['ok' => false, 'error' => '훑은 폴더를 알 수 없습니다'], 404);

    $depth = (int)($_GET['depth'] ?? 4);
    if ($depth < 1) $depth = 1;
    if ($depth > 6) $depth = 6;
    $limit = (int)($_GET['limit'] ?? 5000);
    if ($limit < 100)   $limit = 100;
    if ($limit > 20000) $limit = 20000;

    $fp = fopen($FILE, 'r');
    if (!$fp) jout(['ok' => false, 'error' => '목록을 열지 못했습니다'], 500);

    $prefix = $root . '/';
    $preLen = strlen($prefix);
    $acc    = [];

    while (($line = fgets($fp)) !== false) {
        $p = explode("\t", rtrim($line, "\r\n"), 3);
        if (count($p) < 3) continue;
        [$date, $size, $path] = $p;
        if (strncmp($path, $prefix, $preLen) !== 0) continue;

        $segs = explode('/', substr($path, $preLen));
        array_pop($segs);                       // 파일 이름은 뺍니다
        $n = min(count($segs), $depth);
        $cur = '';
        for ($i = 0; $i < $n; $i++) {
            $cur .= ($i ? '/' : '') . $segs[$i];
            if (!isset($acc[$cur])) $acc[$cur] = [0, 0];
            $acc[$cur][0]++;
            $acc[$cur][1] += (int)$size;
        }
    }
    fclose($fp);

    $out = [];
    foreach ($acc as $rel => $v) {
        $out[] = [
            'name'  => basename($rel),
            'path'  => $root . '/' . $rel,
            'depth' => substr_count($rel, '/') + 1,
            'count' => $v[0],
            'size'  => human($v[1]),
        ];
    }
    // 얕은 폴더를 앞에 둡니다. 너무 많으면 깊은 쪽부터 잘립니다.
    usort($out, function ($a, $b) {
        if ($a['depth'] !== $b['depth']) return $a['depth'] - $b['depth'];
        return strnatcasecmp($a['path'], $b['path']);
    });
    $total = count($out);
    if ($total > $limit) $out = array_slice($out, 0, $limit);

    jout(['ok' => true, 'root' => $root, 'depth' => $depth,
          'total' => $total, 'shown' => count($out), 'folders' => $out]);
}

/* ---------------- 폴더 경로 알아듣기 ---------------- */
if ($action === 'resolve') {
    $in = normalize_nas_input($_GET['path'] ?? '');
    if ($in === null) {
        jout(['ok' => false, 'error' => '폴더 경로를 알아보지 못했습니다. '
            . '예) Y:\\넷폼알앤디 공유폴더\\... 또는 /volume1/넷폼알앤디 공유폴더/...'], 400);
    }
    [$dir, $tried] = resolve_nas_dir($in);
    if ($dir === null) {
        jout(['ok' => false, 'error' => '그런 폴더를 찾지 못했습니다', 'tried' => $tried], 404);
    }
    jout(['ok' => true, 'dir' => $dir]);
}

/* ---------------- 훑을 폴더 바꾸기 ---------------- */
if ($action === 'setroot') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    $in  = json_decode(file_get_contents('php://input'), true) ?: [];
    $raw = normalize_nas_input($in['dir'] ?? '');
    if ($raw === null) {
        jout(['ok' => false, 'error' => '폴더 경로를 알아보지 못했습니다. '
            . '예) Y:\\넷폼알앤디 공유폴더\\... 또는 /volume1/넷폼알앤디 공유폴더/...'], 400);
    }
    $bd = basedir_error($raw);
    if ($bd !== null) jout(['ok' => false, 'error' => $bd], 403);

    [$dir, $tried] = resolve_nas_dir($raw);
    if ($dir === null) {
        jout(['ok' => false, 'error' => '그런 폴더를 찾지 못했습니다', 'tried' => $tried], 404);
    }
    if (!is_dir(__DIR__ . '/data') && !@mkdir(__DIR__ . '/data', 0775, true)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다'], 500);
    }
    file_put_contents(__DIR__ . '/data/scanroot.txt', $dir);
    jout(['ok' => true, '훑을폴더' => $dir,
          '다음' => '작업 스케줄러에서 scan.sh 를 다시 실행해 주세요']);
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

    while (ob_get_level()) ob_end_flush();   // 파일은 그대로 흘려보냅니다
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
