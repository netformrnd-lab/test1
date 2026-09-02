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
            http_response_code(200);
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

/* 권한 문제일 때 어디를 어떻게 고쳐야 하는지 알려줍니다.
   시놀로지는 권한 화면이 두 곳인데, 웹 서버 계정(http)은 한쪽에서만 보입니다. */
function perm_help($dir) {
    $who = 'http';
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $u = @posix_getpwuid(@posix_geteuid());
        if (!empty($u['name'])) $who = $u['name'];
    }
    return "이 폴더를 읽을 권한이 없습니다: " . $dir . "\n\n"
         . "웹 서버는 \"" . $who . "\" 계정으로 돌아갑니다. 이 계정에 읽기 권한이 필요합니다.\n"
         . "시놀로지는 권한 화면이 두 곳인데, 이 계정은 아래 화면에서만 보입니다.\n\n"
         . "DSM → 제어판 → 공유 폴더 → 그 폴더 선택 → [편집] → [권한] 탭\n"
         . "  1. 화면 위 드롭다운을 \"로컬 사용자\" 에서 \"시스템 내부 사용자\" 로 바꿉니다\n"
         . "  2. 목록에서 " . $who . " 를 찾아 \"읽기 전용\" 에 체크합니다\n"
         . "  3. 저장을 누릅니다\n\n"
         . "그래도 안 되면 File Station 에서 그 폴더 오른쪽 클릭 → 속성 → 권한 →\n"
         . "[추가] → 사용자/그룹 " . $who . " → 읽기 → 적용 대상 \"이 폴더, 하위 폴더 및 파일\"";
}

$FILE = __DIR__ . '/data/nasfiles.tsv';

function jout($arr, $code = 200) {
    // 웹 스테이션이 200 이 아닌 응답의 내용을 자기 오류 페이지로 바꿔치기 하므로,
    // 항상 200 으로 보내고 실패 여부는 JSON 안의 ok 로만 알립니다.
    http_response_code(200);
    if ($code !== 200 && is_array($arr) && !isset($arr['status'])) $arr['status'] = $code;
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

        // PHP 가 공유폴더를 읽을 수 있는지 판단하는 데 필요한 값들입니다
        'php버전'        => PHP_VERSION,
        '공유폴더읽기제한' => (trim((string)@ini_get('open_basedir')) === '')
            ? '없음 (제한 없이 읽을 수 있습니다)' : @ini_get('open_basedir'),
        '보이는볼륨'      => implode(', ', @glob('/volume*', GLOB_ONLYDIR) ?: []) ?: '(못 봄)',
        'nasscan설치됨'   => is_file(__DIR__ . '/nasscan.php') ? '예' : '아니오',
        '웹서버계정'      => (function () {
            if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
                $u = @posix_getpwuid(@posix_geteuid());
                if (!empty($u['name'])) return $u['name'];
            }
            $w = @shell_exec('whoami 2>/dev/null');
            return $w ? trim($w) : '알 수 없음';
        })(),
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

/* ---------------- 폴더 탐색 (탐색기처럼) ----------------
   지금 보고 있는 폴더는 디스크를 그대로 읽습니다.
   그래서 다른 사람이 방금 올린 파일도 새로고침하면 바로 보입니다.
   (하위 폴더의 개수·용량만 미리 만들어 둔 목록에서 가져옵니다)
   -------------------------------------------------------- */
