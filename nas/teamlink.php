<?php
/**
 * 🔗 팀끼리 할 일 <<진짜 연동>> — 한 저장소를 같이 읽고 씁니다
 *
 * 근무현황 캘린더를 연결한 것과 같은 틀입니다. 거기서는 「(주)넷폼알앤디
 * 근무현황 캘린더」가 쓰는 파이어베이스를 우리가 같이 읽었습니다. 아파트
 * 스퀘어도 같은 저장소(sq_vc_shared)를 씁니다. 그래서 파일을 주고받지
 * 않아도 서로 같은 것을 봅니다.
 *
 * 할 일도 같게 합니다. 다만 이번에는 <<읽기만>> 이 아니라 <<쓰기도>>
 * 합니다 — 양쪽에서 고칠 수 있어야 연동입니다.
 *
 *   ?action=check              지금 설정과 상태
 *   ?action=setup   (POST)     저장소 주소 · 노드 이름 · 끄기
 *   ?action=peek&path=…        그 밑에 무슨 열쇠가 있나 (읽기만 · 둘러보기)
 *   ?action=pull[&fresh=1]     공용 할 일 전부 (60초 담아 둠)
 *   ?action=push    (POST)     내 쪽 줄을 한꺼번에 올림 (PATCH — 남의 줄은 안 건드림)
 *   ?action=setrow  (POST)     한 줄만 고침 (그쪽 줄도 여기서 고칠 수 있게)
 *   ?action=delrow  (POST)     한 줄 지움 (지움표를 세웁니다 — 양쪽이 같이 사라지게)
 *
 * ── 저장소 모양 ────────────────────────────────────────────────
 *   <노드>/rows/<id> = {팀,업무명,담당자,상태,기한,진척률,메모,고친때,고친이,지움}
 *   <노드>/meta/lastWrite = 마지막으로 쓴 때
 *
 * 줄마다 <<팀>> 이 적혀 있어, 어느 팀이 올린 것인지 바로 압니다. 올릴 때는
 * PUT 이 아니라 <<PATCH>> 를 씁니다 — PUT 은 노드를 통째로 갈아 끼워서
 * 상대가 방금 올린 줄을 지워 버립니다.
 *
 * 지우기는 <<지움표>> 로 합니다. 줄을 정말 없애면, 아직 그 줄을 들고 있는
 * 쪽이 다음에 올릴 때 되살려 놓습니다. 지움표를 세워 두면 양쪽이 같이
 * 사라집니다.
 *
 * ⚠️ 밖에 있는 앱(미디어마케팅팀 브랜드허브)이 NAS 를 거쳐 쓸 때는
 *    로그인을 못 하므로 config.php 의 export_token 을 맞춰야 합니다.
 *    브라우저에서 쓸 때는 로그인한 사람만 됩니다.
 */

