<?php
/**
 * 로그인 · 사람 관리
 *
 *   ?action=state                지금 로그인한 사람 / 계정이 하나라도 있는지
 *   ?action=setup   (POST)       맨 처음 관리자 만들기 (계정이 없을 때만)
 *   ?action=login   (POST)       아이디·비밀번호로 들어오기
 *   ?action=logout  (POST)       나가기
 *   ?action=passwd  (POST)       내 비밀번호 바꾸기
 *   ?action=users                사람 목록 (관리자만)
 *   ?action=adduser (POST)       사람 추가 (관리자만)
 *   ?action=setuser (POST)       이름·권한·사용여부 바꾸기 / 비밀번호 초기화 (관리자만)
 *   ?action=deluser (POST)       사람 지우기 (관리자만)
 *
 * 아이디·비밀번호는 data/users.php 에 PHP 파일로 둡니다.
 * 주소로 직접 열어도 내용이 보이지 않고 빈 화면이 나옵니다.
 * 비밀번호는 password_hash() 로 바꿔서 저장하며, 원문은 어디에도 남기지 않습니다.
 *
 * ⚠️ 이 대시보드는 사무실 안(http)에서만 씁니다. https 가 아니라서
 *    비밀번호가 사내망을 그냥 지나갑니다. 바깥에서 접속하게 하려면
 *    반드시 Web Station 에서 https 를 켜고 쓰세요.
 */

header('Content-Type: application/json; charset=utf-8');
@ini_set('display_errors', '0');

$DATA     = __DIR__ . '/data';
$USERS    = $DATA . '/users.php';
$SESSDIR  = $DATA . '/sessions';
$COOKIE   = 'brandhub_sid';
$SESS_DAYS = 14;                 // 이만큼 지나면 다시 로그인
$MAX_TRY   = 8;                  // 비밀번호 연속 실패 허용 횟수
$LOCK_MIN  = 10;                 // 그 뒤 잠기는 시간(분)