if ($action === 'browse') {
    $dir = rtrim(trim($_GET['dir'] ?? ''), '/');
    if ($dir === '') {
        $dir = is_file($ROOT_FILE) ? rtrim(trim(file_get_contents($ROOT_FILE)), '/') : '';
    }
    if ($dir === '') jout(['ok' => false, 'error' => '폴더를 지정해 주세요'], 400);

    $root = is_file($ROOT_FILE) ? rtrim(trim(file_get_contents($ROOT_FILE)), '/') : '';
    $real = @realpath($dir);
    if (!$real) jout(['ok' => false, 'error' => '그런 폴더가 없습니다: ' . $dir], 404);

    // 훑은 폴더 밖은 열지 않습니다
    $realRoot = $root !== '' ? @realpath($root) : false;
    if (!$realRoot || ($real !== $realRoot && strpos($real, $realRoot . DIRECTORY_SEPARATOR) !== 0)) {
        jout(['ok' => false, 'error' => '목록을 만든 폴더 안쪽만 볼 수 있습니다'], 403);
    }

    $off = max(0, (int)($_GET['off'] ?? 0));
    $lim = (int)($_GET['lim'] ?? 500);
    if ($lim < 50)   $lim = 50;
    if ($lim > 2000) $lim = 2000;

    $skipNames = ['.', '..', '@eaDir', '#recycle', '#snapshot', '.DS_Store', 'Thumbs.db'];

    $entries = @scandir($real);
    if ($entries === false) jout(['ok' => false, 'error' => perm_help($real)], 403);

    // 하위 폴더는 glob 으로 한 번에 (파일 하나하나 확인하지 않아 빠릅니다)
    $dirNames = [];
    foreach ((@glob($real . '/*', GLOB_ONLYDIR) ?: []) as $d) $dirNames[basename($d)] = true;

    $fileNames = [];
    foreach ($entries as $e) {
        if (in_array($e, $skipNames, true)) continue;
        if (isset($dirNames[$e])) continue;
        if (strncmp($e, '~$', 2) === 0) continue;
        $fileNames[] = $e;
    }
    usort($fileNames, 'strnatcasecmp');

    // 화면에 보여줄 쪽만 크기·날짜를 읽습니다 (수만 장짜리 폴더 대비)
    $files = [];
    foreach (array_slice($fileNames, $off, $lim) as $e) {
        $full = $real . '/' . $e;
        $fx   = strtolower(pathinfo($e, PATHINFO_EXTENSION));
        $files[] = [
            'name' => $e,
            'path' => $full,
            'date' => date('Y-m-d', @filemtime($full) ?: 0),
            'size' => human((int)@filesize($full)),
            'ext'  => $fx,
            'img'  => in_array($fx, ['jpg','jpeg','png','gif','webp','bmp'], true),
        ];
    }

    // 하위 폴더의 개수·용량은 만들어 둔 목록에서 가져옵니다 (없으면 비워 둡니다)
    $counts = [];
    $totalIn = 0;
    if (is_file($FILE) && ($fp = fopen($FILE, 'r'))) {
        $prefix = $real . '/';
        $preLen = strlen($prefix);
        while (($line = fgets($fp)) !== false) {
            $p = explode("\t", rtrim($line, "\r\n"), 3);
            if (count($p) < 3) continue;
            if (strncmp($p[2], $prefix, $preLen) !== 0) continue;
            $totalIn++;
            $rest  = substr($p[2], $preLen);
            $slash = strpos($rest, '/');
            if ($slash === false) continue;
            $sub = substr($rest, 0, $slash);
            if (!isset($counts[$sub])) $counts[$sub] = [0, 0];
            $counts[$sub][0]++;
            $counts[$sub][1] += (int)$p[1];
        }
        fclose($fp);
    }

    $folderList = [];
    foreach (array_keys($dirNames) as $name) {
        if (in_array($name, $skipNames, true)) continue;
        $c = $counts[$name] ?? [0, 0];
        $folderList[] = ['name' => $name, 'path' => $real . '/' . $name,
                         'count' => $c[0], 'size' => human($c[1])];
    }
    usort($folderList, function ($a, $b) { return strnatcasecmp($a['name'], $b['name']); });

    jout([
        'ok'      => true,
        'dir'     => $real,
        'root'    => $root,
        'parent'  => ($realRoot && $real !== $realRoot) ? dirname($real) : null,
        'total'   => max($totalIn, count($fileNames)),
        'folders' => $off === 0 ? $folderList : [],
        'files'   => $files,
        'off'     => $off,
        'fileCount' => count($fileNames),
        'live'    => true,
    ]);
}

