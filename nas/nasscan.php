<?php
/**
 * NAS 파일 목록 만들기 — 대시보드에서 직접 실행하는 방식
 *
 * 작업 스케줄러 없이 브라우저에서 조금씩 나눠 훑습니다.
 * 한 번 요청에 몇 초씩만 일하고 돌아오기 때문에
 * 파일이 수만 개라도 시간 초과로 끊기지 않습니다.
 *
 *   ?action=start&dir=...   훑기 시작
 *   ?action=step            조금 더 훑기 (브라우저가 반복해서 부릅니다)
 *   ?action=status          지금 상태
 *   ?action=cancel          중단
 *
 * 파일을 옮기거나 고치지 않습니다. 읽기만 합니다.
 */

header('Content-Type: application/json; charset=utf-8');
@set_time_limit(0);
@ini_set('memory_limit', '256M');

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

$DATA   = __DIR__ . '/data';
$OUT    = $DATA . '/nasfiles.tsv';
$TMP    = $DATA . '/nasfiles.tsv.part';
$QUEUE  = $DATA . '/scanqueue.txt';
$STATE  = $DATA . '/scanstate.json';
$ROOTF  = $DATA . '/nasroot.txt';

$SECONDS_PER_STEP = 3.0;   // 한 번에 일하는 시간
$MAX_ERRORS       = 20;

function jout($a, $code = 200) {
    // 웹 스테이션이 200 이 아닌 응답의 내용을 자기 오류 페이지로 바꿔치기 하므로,
    // 항상 200 으로 보내고 실패 여부는 JSON 안의 ok 로만 알립니다.
    http_response_code(200);
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

function human($b) {
    if ($b < 1024) return $b . ' B';
    if ($b < 1048576) return round($b / 1024) . ' KB';
    if ($b < 1073741824) return round($b / 1048576, 1) . ' MB';
    return round($b / 1073741824, 2) . ' GB';
}

/* Y:\... , \\서버\... , /volume1/... 을 모두 받아들입니다 */
function normalize_nas_input($raw) {
    $p = trim((string)$raw);
    $p = str_replace('\\', '/', $p);
    $p = preg_replace('#^//[^/]+/#', '/', $p);
    $p = preg_replace('#^[A-Za-z]:/#', '/', $p);
    $p = preg_replace('#/+#', '/', $p);
    $p = rtrim($p, '/');
    if ($p === '' || $p[0] !== '/') return null;
    return $p;
}

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

function load_state($f) {
    if (!is_file($f)) return null;
    $s = json_decode(file_get_contents($f), true);
    return is_array($s) ? $s : null;
}

function save_state($f, $s) {
    file_put_contents($f, json_encode($s, JSON_UNESCAPED_UNICODE));
}

/* 진행 상황을 사람이 읽기 좋게 */
function progress($st) {
    return [
        'ok'        => true,
        '진행'      => $st['done'] ? '완료' : '진행 중',
        'done'      => (bool)$st['done'],
        '훑을폴더'  => $st['root'],
        '찾은파일'  => $st['files'],
        '훑은폴더수' => $st['dirs'],
        '지금폴더'  => $st['current'],
        '걸린시간'  => round(microtime(true) - $st['started']) . '초',
        '못읽은폴더' => $st['errors'],
    ];
}

$action = $_GET['action'] ?? '';

/* ---------------- 상태 ---------------- */
if ($action === 'status') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => true, '진행' => '없음', 'done' => false, 'running' => false]);
    $st['running'] = true;
    jout(progress($st) + ['running' => true]);
}

/* ---------------- 중단 ---------------- */
if ($action === 'cancel') {
    @unlink($STATE); @unlink($QUEUE); @unlink($TMP);
    jout(['ok' => true, '진행' => '중단했습니다']);
}

/* ---------------- 시작 ---------------- */
if ($action === 'start') {
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
if ($action === 'step') {
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
if ($action === 'clear') {
    @unlink($STATE);
    jout(['ok' => true]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다: ' . $action], 400);
