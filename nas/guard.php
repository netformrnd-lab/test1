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

/* ═══════════════ 자료 파일 (주소로 열어도 안 보이게) ═══════════════
   data/brand-data.json 은 주소를 알면 브라우저로 그냥 열립니다.
   (사무실 안이라도 로그인 없이 내용이 다 보이는 셈입니다)
   그래서 파일을 .php 로 두고 첫 줄에 「exit」 를 넣습니다.
   주소로 열면 빈 화면이 나오고, 프로그램은 첫 줄만 건너뛰고 읽습니다.
   예전 .json 파일이 있으면 처음 읽을 때 자동으로 옮겨옵니다.
   ================================================================= */
const BH_SHIELD = "<?php exit; /* 브랜드 대시보드 자료 — 주소로 열면 보이지 않습니다 */ ?>\n";

/** 자료 파일 자리 (.php) */
function bh_data_path($dir) { return $dir . '/brand-data.php'; }

/** 방패를 걷어내고 알맹이만 돌려줍니다 (.json 파일도 그대로 읽힙니다) */
function bh_strip($raw) {
    if (!is_string($raw) || $raw === '') return '';
    if (substr($raw, 0, 5) === '<?php') {
        $nl = strpos($raw, "\n");
        return $nl === false ? '' : substr($raw, $nl + 1);
    }
    return $raw;
}

/** 파일에서 알맹이(JSON 글자)를 읽습니다. 없으면 빈 글자 */
function bh_read_raw($path) {
    clearstatcache(true, $path);
    if (!is_file($path)) return '';
    return bh_strip((string)@file_get_contents($path));
}

/** 방패를 붙여 통째로 씁니다 (반쪽짜리가 읽히지 않게 임시 파일 → 이름 바꾸기) */
function bh_write_raw($path, $json) {
    $tmp = $path . '.tmp' . getmypid();
    $body = BH_SHIELD . $json;
    $n = @file_put_contents($tmp, $body);
    if ($n === false || $n !== strlen($body) || !@rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, 0664);
    return true;
}

/** 예전 .json 을 .php 로 한 번만 옮깁니다 (백업 파일도 같이).
 *  옮기지 못하면(권한 등) 예전 파일을 그대로 씁니다 — 자료를 잃지 않는 쪽으로. */
function bh_migrate($dir) {
    static $done = [];
    if (isset($done[$dir])) return $done[$dir];

    $new = bh_data_path($dir);
    if (is_file($new)) return $done[$dir] = $new;      // 이미 옮겨둔 뒤에는 더 볼 것이 없습니다

    $old = $dir . '/brand-data.json';
    if (is_file($old)) {
        $raw = bh_strip((string)@file_get_contents($old));
        if ($raw === '' || json_decode($raw) === null) return $done[$dir] = $old;   // 읽지 못하면 그대로
        if (!bh_write_raw($new, $raw) || bh_read_raw($new) !== $raw) {
            @unlink($new);
            return $done[$dir] = $old;                 // 새 파일을 못 만들면 예전 것을 씁니다
        }
        @unlink($old);
    }
    // 백업도 주소로 열리면 마찬가지라서 같이 가려둡니다 (옮길 때 한 번만)
    foreach ((array)@glob($dir . '/backup-*.json') as $b) {
        $to = preg_replace('/\.json$/', '.php', $b);
        if ($to && !is_file($to)) {
            $raw = bh_strip((string)@file_get_contents($b));
            if ($raw !== '' && bh_write_raw($to, $raw)) @unlink($b);
        }
    }
    return $done[$dir] = $new;
}

/** 지금 쓸 자료 파일 (필요하면 옮기고 나서) */
function bh_data_file($dir) { return bh_migrate($dir); }

/** 할 일은 맡은 사람만 봅니다 — 팀원에게 보낼 자료에서 남의 할 일을 뺍니다.
 *  관리자와, 계정을 아직 안 쓰는 경우에는 그대로 둡니다. */
function guard_hide_tasks($d) {
    $me = guard_user();
    if (!$me || !empty($me['open']) || !empty($me['admin'])) return $d;
    if (!is_array($d) || empty($d['brands']) || !is_array($d['brands'])) return $d;
    $mine = (string)($me['id'] ?? '');
    foreach ($d['brands'] as &$b) {
        if (empty($b['tasks']) || !is_array($b['tasks'])) continue;
        $b['tasks'] = array_values(array_filter($b['tasks'], function ($t) use ($mine) {
            $u = isset($t['uid']) ? (string)$t['uid'] : '';
            return $u === '' || $u === $mine;          // 공용이거나 내 것
        }));
    }
    unset($b);
    return $d;
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