/* ---------------- 진짜 폴더 목록 보기 (목록 파일이 없어도 됨) ----------------
   NAS 에 실제로 있는 폴더를 보여줍니다. 경로를 손으로 적지 않고
   눌러서 고를 수 있게 하려고 만들었습니다. 폴더 이름만 읽습니다.
   ------------------------------------------------------------------------- */
if ($action === 'listdirs') {
    $raw = trim($_GET['dir'] ?? '');
    if ($raw === '') {
        $vols = @glob('/volume*', GLOB_ONLYDIR) ?: [];
        sort($vols);
        $out = [];
        foreach ($vols as $v) $out[] = ['name' => basename($v), 'path' => $v];
        jout(['ok' => true, 'dir' => '', 'parent' => null, 'top' => true,
              'folders' => $out,
              'note' => $out ? null : 'PHP 가 볼륨을 보지 못합니다']);
    }

    $norm = normalize_nas_input($raw);
    if ($norm === null) jout(['ok' => false, 'error' => '폴더 경로를 알아보지 못했습니다'], 400);

    $bd = basedir_error($norm);
    if ($bd !== null) jout(['ok' => false, 'error' => $bd], 403);

    // 볼륨 밖은 보여주지 않습니다
    if (!preg_match('#^/volume\d+#', $norm)) {
        [$try, $tried] = resolve_nas_dir($norm);
        if ($try === null) jout(['ok' => false, 'error' => '그런 폴더가 없습니다', 'tried' => $tried], 404);
        $norm = $try;
    }
    $real = @realpath($norm);
    if ($real === false || !preg_match('#^/volume\d+#', $real)) {
        jout(['ok' => false, 'error' => '그런 폴더가 없습니다: ' . $norm], 404);
    }

    $entries = @scandir($real);
    if ($entries === false) {
        jout(['ok' => false, 'error' =>
perm_help($real)], 403);
    }

    $folders = [];
    $fileCount = 0;
    foreach ($entries as $e) {
        if ($e === '.' || $e === '..') continue;
        if ($e === '@eaDir' || $e === '#recycle' || $e === '#snapshot') continue;
        $full = $real . '/' . $e;
        if (@is_dir($full)) $folders[] = ['name' => $e, 'path' => $full];
        else $fileCount++;
    }
    usort($folders, function ($a, $b) { return strnatcasecmp($a['name'], $b['name']); });

    jout(['ok' => true, 'dir' => $real, 'top' => false,
          'parent' => preg_match('#^/volume\d+$#', $real) ? '' : dirname($real),
          'folders' => $folders, '이폴더의파일수' => $fileCount]);
}

/* ---------------- 목록 만들기 ---------------- */
/* ---------------- 상태 ---------------- */
if ($action === 'scanstatus') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => true, '진행' => '없음', 'done' => false, 'running' => false]);
    $st['running'] = true;
    jout(progress($st) + ['running' => true]);
}

/* ---------------- 중단 ---------------- */
if ($action === 'scancancel') {
    @unlink($STATE); @unlink($QUEUE); @unlink($TMP);
    jout(['ok' => true, '진행' => '중단했습니다']);
}

/* ---------------- 시작 ---------------- */
if ($action === 'scanstart') {
    $raw = $_GET['dir'] ?? '';
    if (trim($raw) === '' && is_file($DATA . '/scanroot.txt')) {
        $raw = trim(file_get_contents($DATA . '/scanroot.txt'));
    }
    if (trim($raw) === '') $raw = '/volume1';

    $norm = normalize_nas_input($raw);
    if ($norm === null) jout(['ok' => false, 'error' => '폴더 경로를 알아보지 못했습니다: ' . $raw], 400);

    $bd = basedir_error($norm);
    if ($bd !== null) jout(['ok' => false, 'error' => $bd, 'open_basedir' => @ini_get('open_basedir')], 403);

    [$root, $tried] = resolve_nas_dir($norm);
    if ($root === null) {
        jout(['ok' => false, 'error' => '그런 폴더가 없습니다', 'tried' => $tried], 404);
    }

    // 웹서버 계정이 이 폴더를 읽을 수 있는지 먼저 확인합니다.
    if (@scandir($root) === false) {
        jout(['ok' => false, 'error' =>
perm_help($root),
            '읽으려던폴더' => $root], 403);
    }

    if (!is_dir($DATA) && !@mkdir($DATA, 0775, true)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다'], 500);
    }
    if (@file_put_contents($TMP, '') === false) {
        jout(['ok' => false, 'error' =>
            'data 폴더에 쓸 수 없습니다. File Station 에서 web 폴더에 '
            . '"http" 사용자 읽기/쓰기 권한을 주세요.'], 500);
    }
    file_put_contents($QUEUE, $root . "\n");

    $st = ['root' => $root, 'qpos' => 0, 'files' => 0, 'dirs' => 0,
           'current' => $root, 'errors' => [], 'started' => microtime(true), 'done' => false];
    save_state($STATE, $st);
    jout(progress($st));
}