$TL_TOKEN_OK = false;
if (isset($_GET['token']) || isset($_SERVER['HTTP_X_TOKEN'])) {
    $cfg  = is_file(__DIR__ . '/config.php') ? (array)(include __DIR__ . '/config.php') : [];
    $want = trim((string)($cfg['export_token'] ?? ''));
    $got  = (string)($_GET['token'] ?? ($_SERVER['HTTP_X_TOKEN'] ?? ''));
    if ($want !== '' && hash_equals($want, $got)) $TL_TOKEN_OK = true;
}
/* 암호 글자로 들어온 것이 아니면 평소처럼 로그인 검사를 거칩니다 */
if (!$TL_TOKEN_OK && is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@ini_set('display_errors', '0');
@set_time_limit(60);

if (!function_exists('bh_read_raw')) {
    function bh_read_raw($p) { return is_file($p) ? (string)@file_get_contents($p) : ''; }
    function bh_write_raw($p, $json) {
        $t = $p . '.tmp' . getmypid();
        $n = @file_put_contents($t, $json);
        if ($n === false || $n !== strlen($json) || !@rename($t, $p)) { @unlink($t); return false; }
        @chmod($p, 0664);
        return true;
    }
}

$DATA_DIR  = __DIR__ . '/data';
$CONF_FILE = $DATA_DIR . '/teamlink.php';
$CACHE_FILE= $DATA_DIR . '/teamlink-cache.php';
$MAXAGE    = 60;                  /* 60초면 사실상 실시간처럼 보입니다 */

function tl_out($a, $code = 200) {
    http_response_code(200);      /* 웹 스테이션이 오류 내용을 바꿔치기 합니다 */
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function tl_strip($raw) { return preg_replace('/^<\?php.*?\n/s', '', (string)$raw); }

/* 설정 — 처음에는 근무현황 캘린더가 쓰는 저장소로 맞춰 둡니다 */
function tl_conf($f) {
    $j = json_decode(tl_strip(bh_read_raw($f)), true);
    if (!is_array($j)) $j = [];
    return [
        'db'   => rtrim((string)($j['db'] ?? 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app'), '/'),
        'node' => trim((string)($j['node'] ?? 'team_tasks'), '/'),
        'team' => (string)($j['team'] ?? '브랜드마케팅팀'),
        'off'  => !empty($j['off']),
        'secs' => max(5, min(60, (int)($j['secs'] ?? 20))),
    ];
}

/* ── 저장소에 말 걸기 (GET·PUT·PATCH·DELETE) ──────────────────────
   NAS 마다 막힌 길이 달라, curl → file_get_contents → 명령줄 순으로
   해 봅니다. 쓰기는 curl 과 file_get_contents 만 합니다. */
function tl_http($url, $method, $body, &$why, $sec) {
    $deadline = microtime(true) + $sec;
    $left = function () use ($deadline) { return (int)max(3, ceil($deadline - microtime(true))); };

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
              CURLOPT_TIMEOUT => $left(), CURLOPT_CONNECTTIMEOUT => min(8, $left()),
              CURLOPT_CUSTOMREQUEST => $method];
        if ($body !== null) {
            $o[CURLOPT_POSTFIELDS] = $body;
            $o[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
        }
        curl_setopt_array($ch, $o);
        $b = curl_exec($ch);
        $c = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $e = curl_error($ch);
        curl_close($ch);
        if ($b !== false && $c >= 200 && $c < 300) return $b;
        $why[] = 'curl: ' . ($e !== '' ? $e : 'HTTP ' . $c)
               . ($b !== false && $b !== '' ? ' · ' . substr((string)$b, 0, 200) : '');
    } else { $why[] = 'curl 확장이 꺼져 있습니다'; }

    if (ini_get('allow_url_fopen') && extension_loaded('openssl') && $left() > 2) {
        $opt = ['http' => ['method' => $method, 'timeout' => $left(),
                           'ignore_errors' => true]];
        if ($body !== null) {
            $opt['http']['header']  = "Content-Type: application/json\r\n";
            $opt['http']['content'] = $body;
        }
        $b = @file_get_contents($url, false, stream_context_create($opt));
        $code = 0;
        foreach ((array)($http_response_header ?? []) as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1];
        }
        if ($b !== false && $code >= 200 && $code < 300) return $b;
        $why[] = 'file_get_contents: HTTP ' . $code;
    } else {
        $why[] = extension_loaded('openssl') ? 'allow_url_fopen 이 꺼져 있습니다'
                                             : 'openssl 확장이 꺼져 있습니다';
    }

    if ($method === 'GET' && function_exists('shell_exec') && $left() > 2) {
        $b = @shell_exec('curl -sS -m ' . $left() . ' ' . escapeshellarg($url) . ' 2>/dev/null');
        if (is_string($b) && $b !== '') return $b;
        $why[] = '명령줄 curl 도 안 됩니다';
    }
    return false;
}
/* 저장소의 한 자리를 읽습니다 */
/* ⚠️ <<비어 있는 자리>> 와 <<못 읽은 것>> 은 다릅니다. 아직 아무도 안 쓴
   자리는 null 이 정상인데, 그걸 「못 닿았다」 로 보면 연동을 켜자마자
   빨간불이 뜹니다. 그래서 받아오기가 됐는지를 $fail 로 따로 알려 줍니다. */
function tl_get($c, $path, &$why, $sec, $shallow = false, &$fail = null) {
    $u = $c['db'] . '/' . trim($path, '/') . '.json' . ($shallow ? '?shallow=true' : '');
    $b = tl_http($u, 'GET', null, $why, $sec);
    if ($b === false) { $fail = true; return null; }
    $fail = false;
    $j = json_decode($b, true);
    if ($j === null && trim($b) !== 'null') { $fail = true; return null; }
    return $j;
}
/* 한 자리에 얹습니다 (PATCH — 남의 줄은 그대로 둡니다) */
function tl_patch($c, $path, $obj, &$why, $sec) {
    $u = $c['db'] . '/' . trim($path, '/') . '.json';
    $b = tl_http($u, 'PATCH', json_encode($obj, JSON_UNESCAPED_UNICODE), $why, $sec);
    return $b !== false;
}

/* 줄 하나를 쓸 모양으로 다듬습니다 — 밖에서 온 것이라 무엇이든 들어옵니다 */
function tl_row($r, $team, $who) {
    $pct = $r['진척률'] ?? null;
    $pct = ($pct === null || $pct === '' || !is_numeric($pct))
         ? null : max(0, min(100, (int)round((float)$pct)));
    $s = function ($x) { return mb_substr(trim((string)($x ?? '')), 0, 300); };
    return [
        '팀'     => $s($r['팀'] ?? $team),
        '업무명' => $s($r['업무명'] ?? ''),
        '담당자' => $s($r['담당자'] ?? ''),
        '상태'   => $s($r['상태'] ?? ''),
        '기한'   => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($r['기한'] ?? ''))
                    ? (string)$r['기한'] : '',
        '진척률' => $pct,
        '메모'   => $s($r['메모'] ?? ''),
        '고친때' => gmdate('c'),
        '고친이' => $s($who),
        '지움'   => !empty($r['지움']),
    ];
}
function tl_who() {
    if (function_exists('bh_me')) { $m = bh_me(); if (is_array($m) && !empty($m['name'])) return (string)$m['name']; }
    return (string)($_GET['who'] ?? '');
}
function tl_in() {
    $j = json_decode((string)file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}

$action = $_GET['action'] ?? '';
$conf   = tl_conf($CONF_FILE);

if ($action === 'check') {
    $why = []; $fail = true; $meta = null;
    if (!$conf['off']) $meta = tl_get($conf, $conf['node'] . '/meta', $why, 10, false, $fail);
    /* 아직 아무도 안 쓴 자리라도 <<읽기가 됐으면>> 닿은 것입니다 */
    tl_out(['ok' => true, '저장소' => $conf['db'], '노드' => $conf['node'],
            '우리팀' => $conf['team'], '꺼둠' => $conf['off'],
            '닿음' => !$conf['off'] && !$fail, '빈자리' => $meta === null,
            '저장소메모' => $meta, '안된까닭' => $fail ? $why : []]);
}

if ($action === 'setup') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') tl_out(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $in = tl_in();
    $j  = [];
    $j['db']   = rtrim(trim((string)($in['db'] ?? $conf['db'])), '/');
    $j['node'] = trim(trim((string)($in['node'] ?? $conf['node'])), '/');
    $j['team'] = trim((string)($in['team'] ?? $conf['team']));
    $j['off']  = !empty($in['off']);
    $j['secs'] = max(5, min(60, (int)($in['secs'] ?? $conf['secs'])));
    if ($j['db'] === '' || !preg_match('#^https?://#i', $j['db'])) {
        tl_out(['ok' => false, 'error' => '저장소 주소는 http 로 시작해야 합니다'], 400);
    }
    if ($j['node'] === '' || !preg_match('#^[A-Za-z0-9_\-/]+$#', $j['node'])) {
        tl_out(['ok' => false, 'error' => '노드 이름은 영문·숫자·_ - / 만 됩니다 (예: team_tasks)'], 400);
    }
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true)) {
        tl_out(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다'], 500);
    }
    if (!bh_write_raw($CONF_FILE, "<?php exit; ?>\n" . json_encode($j, JSON_UNESCAPED_UNICODE))) {
        tl_out(['ok' => false, 'error' => '설정을 저장하지 못했습니다'], 500);
    }
    @unlink($CACHE_FILE);
    tl_out(['ok' => true] + $j);
}