function jout($a, $code = 200) {
    http_response_code(200);     // 웹 스테이션이 오류 응답을 바꿔치기 하므로 항상 200
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------- 사람 목록 읽고 쓰기 ----------
   .php 파일이지만 include 하지 않고 글자로 읽습니다.
   include 를 쓰면 PHP 의 코드 캐시(opcache)가 옛 내용을 그대로 들고 있어서,
   퇴사 처리를 해도 한동안 그대로 들어와지는 일이 생깁니다.
   맨 앞의 <?php exit; 때문에 주소로 직접 열면 빈 화면만 나옵니다.        */
define('USERS_HEAD', "<?php exit; /* 대시보드 사용자 목록 — 손으로 고치지 마세요 */ ?>\n");

function users_load($f) {
    clearstatcache(true, $f);
    if (!is_file($f)) return [];
    $raw = (string)@file_get_contents($f);
    $nl  = strpos($raw, "\n");
    if ($nl === false) return [];
    $j = json_decode(substr($raw, $nl + 1), true);
    return is_array($j) ? $j : [];
}
function users_save($f, $list) {
    $txt = USERS_HEAD . json_encode(array_values($list),
        JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $tmp = $f . '.tmp';
    if (@file_put_contents($tmp, $txt, LOCK_EX) === false) return false;
    @chmod($tmp, 0640);
    if (!@rename($tmp, $f)) { @unlink($tmp); return false; }
    clearstatcache(true, $f);
    return true;
}

/* ---------- 로그인 표(세션) ---------- */
function sess_path($dir, $sid) { return $dir . '/' . $sid . '.json'; }

function sess_new($dir, $uid, $days) {
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) return null;
    $sid = bin2hex(random_bytes(32));
    $ok = @file_put_contents(sess_path($dir, $sid), json_encode([
        'uid' => $uid, 'at' => time(), 'until' => time() + $days * 86400,
        'ip'  => $_SERVER['REMOTE_ADDR'] ?? '',
    ], JSON_UNESCAPED_UNICODE), LOCK_EX);
    if ($ok === false) return null;
    @chmod(sess_path($dir, $sid), 0660);
    return $sid;
}

function sess_read($dir, $sid) {
    if (!preg_match('/^[0-9a-f]{64}$/', (string)$sid)) return null;
    $p = sess_path($dir, $sid);
    if (!is_file($p)) return null;
    $j = json_decode((string)@file_get_contents($p), true);
    if (!is_array($j)) return null;
    if (($j['until'] ?? 0) < time()) { @unlink($p); return null; }
    return $j;
}

function sess_kill($dir, $sid) {
    if (preg_match('/^[0-9a-f]{64}$/', (string)$sid)) @unlink(sess_path($dir, $sid));
}

/* 그 사람의 로그인을 전부 끊습니다 (퇴사·계정 정지·비밀번호 변경) */
function sess_kill_user($dir, $uid) {
    if (!is_dir($dir)) return 0;
    $n = 0;
    foreach ((array)@scandir($dir) as $f) {
        if (substr($f, -5) !== '.json') continue;
        $j = json_decode((string)@file_get_contents($dir . '/' . $f), true);
        if (is_array($j) && ($j['uid'] ?? '') === $uid) { @unlink($dir . '/' . $f); $n++; }
    }
    return $n;
}

/* 만료된 것을 이따금 치웁니다 */
function sess_sweep($dir) {
    if (!is_dir($dir)) return;
    foreach ((array)@scandir($dir) as $f) {
        if (substr($f, -5) !== '.json') continue;
        $p = $dir . '/' . $f;
        $j = json_decode((string)@file_get_contents($p), true);
        if (!is_array($j) || ($j['until'] ?? 0) < time()) @unlink($p);
    }
}

/* ---------- 지금 들어와 있는 사람 ---------- */
function current_user($users, $sessdir, $cookie) {
    $sid = $_COOKIE[$cookie] ?? '';
    $s = sess_read($sessdir, $sid);
    if (!$s) return null;
    foreach ($users as $u) {
        if (($u['id'] ?? '') === ($s['uid'] ?? '')) {
            if (empty($u['active'])) return null;      // 정지된 계정이면 못 들어옵니다
            return $u;
        }
    }
    return null;                                        // 지워진 계정
}

function pub_user($u) {
    return ['id' => $u['id'], '이름' => $u['name'] ?? $u['id'],
            '권한' => !empty($u['admin']) ? '관리자' : '팀원',
            '쓸수있음' => !empty($u['active']),
            '마지막들어온때' => $u['lastAt'] ?? null];
}

function id_ok($id) { return (bool)preg_match('/^[a-zA-Z0-9._-]{2,32}$/', (string)$id); }

function pw_problem($pw) {
    $pw = (string)$pw;
    if (strlen($pw) < 8) return '비밀번호는 8글자 이상이어야 합니다';
    if (preg_match('/^[0-9]+$/', $pw)) return '숫자만으로는 안 됩니다 (0000 같은 것)';
    $easy = ['password', '12345678', 'qwerty', 'abc12345', '11111111', 'netform'];
    foreach ($easy as $e) {
        if (stripos($pw, $e) !== false) {
            return '「' . $e . '」 가 들어간 비밀번호는 쓸 수 없습니다 (너무 쉽게 짐작됩니다)';
        }
    }
    return null;
}

$action = $_GET['action'] ?? '';
$users  = users_load($USERS);
$me     = current_user($users, $SESSDIR, $COOKIE);
if (random_int(1, 20) === 1) sess_sweep($SESSDIR);      // 가끔 치웁니다

function need_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $b = json_decode((string)file_get_contents('php://input'), true);
    return is_array($b) ? $b : [];
}
function need_admin($me) {
    if (!$me) jout(['ok' => false, 'error' => '로그인이 필요합니다', '로그인필요' => true], 401);
    if (empty($me['admin'])) jout(['ok' => false, 'error' => '관리자만 할 수 있습니다'], 403);
}