/* ---------------- 조금 더 훑기 ---------------- */
if ($action === 'scanstep') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => false, 'error' => '시작하지 않았습니다. 먼저 start 를 불러주세요'], 409);
    if ($st['done']) jout(progress($st));

    $out = @fopen($TMP, 'a');
    $qr  = @fopen($QUEUE, 'r');
    $qa  = @fopen($QUEUE, 'a');
    if (!$out || !$qr || !$qa) jout(['ok' => false, 'error' => '작업 파일을 열지 못했습니다'], 500);
    fseek($qr, $st['qpos']);

    $deadline = microtime(true) + $SECONDS_PER_STEP;
    $finished = false;

    while (microtime(true) < $deadline) {
        $line = fgets($qr);
        if ($line === false) { $finished = true; break; }
        $st['qpos'] = ftell($qr);

        $dir = rtrim($line, "\r\n");
        if ($dir === '') continue;
        $st['current'] = $dir;
        $st['dirs']++;

        $entries = @scandir($dir);
        if ($entries === false) {
            if (count($st['errors']) < $MAX_ERRORS) $st['errors'][] = $dir;
            continue;
        }

        foreach ($entries as $e) {
            if ($e === '.' || $e === '..') continue;
            if ($e === '@eaDir' || $e === '#recycle' || $e === '#snapshot') continue;
            if ($e === '.DS_Store' || $e === 'Thumbs.db') continue;
            if (strncmp($e, '~$', 2) === 0) continue;

            $full = $dir . '/' . $e;
            if (is_dir($full)) {
                if (is_link($full)) continue;          // 바로가기는 따라가지 않습니다
                fwrite($qa, $full . "\n");
            } elseif (is_file($full)) {
                $size = @filesize($full);
                $mt   = @filemtime($full);
                fwrite($out, date('Y-m-d', $mt ?: 0) . "\t" . (int)$size . "\t" . $full . "\n");
                $st['files']++;
            }
        }
    }

    fclose($out); fclose($qr); fclose($qa);

    if ($finished) {
        if ($st['files'] === 0) {
            @unlink($TMP); @unlink($QUEUE); @unlink($STATE);
            jout(['ok' => false, 'error' =>
                '파일을 하나도 찾지 못했습니다. 폴더가 비어 있거나 읽을 권한이 없습니다.',
                '훑은폴더' => $st['root'], '못읽은폴더' => $st['errors']], 500);
        }
        if (!@rename($TMP, $OUT)) {
            jout(['ok' => false, 'error' => '목록 파일을 저장하지 못했습니다 (쓰기 권한 확인)'], 500);
        }
        file_put_contents($ROOTF, $st['root']);
        $st['done'] = true;
        $st['목록크기'] = human(@filesize($OUT) ?: 0);
        save_state($STATE, $st);
        @unlink($QUEUE);
        $p = progress($st);
        $p['목록크기'] = $st['목록크기'];
        $p['다음'] = '완료되었습니다. 대시보드를 새로고침해 주세요.';
        jout($p);
    }

    save_state($STATE, $st);
    jout(progress($st));
}