if ($action === 'peek') {
    $path = trim((string)($_GET['path'] ?? ''), '/');
    $why  = []; $fail = true;
    $v = tl_get($conf, $path, $why, 15, true, $fail);
    if ($fail) {
        tl_out(['ok' => false, 'error' => '저장소를 읽지 못했습니다', '안된까닭' => $why,
                '본곳' => $conf['db'] . '/' . $path . '.json'], 502);
    }
    tl_out(['ok' => true, '본곳' => $path === '' ? '(맨 위)' : $path,
            '열쇠' => is_array($v) ? array_keys($v) : [], '값' => is_array($v) ? null : $v]);
}

if ($action === 'pull') {
    if ($conf['off']) tl_out(['ok' => false, 'error' => '연동을 꺼 두었습니다'], 400);
    $fresh = !empty($_GET['fresh']);
    if (!$fresh) {
        $c = json_decode(tl_strip(bh_read_raw($CACHE_FILE)), true);
        if (is_array($c) && (time() - (int)($c['at'] ?? 0)) < $MAXAGE
            && (string)($c['node'] ?? '') === $conf['node']) {
            tl_out(['ok' => true, '줄' => $c['줄'] ?? [], '받은때' => $c['받은때'] ?? '',
                    '담아둔것' => true]);
        }
    }
    $why = []; $fail = true;
    $rows = tl_get($conf, $conf['node'] . '/rows', $why, $conf['secs'], false, $fail);
    if ($fail) {
        tl_out(['ok' => false, 'error' => '저장소를 읽지 못했습니다', '안된까닭' => $why], 502);
    }
    $out = [];
    foreach ((array)$rows as $id => $r) {
        if (!is_array($r) || !empty($r['지움'])) continue;
        if (trim((string)($r['업무명'] ?? '')) === '') continue;
        $r['id'] = (string)$id;
        $out[] = $r;
    }
    usort($out, function ($a, $b) { return strcmp((string)($b['고친때'] ?? ''), (string)($a['고친때'] ?? '')); });
    $now = gmdate('c');
    bh_write_raw($CACHE_FILE, "<?php exit; ?>\n" . json_encode(
        ['at' => time(), 'node' => $conf['node'], '받은때' => $now, '줄' => $out],
        JSON_UNESCAPED_UNICODE));
    tl_out(['ok' => true, '줄' => $out, '받은때' => $now, '담아둔것' => false]);
}

