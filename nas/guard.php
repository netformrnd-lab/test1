<?php
/**
 * 문지기 — 다른 php 파일들이 맨 위에서 한 줄로 부릅니다.
 *
 *   if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';
 *
 * 계정을 아직 하나도 안 만들었으면 아무나 쓸 수 있습니다 (예전과 같음).
 * 계정을 만든 뒤에는 로그인한 사람만 통과합니다.
 * 퇴사자를 「사용 중지」 하면 그 사람이 열어둔 화면까지 그 자리에서 끊깁니다.
 *
 * ⚠️ 사무실 안(http)에서만 씁니다. https 가 아니라서 비밀번호가
 *    사내망을 그냥 지나갑니다. 바깥에서 접속할 일이 생기면
 *    Web Station 에서 https 를 먼저 켜세요.
 */

if (!function_exists('guard_jout')) {
    function guard_jout($a, $code = 200) {
        if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
        http_response_code(200);        // 웹 스테이션이 오류 응답을 바꿔치기 하므로 항상 200
        if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
        echo json_encode($a, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

/** 지금 들어와 있는 사람 (없으면 null). 계정 자체가 없으면 '누구나' 를 뜻하는 배열 */
function guard_user() {
    static $cached = false, $val = null;
    if ($cached) return $val;
    $cached = true;

    $DATA    = __DIR__ . '/data';
    $USERS   = $DATA . '/users.php';
    $SESSDIR = $DATA . '/sessions';

    // include 를 쓰면 PHP 코드 캐시가 옛 목록을 들고 있어 퇴사 처리가 늦게 먹습니다.
    // 그래서 글자로 직접 읽습니다.
    clearstatcache(true, $USERS);
    $list = [];
    if (is_file($USERS)) {
        $raw = (string)@file_get_contents($USERS);
        $nl  = strpos($raw, "\n");
        if ($nl !== false) {
            $j = json_decode(substr($raw, $nl + 1), true);
            if (is_array($j)) $list = $j;
        }
    }
    if (!count($list)) {
        $val = ['id' => '', 'name' => '', 'admin' => true, 'open' => true];
        return $val;
    }

    $sid = $_COOKIE['brandhub_sid'] ?? '';
    if (!preg_match('/^[0-9a-f]{64}$/', (string)$sid)) return $val = null;
    $p = $SESSDIR . '/' . $sid . '.json';
    if (!is_file($p)) return $val = null;
    $s = json_decode((string)@file_get_contents($p), true);
    if (!is_array($s) || ($s['until'] ?? 0) < time()) { @unlink($p); return $val = null; }

    foreach ($list as $u) {
        if (($u['id'] ?? '') === ($s['uid'] ?? '')) {
            if (empty($u['active'])) return $val = null;      // 정지된 계정
            $u['open'] = false;
            return $val = $u;
        }
    }
    return $val = null;                                        // 지워진 계정
}

/** 로그인한 사람의 이름 (기록용). 계정을 안 쓰면 빈 문자열 */
function guard_name() {
    $u = guard_user();
    return $u ? (string)($u['name'] ?? $u['id'] ?? '') : '';
}

/** 관리자인가 */
function guard_is_admin() {
    $u = guard_user();
    return $u && !empty($u['admin']);
}

/* ---- 통과 검사 ---------------------------------------------------- */
$__guard_me = guard_user();
if ($__guard_me === null) {
    guard_jout([
        'ok'        => false,
        'error'     => '로그인이 필요합니다.',
        '로그인필요' => true,
    ], 401);
}