/* ---------------- 지금 상태 ---------------- */
if ($action === 'state') {
    jout([
        'ok'        => true,
        '계정있음'   => count($users) > 0,
        '로그인됨'   => $me !== null,
        '나'        => $me ? pub_user($me) : null,
        'https'     => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
}

/* ---------------- 맨 처음 관리자 만들기 ---------------- */
if ($action === 'setup') {
    if (count($users) > 0) jout(['ok' => false, 'error' => '이미 계정이 있습니다. 로그인해 주세요.'], 409);
    $b  = need_post();
    $id = trim((string)($b['id'] ?? ''));
    $nm = trim((string)($b['name'] ?? ''));
    $pw = (string)($b['pw'] ?? '');
    if (!id_ok($id)) jout(['ok' => false, 'error' => '아이디는 영문·숫자 2~32글자로 지어주세요'], 400);
    if ($nm === '') $nm = $id;
    $bad = pw_problem($pw);
    if ($bad) jout(['ok' => false, 'error' => $bad], 400);

    $users = [[
        'id' => $id, 'name' => mb_substr($nm, 0, 40, 'UTF-8'),
        'hash' => password_hash($pw, PASSWORD_DEFAULT),
        'admin' => true, 'active' => true,
        'createdAt' => date('c'), 'lastAt' => null, 'fail' => 0, 'lockUntil' => 0,
    ]];
    if (!users_save($USERS, $users)) {
        jout(['ok' => false, 'error' => 'data 폴더에 저장하지 못했습니다 (쓰기 권한 확인)'], 500);
    }
    $sid = sess_new($SESSDIR, $id, $SESS_DAYS);
    if ($sid) setcookie($COOKIE, $sid, ['expires' => time() + $SESS_DAYS * 86400,
        'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    jout(['ok' => true, '나' => pub_user($users[0])]);
}

/* ---------------- 들어오기 ---------------- */
if ($action === 'login') {
    $b  = need_post();
    $id = trim((string)($b['id'] ?? ''));
    $pw = (string)($b['pw'] ?? '');

    $idx = -1;
    foreach ($users as $i => $u) { if (($u['id'] ?? '') === $id) { $idx = $i; break; } }

    // 아이디가 없어도 있는 것과 같은 시간이 걸리게 해서, 아이디 존재 여부를 숨깁니다
    if ($idx < 0) {
        password_verify($pw, '$2y$10$usesomesillystringfoxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
        jout(['ok' => false, 'error' => '아이디 또는 비밀번호가 맞지 않습니다'], 401);
    }
    $u = $users[$idx];

    if (($u['lockUntil'] ?? 0) > time()) {
        $left = (int)ceil((($u['lockUntil'] ?? 0) - time()) / 60);
        jout(['ok' => false, 'error' => "비밀번호를 여러 번 틀려 잠겼습니다. {$left}분 뒤에 다시 해주세요."], 429);
    }
    if (empty($u['active'])) {
        jout(['ok' => false, 'error' =>
            '이 계정은 사용이 중지되었습니다. 관리자에게 문의해 주세요.'], 403);
    }
    if (!password_verify($pw, (string)($u['hash'] ?? ''))) {
        $users[$idx]['fail'] = (int)($u['fail'] ?? 0) + 1;
        if ($users[$idx]['fail'] >= $MAX_TRY) {
            $users[$idx]['lockUntil'] = time() + $LOCK_MIN * 60;
            $users[$idx]['fail'] = 0;
        }
        users_save($USERS, $users);
        $left = $MAX_TRY - (int)$users[$idx]['fail'];
        jout(['ok' => false, 'error' => '아이디 또는 비밀번호가 맞지 않습니다'
            . ($left > 0 && $left <= 3 ? "\n({$left}번 더 틀리면 잠깁니다)" : '')], 401);
    }

    // 예전 방식으로 저장된 것이 있으면 지금 방식으로 다시 만들어 둡니다
    if (password_needs_rehash((string)$u['hash'], PASSWORD_DEFAULT)) {
        $users[$idx]['hash'] = password_hash($pw, PASSWORD_DEFAULT);
    }
    $users[$idx]['fail'] = 0;
    $users[$idx]['lockUntil'] = 0;
    $users[$idx]['lastAt'] = date('c');
    users_save($USERS, $users);

    $sid = sess_new($SESSDIR, $id, $SESS_DAYS);
    if (!$sid) jout(['ok' => false, 'error' => '로그인 정보를 저장하지 못했습니다 (data 폴더 권한)'], 500);
    setcookie($COOKIE, $sid, ['expires' => time() + $SESS_DAYS * 86400,
        'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    jout(['ok' => true, '나' => pub_user($users[$idx])]);
}

/* ---------------- 나가기 ---------------- */
if ($action === 'logout') {
    sess_kill($SESSDIR, $_COOKIE[$COOKIE] ?? '');
    setcookie($COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
    jout(['ok' => true]);
}

/* ---------------- 내 비밀번호 바꾸기 ---------------- */
if ($action === 'passwd') {
    if (!$me) jout(['ok' => false, 'error' => '로그인이 필요합니다', '로그인필요' => true], 401);
    $b   = need_post();
    $old = (string)($b['old'] ?? '');
    $new = (string)($b['new'] ?? '');
    if (!password_verify($old, (string)$me['hash'])) {
        jout(['ok' => false, 'error' => '지금 쓰는 비밀번호가 맞지 않습니다'], 401);
    }
    $bad = pw_problem($new);
    if ($bad) jout(['ok' => false, 'error' => $bad], 400);

    foreach ($users as $i => $u) {
        if (($u['id'] ?? '') === $me['id']) {
            $users[$i]['hash'] = password_hash($new, PASSWORD_DEFAULT);
            $users[$i]['mustChange'] = false;
        }
    }
    if (!users_save($USERS, $users)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);

    // 다른 곳에서 열어둔 것은 모두 끊고, 지금 이 창만 다시 이어줍니다
    sess_kill_user($SESSDIR, $me['id']);
    $sid = sess_new($SESSDIR, $me['id'], $SESS_DAYS);
    if ($sid) setcookie($COOKIE, $sid, ['expires' => time() + $SESS_DAYS * 86400,
        'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    jout(['ok' => true, '안내' => '바꿨습니다. 다른 컴퓨터에서 열어둔 것은 모두 로그아웃됐습니다.']);
}

/* ---------------- 사람 목록 ---------------- */
if ($action === 'users') {
    need_admin($me);
    $out = array_map('pub_user', $users);
    usort($out, function ($a, $b2) { return strcmp($a['id'], $b2['id']); });
    jout(['ok' => true, '사람' => $out]);
}

/* ---------------- 사람 추가 ---------------- */
if ($action === 'adduser') {
    need_admin($me);
    $b  = need_post();
    $id = trim((string)($b['id'] ?? ''));
    $nm = trim((string)($b['name'] ?? ''));
    $pw = (string)($b['pw'] ?? '');
    if (!id_ok($id)) jout(['ok' => false, 'error' => '아이디는 영문·숫자 2~32글자로 지어주세요'], 400);
    foreach ($users as $u) {
        if (strcasecmp((string)$u['id'], $id) === 0) {
            jout(['ok' => false, 'error' => '이미 있는 아이디입니다'], 409);
        }
    }
    $bad = pw_problem($pw);
    if ($bad) jout(['ok' => false, 'error' => $bad], 400);

    $users[] = [
        'id' => $id, 'name' => mb_substr($nm !== '' ? $nm : $id, 0, 40, 'UTF-8'),
        'hash' => password_hash($pw, PASSWORD_DEFAULT),
        'admin' => !empty($b['admin']), 'active' => true,
        'createdAt' => date('c'), 'lastAt' => null, 'fail' => 0, 'lockUntil' => 0,
        'mustChange' => true,
    ];
    if (!users_save($USERS, $users)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);
    jout(['ok' => true, '안내' => $id . ' 을(를) 넣었습니다. 첫 로그인 뒤 비밀번호를 바꾸게 하세요.']);
}

/* ---------------- 사람 고치기 (퇴사 처리 포함) ---------------- */
if ($action === 'setuser') {
    need_admin($me);
    $b  = need_post();
    $id = trim((string)($b['id'] ?? ''));

    $idx = -1;
    foreach ($users as $i => $u) { if (($u['id'] ?? '') === $id) { $idx = $i; break; } }
    if ($idx < 0) jout(['ok' => false, 'error' => '그런 사람이 없습니다'], 404);

    // 관리자가 하나도 없어지는 것은 막습니다
    $admins = 0;
    foreach ($users as $u) { if (!empty($u['admin']) && !empty($u['active'])) $admins++; }
    $losing = (!empty($users[$idx]['admin']) && !empty($users[$idx]['active']))
        && ((isset($b['admin']) && !$b['admin']) || (isset($b['active']) && !$b['active']));
    if ($losing && $admins <= 1) {
        jout(['ok' => false, 'error' =>
            '마지막 관리자입니다. 다른 사람을 관리자로 만든 뒤에 바꿔주세요.'], 409);
    }

    if (isset($b['name']) && trim((string)$b['name']) !== '') {
        $users[$idx]['name'] = mb_substr(trim((string)$b['name']), 0, 40, 'UTF-8');
    }
    if (isset($b['admin']))  $users[$idx]['admin']  = (bool)$b['admin'];
    if (isset($b['active'])) $users[$idx]['active'] = (bool)$b['active'];

    $note = [];
    if (isset($b['pw']) && (string)$b['pw'] !== '') {          // 비밀번호 초기화
        $bad = pw_problem((string)$b['pw']);
        if ($bad) jout(['ok' => false, 'error' => $bad], 400);
        $users[$idx]['hash'] = password_hash((string)$b['pw'], PASSWORD_DEFAULT);
        $users[$idx]['mustChange'] = true;
        $users[$idx]['fail'] = 0;
        $users[$idx]['lockUntil'] = 0;
        $note[] = '비밀번호를 새로 정했습니다';
    }
    if (!users_save($USERS, $users)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);

    // 정지·비밀번호 변경이면 그 사람이 열어둔 창을 지금 바로 끊습니다
    if (empty($users[$idx]['active']) || $note) {
        $n = sess_kill_user($SESSDIR, $id);
        if (empty($users[$idx]['active'])) {
            $note[] = '지금 열려 있던 화면 ' . $n . '개를 바로 끊었습니다';
        }
    }
    jout(['ok' => true, '안내' => implode(' · ', $note) ?: '바꿨습니다',
          '사람' => pub_user($users[$idx])]);
}

/* ---------------- 사람 지우기 ---------------- */
if ($action === 'deluser') {
    need_admin($me);
    $b  = need_post();
    $id = trim((string)($b['id'] ?? ''));
    if ($id === $me['id']) jout(['ok' => false, 'error' => '자기 계정은 지울 수 없습니다'], 400);

    $left = [];
    $found = false;
    foreach ($users as $u) {
        if (($u['id'] ?? '') === $id) { $found = true; continue; }
        $left[] = $u;
    }
    if (!$found) jout(['ok' => false, 'error' => '그런 사람이 없습니다'], 404);

    $admins = 0;
    foreach ($left as $u) { if (!empty($u['admin']) && !empty($u['active'])) $admins++; }
    if ($admins < 1) jout(['ok' => false, 'error' => '관리자가 한 명도 남지 않습니다'], 409);

    if (!users_save($USERS, $left)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);
    $n = sess_kill_user($SESSDIR, $id);
    jout(['ok' => true, '안내' => $id . ' 을(를) 지웠습니다 (열려 있던 화면 ' . $n . '개도 끊었습니다)']);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다: ' . $action], 400);