if ($action === 'push' || $action === 'setrow' || $action === 'delrow') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') tl_out(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    if ($conf['off']) tl_out(['ok' => false, 'error' => '연동을 꺼 두었습니다'], 400);
    $in   = tl_in();
    $team = trim((string)($in['팀'] ?? $conf['team']));
    $who  = tl_who();
    $why  = [];
    $patch = [];

    if ($action === 'push') {
        $rows = (array)($in['줄'] ?? []);
        if (count($rows) > 1000) tl_out(['ok' => false, 'error' => '한 번에 1000줄까지만 올립니다'], 413);
        foreach ($rows as $r) {
            if (!is_array($r)) continue;
            $id = trim((string)($r['id'] ?? ''));
            if ($id === '' || !preg_match('#^[A-Za-z0-9_\-]{1,64}$#', $id)) continue;
            if (trim((string)($r['업무명'] ?? '')) === '' && empty($r['지움'])) continue;
            $patch[$id] = tl_row($r, $team, $who);
        }
        /* 올린 적 있는데 이번에 안 온 줄은 <<지움표>> 를 세웁니다 —
           한쪽에서 지운 것이 양쪽에서 같이 사라지게. 남의 팀 줄은 안 건드립니다. */
        $have = tl_get($conf, $conf['node'] . '/rows', $why, $conf['secs']);
        foreach ((array)$have as $id => $r) {
            if (!is_array($r) || isset($patch[$id])) continue;
            if (trim((string)($r['팀'] ?? '')) !== $team) continue;
            if (!empty($r['지움'])) continue;
            $patch[$id] = ['지움' => true, '고친때' => gmdate('c'), '고친이' => $who] + $r;
            $patch[$id]['지움'] = true;
            $patch[$id]['고친때'] = gmdate('c');
        }
    } else {
        $id = trim((string)($in['id'] ?? ''));
        if ($id === '' || !preg_match('#^[A-Za-z0-9_\-]{1,64}$#', $id)) {
            tl_out(['ok' => false, 'error' => '줄 이름(id)이 올바르지 않습니다'], 400);
        }
        if ($action === 'delrow') {
            $patch[$id] = ['지움' => true, '고친때' => gmdate('c'), '고친이' => $who];
        } else {
            /* 그쪽 줄도 여기서 고칠 수 있게 — 팀은 원래 것을 지킵니다 */
            $old = tl_get($conf, $conf['node'] . '/rows/' . $id, $why, 10);
            $keep = (is_array($old) && trim((string)($old['팀'] ?? '')) !== '')
                  ? (string)$old['팀'] : $team;
            $patch[$id] = tl_row(['팀' => $keep] + (array)($in['줄'] ?? []), $keep, $who);
        }
    }
    if (!$patch) tl_out(['ok' => false, 'error' => '올릴 줄이 없습니다'], 400);

    if (!tl_patch($conf, $conf['node'] . '/rows', $patch, $why, $conf['secs'])) {
        tl_out(['ok' => false, 'error' => '저장소에 쓰지 못했습니다', '안된까닭' => $why,
                '안내' => '저장소 규칙(rules)에서 이 노드에 쓰기가 막혀 있을 수 있습니다.'], 502);
    }
    tl_patch($conf, $conf['node'] . '/meta', ['lastWrite' => gmdate('c'), 'lastBy' => $who,
                                              'lastTeam' => $team], $why, 10);
    @unlink($CACHE_FILE);        /* 다음 받기는 새로 받습니다 */
    tl_out(['ok' => true, '올린줄' => count($patch), '올린때' => gmdate('c')]);
}

tl_out(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