/* ---------------- 끝난 작업 치우기 ---------------- */
if ($action === 'scanclear') {
    @unlink($STATE);
    jout(['ok' => true]);
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

/* ---------------- 공유폴더 안에서 파일 옮기기 ----------------
   흩어진 파일을 알맞은 폴더로 넣는 데 씁니다.
   원본과 목적지 모두 훑은 폴더 안이어야 하고, 덮어쓰지 않습니다.
   ------------------------------------------------------------- */
if ($action === 'movenas') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }
    $in   = json_decode(file_get_contents('php://input'), true) ?: [];
    $src  = trim($in['src'] ?? '');
    $dest = rtrim(trim($in['dest'] ?? ''), '/');
    if ($src === '' || $dest === '') jout(['ok' => false, 'error' => '옮길 파일과 폴더를 지정해 주세요'], 400);

    if (!is_file($ROOT_FILE)) {
        jout(['ok' => false, 'error' => '먼저 [🔎 목록 다시 만들기] 를 한 번 해주세요'], 400);
    }
    $nasRoot = @realpath(rtrim(trim(file_get_contents($ROOT_FILE)), '/'));
    $srcReal = @realpath($src);
    $dstReal = @realpath($dest);
    $inRoot  = function ($p) use ($nasRoot) {
        return $nasRoot && $p && ($p === $nasRoot || strpos($p, $nasRoot . DIRECTORY_SEPARATOR) === 0);
    };

    if (!$srcReal || !is_file($srcReal) || !$inRoot($srcReal)) {
        jout(['ok' => false, 'error' => '옮길 파일을 찾지 못했습니다: ' . $src], 404);
    }
    if (!$dstReal || !is_dir($dstReal) || !$inRoot($dstReal)) {
        jout(['ok' => false, 'error' => '그 폴더로는 옮길 수 없습니다. 공유폴더 안쪽만 됩니다.'], 403);
    }
    if (dirname($srcReal) === $dstReal) {
        jout(['ok' => false, 'error' => '이미 그 폴더에 있습니다'], 400);
    }
    if (!is_writable($dstReal)) jout(['ok' => false, 'error' => perm_help($dstReal)], 403);
    if (!is_writable(dirname($srcReal))) {
        jout(['ok' => false, 'error' => "원래 폴더에서 파일을 뺄 권한이 없습니다:\n"
            . dirname($srcReal) . "\n\n" . perm_help(dirname($srcReal))], 403);
    }

    // 같은 이름이 있으면 번호를 붙입니다 (덮어쓰지 않습니다)
    $base = basename($srcReal);
    $ext  = pathinfo($base, PATHINFO_EXTENSION);
    $stem = pathinfo($base, PATHINFO_FILENAME);
    $name = $base;
    $i    = 1;
    while (file_exists($dstReal . '/' . $name)) {
        $i++;
        $name = $stem . ' (' . $i . ')' . ($ext !== '' ? '.' . $ext : '');
    }
    $target = $dstReal . '/' . $name;

    if (!@rename($srcReal, $target)) {
        if (!@copy($srcReal, $target)) {
            jout(['ok' => false, 'error' => '파일을 옮기지 못했습니다 (복사 실패)'], 500);
        }
        @unlink($srcReal);
    }
    jout(['ok' => true, '옮긴곳' => $target, '파일이름' => $name]);
}

/* ---------------- 사진 미리보기 ----------------
   폴더 안 사진을 눈으로 보고 고를 수 있게 작은 그림을 만들어 줍니다.
   만든 그림은 data/thumbs 에 담아두고 다음부터는 그대로 씁니다.
   원본은 절대 건드리지 않습니다.
   ---------------------------------------------- */
$IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

