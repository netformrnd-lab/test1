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

$DATA   = __DIR__ . '/data';
$OUT    = $DATA . '/nasfiles.tsv';
$TMP    = $DATA . '/nasfiles.tsv.part';
$QUEUE  = $DATA . '/scanqueue.txt';
$STATE  = $DATA . '/scanstate.json';
$ROOTF  = $DATA . '/nasroot.txt';

$SECONDS_PER_STEP = 3.0;   // 한 번에 일하는 시간
$MAX_ERRORS       = 20;

function jout($a, $code = 200) {
    http_response_code($code);
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

    [$root, $tried] = resolve_nas_dir($norm);
    if ($root === null) {
        jout(['ok' => false, 'error' => '그런 폴더가 없습니다', 'tried' => $tried], 404);
    }

    // 웹서버 계정이 이 폴더를 읽을 수 있는지 먼저 확인합니다.
    if (@scandir($root) === false) {
        jout(['ok' => false, 'error' =>
            '이 폴더를 읽을 권한이 없습니다: ' . $root . "\n\n"
            . 'File Station 에서 이 공유폴더를 오른쪽 클릭 → 속성 → 권한 에서 '
            . '"http" 사용자에게 읽기 권한을 주고, "하위 폴더에 적용" 을 체크해 주세요.',
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
