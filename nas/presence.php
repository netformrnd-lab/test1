<?php
/**
 * 지금 대시보드를 보고 있는 사람
 *
 * 각자의 브라우저가 몇 초마다 "나 여기 있어요" 를 알려주면,
 * 그걸 모아서 "지금 누가 어디를 보고 있는지" 를 돌려줍니다.
 *
 *   ?action=ping&id=...&name=홍길동&where=아파트스퀘어
 *   ?action=list
 *
 * 이름과 보고 있는 화면 말고는 아무것도 저장하지 않습니다.
 * 5분 넘게 소식이 없으면 자동으로 지워집니다.
 */

/* 로그인한 사람만 통과합니다 (계정을 안 만들었으면 예전처럼 누구나) */
if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';   // 파일이 아직 안 왔으면 예전처럼 동작합니다
if (PHP_SAPI === 'cli') {
    parse_str(implode('&', array_slice($argv, 1)), $cliQ);
    $_GET = array_merge($_GET, $cliQ);
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
ob_start();
register_shutdown_function(function () {
    $e = error_get_last();
    $fatal = $e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
    if (!ob_get_level()) return;
    if ($fatal) {
        ob_end_clean();
        if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '서버 오류: ' . $e['message']], JSON_UNESCAPED_UNICODE);
    } else { ob_end_flush(); }
});

$DIR   = __DIR__ . '/data/presence';
$ALIVE = 45;      // 45초 안에 소식이 있으면 '보고 있는 중'
$STALE = 300;     // 5분 넘으면 파일을 지웁니다

function jout($a) {
    http_response_code(200);                      // 오류도 200 으로 (웹 스테이션 대응)
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

/** 이름·화면 이름을 짧고 안전하게 다듬습니다 */
function clean_txt($v, $max = 24) {
    $v = preg_replace('/[\x00-\x1f<>"\\\\]+/u', '', (string)$v);
    $v = trim(preg_replace('/\s+/u', ' ', $v));
    return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max * 3);
}

if (!is_dir($DIR) && !@mkdir($DIR, 0775, true) && !is_dir($DIR)) {
    jout(['ok' => false, 'error' => '보관 폴더를 만들지 못했습니다: ' . $DIR]);
}

$action = $_GET['action'] ?? 'list';
$now    = time();

// 오래된 것 치우기
foreach ((array)@glob($DIR . '/*.json') as $f) {
    if ($now - (int)@filemtime($f) > $STALE) @unlink($f);
}

if ($action === 'ping') {
    $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_GET['id'] ?? ''));
    if ($id === '' || strlen($id) > 40) jout(['ok' => false, 'error' => '잘못된 id']);

    $rec = ['name'  => clean_txt($_GET['name'] ?? ''),
            'where' => clean_txt($_GET['where'] ?? ''),
            'at'    => $now];

    $f   = $DIR . '/' . $id . '.json';
    $tmp = $f . '.tmp' . getmypid();
    if (@file_put_contents($tmp, json_encode($rec, JSON_UNESCAPED_UNICODE)) !== false) {
        @rename($tmp, $f);
        @chmod($f, 0664);
    } else {
        @unlink($tmp);
    }
    $me = $id;
} else {
    $me = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_GET['id'] ?? ''));
}

$people = [];
foreach ((array)@glob($DIR . '/*.json') as $f) {
    $mt = (int)@filemtime($f);
    if ($now - $mt > $ALIVE) continue;
    $j = json_decode((string)@file_get_contents($f), true);
    if (!is_array($j)) continue;
    $id = basename($f, '.json');
    $people[] = [
        'id'    => $id,
        '이름'  => $j['name'] !== '' ? $j['name'] : '이름 없음',
        '보는곳' => $j['where'] ?? '',
        '나인가' => ($id === $me),
        '몇초전' => max(0, $now - $mt),
    ];
}
usort($people, function ($a, $b) {
    if ($a['나인가'] !== $b['나인가']) return $a['나인가'] ? -1 : 1;
    return strcmp($a['이름'], $b['이름']);
});

jout(['ok' => true, '사람' => $people, '인원' => count($people)]);