/* 원본 사진을 그대로 보여줍니다 (크게 볼 때) */
if ($action === 'image') {
    $real = safe_real_path($_GET['path'] ?? '', $ROOT_FILE);
    if (!$real) jout(['ok' => false, 'error' => '볼 수 없는 파일입니다'], 403);

    $ext  = strtolower(pathinfo($real, PATHINFO_EXTENSION));
    $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
             'gif' => 'image/gif', 'webp' => 'image/webp', 'bmp' => 'image/bmp'];
    if (!isset($mime[$ext])) jout(['ok' => false, 'error' => '사진 파일이 아닙니다'], 400);

    header('Content-Type: ' . $mime[$ext]);
    header('Content-Length: ' . filesize($real));
    header('Cache-Control: private, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    while (ob_get_level()) ob_end_flush();
    readfile($real);
    exit;
}

/* 작은 그림 */
if ($action === 'thumb') {
    $real = safe_real_path($_GET['path'] ?? '', $ROOT_FILE);
    if (!$real) jout(['ok' => false, 'error' => '볼 수 없는 파일입니다'], 403);

    $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
    if (!in_array($ext, $IMG_EXT, true)) jout(['ok' => false, 'error' => '사진 파일이 아닙니다'], 400);

    $w = (int)($_GET['w'] ?? 320);
    if ($w < 80)  $w = 80;
    if ($w > 900) $w = 900;

    $thumbDir = __DIR__ . '/data/thumbs';
    if (!is_dir($thumbDir)) @mkdir($thumbDir, 0775, true);
    $key   = md5($real . '|' . filemtime($real) . '|' . filesize($real) . '|' . $w);
    $cache = $thumbDir . '/' . $key . '.jpg';

    if (is_file($cache)) {
        header('Content-Type: image/jpeg');
        header('Content-Length: ' . filesize($cache));
        header('Cache-Control: private, max-age=604800');
        while (ob_get_level()) ob_end_flush();
        readfile($cache);
        exit;
    }

    if (!extension_loaded('gd')) {
        // 그림을 줄이는 기능이 없으면 원본을 그대로 보냅니다 (느릴 수 있습니다)
        header('Location: nasfiles.php?action=image&path=' . rawurlencode($_GET['path'] ?? ''));
        exit;
    }
    if (filesize($real) > 40 * 1024 * 1024) {
        jout(['ok' => false, 'error' => '사진이 너무 큽니다 (40MB 초과)'], 413);
    }
    @ini_set('memory_limit', '512M');

    $img = null;
    if ($ext === 'jpg' || $ext === 'jpeg') $img = @imagecreatefromjpeg($real);
    elseif ($ext === 'png')  $img = @imagecreatefrompng($real);
    elseif ($ext === 'gif')  $img = @imagecreatefromgif($real);
    elseif ($ext === 'webp' && function_exists('imagecreatefromwebp')) $img = @imagecreatefromwebp($real);
    elseif ($ext === 'bmp'  && function_exists('imagecreatefrombmp'))  $img = @imagecreatefrombmp($real);
    if (!$img) jout(['ok' => false, 'error' => '사진을 열지 못했습니다'], 500);

    // 휴대폰 사진이 눕지 않도록 방향을 바로잡습니다
    if (($ext === 'jpg' || $ext === 'jpeg') && function_exists('exif_read_data')) {
        $ex = @exif_read_data($real);
        $or = $ex['Orientation'] ?? 0;
        if ($or == 3) $img = imagerotate($img, 180, 0);
        elseif ($or == 6) $img = imagerotate($img, -90, 0);
        elseif ($or == 8) $img = imagerotate($img, 90, 0);
    }

    $ow = imagesx($img);
    $oh = imagesy($img);
    $nw = min($w, $ow);
    $nh = (int)round($oh * ($nw / $ow));
    if ($nh < 1) $nh = 1;

    $out = imagecreatetruecolor($nw, $nh);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $ow, $oh);
    imagedestroy($img);

    @imagejpeg($out, $cache, 82);
    header('Content-Type: image/jpeg');
    header('Cache-Control: private, max-age=604800');
    while (ob_get_level()) ob_end_flush();
    imagejpeg($out, null, 82);
    imagedestroy($out);
    exit;
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
    if (!$fp) { http_response_code(200); exit; }
    while (!feof($fp)) { echo fread($fp, 262144); flush(); }
    fclose($fp);
    exit;
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
