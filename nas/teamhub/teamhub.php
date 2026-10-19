<?php
/* =========================================================================
   NETFORM TeamHub HTML 판 — NAS 웹 폴더 (teamhub.php)  v2.5.9
   -------------------------------------------------------------------------
   TeamHub HTML 파일을 NAS 웹 주소(http://NAS주소/teamhub/mediam_TeamHub.html)로 열 때,
   브라우저 대신 이 파일이 팀 폴더(NAS)를 읽고 씁니다.
   → PC 에 아무것도 설치하지 않고, 다른 프로그램(브랜드 허브 등)에서 링크로 바로 열 수 있습니다.

   놓는 곳: TeamHub HTML 파일과 같은 NAS 웹 폴더 (예: web/teamhub/mediam_TeamHub.html · web/teamhub/teamhub.php)
   필요한 것: NAS 웹 서버 + PHP 7.2 이상 (Synology Web Station · QNAP Web Server 등)

   ▼ 아래 줄만 필요하면 고치세요 ▼
   ========================================================================= */

// 1) 팀 폴더 — 팀원 PC 가 [팀 폴더(NAS) 고르기]로 쓰던 그 폴더의 NAS 안 경로를 적으면
//    링크로 여는 사람과 PC 에서 폴더를 고른 사람이 같은 팀 데이터를 함께 씁니다.
//    예: '/volume1/MediaMarketing/TeamHub'  (Synology: 공유 폴더 MediaMarketing 안의 TeamHub)
//    v2.5.6 기본 메인 저장 폴더(PC 에서 Z:\넷폼알앤디 공유폴더\00. 미디어마케팅팀\미디어마케팅팀 브랜드허브\DB_미디어마케팅팀 브랜드허브)를
//    쓰려면 그 폴더의 NAS 안 경로를 적으세요.  예: '/volume1/넷폼알앤디 공유폴더/00. 미디어마케팅팀/미디어마케팅팀 브랜드허브/DB_미디어마케팅팀 브랜드허브'
//    비워 두면 이 파일 옆 'TeamHub_Data' 폴더를 씁니다 (처음 쓸 때 저절로 만들어짐).
/* ── 🏠 <<한 곳>> — 여기 한 줄만 고치면 아래가 다 따라갑니다 ─────────
   두 팀이 따로 쓰던 자리를 하나로 모읍니다. 브랜드허브와 팀허브가
   <<같은 곳>> 을 보니, 쓰는 사람에게는 프로그램 하나입니다.
   (프로그램 화면만 따로 떼어 둔 것뿐입니다)

   Z:\넷폼알앤디 공유폴더\브랜드허브\   ← PC 에서 보이는 이름
   /volume1/넷폼알앤디 공유폴더/브랜드허브/  ← NAS 안 경로 (여기에 적는 것)

   ※ /volume1 이 맞는지는 File Station → 그 폴더 → 속성에서 봅니다. */
$BASE = '/volume1/넷폼알앤디 공유폴더/브랜드허브';

$TEAM_DIR = $BASE . '/DB_미디어마케팅팀';

// 2) 접근 키 — 비워 두면 사무실 안(사설 IP: 192.168.x · 10.x · 172.16~31.x · Tailscale 100.64~127.x)에서만 열립니다.
//    사무실 밖(DDNS · 공유기 포트 열기 등)에서도 열어야 하면 길고 어려운 글자로 키를 정하고,
//    처음 열 때 화면에서 그 키를 한 번 넣으면 됩니다.  예: 'nf-7Gq2...-아무도모르는글자'
$ACCESS_KEY = '';
// 🔑 열쇠는 <<파일에 따로>> 둡니다 — 이 파일은 깃허브(공개)에 올라가므로
//    여기에 적으면 아무나 보게 됩니다. NAS 의 teamhub 폴더에
//    teamhub-key.txt 를 만들고 그 안에 열쇠만 한 줄 적어 두세요.
//    (사무실 밖에서도 열려면 꼭 정해야 합니다 — 비우면 사설 IP 에서만 열립니다)
if ($ACCESS_KEY === '' && is_file(__DIR__ . '/teamhub-key.txt')) {
  $ACCESS_KEY = trim((string)@file_get_contents(__DIR__ . '/teamhub-key.txt'));
}

// 3) 화면에 보일 팀 폴더 이름 (비워 두면 폴더 이름)  예: '\\\\NAS\\MediaMarketing\\TeamHub'
$LABEL = '브랜드허브 · 미디어마케팅팀';

// 4) (선택 · v2.3.0) 보조 저장 위치 — 2중 저장. 팀 폴더와 다른 공유 폴더(가능하면 다른 디스크)의 NAS 안 경로.
//    적어 두면 TeamHub 관리 → 팀 동기화·PC → 보조 저장 위치 [지정] 에서 teamhub.php?area=mirror 주소(처음부터 채워져 있음)로 고릅니다.
//    예: '/volume2/Backup/TeamHub_보조'
//    v2.5.6 기본 백업 저장 폴더(PC 에서 …\00. 미디어마케팅팀\미디어마케팅팀 브랜드허브\DB_backup)를 쓰려면 그 폴더의 NAS 안 경로.
//    예: '/volume1/넷폼알앤디 공유폴더/00. 미디어마케팅팀/미디어마케팅팀 브랜드허브/DB_backup'
//    (할 일 [파일로 저장]은 v2.5.9 부터 처음 값이 팀 폴더($TEAM_DIR) — TeamHub 관리 화면 「할 일 파일 저장」을 백업 저장 경로로 바꿨을 때만 이 폴더)
$MIRROR_DIR = $BASE . '/DB_backup';

// 5) (선택 · v2.5.6) 할 일 불러오기 폴더 — 할 일 화면 [💾 할 일 DB] → [불러오기] 가 미디어마케팅팀-할일.json 을 찾는 곳.
//    PC 에서 …\00. 미디어마케팅팀\미디어마케팅팀 브랜드허브\DB_Copy 로 보이는 폴더의 NAS 안 경로.
//    예: '/volume1/넷폼알앤디 공유폴더/00. 미디어마케팅팀/미디어마케팅팀 브랜드허브/DB_Copy'
//    비워 두면 NAS 웹 주소로 연 PC 는 [불러오기 찾기](파일 직접 고르기)로 불러옵니다.
/* 📮 할 일이 오가는 자리 — 브랜드허브가 우리 할 일을 여기에 놓고,
   팀허브 [불러오기] 가 여기서 집어 갑니다 (팀허브는 읽기만 합니다) */
$COPY_DIR = $BASE . '/주고받기';

/* ========================================================================= */
$VERSION = 2;
/* 폴더 만들기 — 여러 요청이 같은 새 폴더를 동시에 만들어도 실패하지 않게 (v2.3.1) */
function ensure_dir($d) {
  for ($i = 0; $i < 3; $i++) {
    if (is_dir($d)) return true;
    if (@mkdir($d, 0775, true)) return true;
    clearstatcache(true, $d);
    usleep(20000);
  }
  return is_dir($d);
}
error_reporting(0);
@ini_set('display_errors', '0');
@set_time_limit(0);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');
header('Referrer-Policy: same-origin');

function out_json($v, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail($msg, $code = 400) {
  http_response_code($code);
  header('Content-Type: text/plain; charset=utf-8');
  echo $msg;
  exit;
}

// ---------------------------------------------------------------- 누가 쓸 수 있나
function is_private_ip($ip) {
  if ($ip === '' || $ip === null) return false;
  if ($ip === '::1' || strpos($ip, '127.') === 0) return true;
  if (strpos($ip, '::ffff:') === 0) $ip = substr($ip, 7);
  if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    $n = ip2long($ip);
    $in = function ($cidr) use ($n) {
      list($net, $bits) = explode('/', $cidr);
      $mask = -1 << (32 - (int)$bits);
      return ($n & $mask) === (ip2long($net) & $mask);
    };
    return $in('10.0.0.0/8') || $in('172.16.0.0/12') || $in('192.168.0.0/16') || $in('100.64.0.0/10') || $in('169.254.0.0/16');
  }
  // IPv6 사설 (fc00::/7) · 링크 로컬 (fe80::/10)
  $l = strtolower($ip);
  return strpos($l, 'fc') === 0 || strpos($l, 'fd') === 0 || strpos($l, 'fe8') === 0 || strpos($l, 'fe9') === 0 || strpos($l, 'fea') === 0 || strpos($l, 'feb') === 0;
}
$given = isset($_SERVER['HTTP_X_TEAMHUB_KEY']) ? (string)$_SERVER['HTTP_X_TEAMHUB_KEY'] : (isset($_GET['k']) ? (string)$_GET['k'] : '');
if ($ACCESS_KEY !== '') {
  if (!hash_equals((string)$ACCESS_KEY, $given)) fail('NAS 웹 폴더 접근 키가 필요합니다. (키가 맞지 않거나 비어 있음)', 401);
} else {
  $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
  if (!is_private_ip($ip)) fail('사무실 밖에서는 열 수 없습니다. 관리자가 teamhub.php 에 접근 키($ACCESS_KEY)를 정하면 밖에서도 열 수 있습니다.', 403);
}
// 다른 사이트에서 몰래 부르는 것을 막음 — 브라우저가 보내는 출처가 이 NAS 와 같을 때만
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== '') {
  $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
  $oh = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
  $op = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_PORT);
  $origin = $oh . ($op ? ':' . $op : '');
  if ($origin !== $host && $oh !== preg_replace('/:\d+$/', '', $host)) fail('다른 주소에서 온 요청은 받지 않습니다.', 403);
}

// ---------------------------------------------------------------- 팀 폴더
$area = isset($_GET['area']) ? (string)$_GET['area'] : '';
if ($area === 'mirror') {
  // v2.3.0 보조 저장 위치 (2중 저장)
  if ($MIRROR_DIR === '') fail('보조 저장 위치가 정해져 있지 않습니다. teamhub.php 의 $MIRROR_DIR 에 NAS 안 경로를 적으세요.', 404);
  $root = $MIRROR_DIR;
  if (!ensure_dir($root)) fail('보조 저장 위치를 찾거나 만들 수 없습니다: ' . $MIRROR_DIR . ' (NAS 웹 서버의 폴더 권한 확인)', 500);
  if ($LABEL !== '') $LABEL = $LABEL . ' (보조)';
} elseif ($area === 'copy') {
  // v2.5.6 할 일 불러오기 폴더 (DB_Copy)
  //  읽기만 (목록 · 읽기 · 확인) — 폴더를 만들지 않음 (경로를 잘못 적으면 404 로 알림)
  if ($COPY_DIR === '') fail('할 일 불러오기 폴더가 정해져 있지 않습니다. teamhub.php 의 $COPY_DIR 에 NAS 안 경로를 적으세요.', 404);
  $root = $COPY_DIR;
  if (!is_dir($root)) fail('할 일 불러오기 폴더를 찾을 수 없습니다: ' . $COPY_DIR . ' (teamhub.php 의 $COPY_DIR · NAS 웹 서버의 폴더 권한 확인)', 404);
  $LABEL = basename(rtrim($COPY_DIR, '/\\'));
} else {
  $root = $TEAM_DIR !== '' ? $TEAM_DIR : (__DIR__ . DIRECTORY_SEPARATOR . 'TeamHub_Data');
  if (!is_dir($root)) {
    if ($TEAM_DIR !== '') fail('팀 폴더를 찾을 수 없습니다: ' . $TEAM_DIR . ' (teamhub.php 의 $TEAM_DIR · NAS 웹 서버의 폴더 권한 확인)', 500);
    if (!@mkdir($root, 0775, true)) fail('팀 폴더를 만들 수 없습니다. NAS 웹 폴더에 쓰기 권한을 주세요.', 500);
  }
}
$root = rtrim(realpath($root), '/\\');
// 웹 폴더 안에 있으면 주소로 바로 내려받지 못하게 (Apache) + 빈 첫 화면
//  (웹 폴더 밖의 공유 폴더를 $TEAM_DIR 로 쓰면 PC 사용자 폴더를 어지럽히지 않게 만들지 않음)
$docroot = isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== '' ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
$in_web = strpos($root . '/', rtrim(__DIR__, '/\\') . '/') === 0 || ($docroot && strpos($root . '/', rtrim($docroot, '/\\') . '/') === 0);
if ($in_web && $area !== 'copy') {
  if (!file_exists($root . '/.htaccess')) @file_put_contents($root . '/.htaccess', "Require all denied\nDeny from all\n");
  if (!file_exists($root . '/index.html')) @file_put_contents($root . '/index.html', '');
}

/** 팀 폴더 기준 상대 경로 → 실제 경로 (밖으로 나가는 경로는 거부) */
function abs_path($root, $p) {
  $p = str_replace('\\', '/', (string)$p);
  if (strpos($p, "\0") !== false) fail('잘못된 경로');
  $parts = array();
  foreach (explode('/', $p) as $s) {
    if ($s === '' || $s === '.') continue;
    if ($s === '..') fail('팀 폴더 밖 경로는 쓸 수 없습니다.');
    $parts[] = $s;
  }
  if (count($parts) && strtolower($parts[0]) === '.htaccess') fail('쓸 수 없는 경로');
  return array($root . (count($parts) ? '/' . implode('/', $parts) : ''), implode('/', $parts));
}
function rm_tree($p) {
  if (is_dir($p) && !is_link($p)) {
    foreach (scandir($p) as $e) if ($e !== '.' && $e !== '..') rm_tree($p . '/' . $e);
    return @rmdir($p);
  }
  return !file_exists($p) || @unlink($p);
}

$op = isset($_GET['op']) ? (string)$_GET['op'] : '';
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($op === 'ping' || $op === '') {
  $label = $LABEL !== '' ? $LABEL : basename($root);
  $writable = false;
  if ($area !== 'copy') {
    $probe = $root . '/.teamhub-write-test-' . getmypid();
    $writable = @file_put_contents($probe, 'ok') !== false;
    if ($writable) @unlink($probe);
  }
  out_json(array('ok' => true, 'app' => 'teamhub-nas', 'v' => $VERSION, 'label' => $label, 'writable' => $writable, 'keyed' => $ACCESS_KEY !== '', 'php' => PHP_VERSION, 'inWeb' => (bool)$in_web, 'area' => $area === 'mirror' ? 'mirror' : ($area === 'copy' ? 'copy' : 'team'), 'mirror' => $MIRROR_DIR !== '', 'copy' => $COPY_DIR !== ''));
}

list($path, $rel) = abs_path($root, isset($_GET['p']) ? $_GET['p'] : '');
// v2.5.6 할 일 불러오기 폴더는 읽기만
if ($area === 'copy' && !in_array($op, array('list', 'read', 'stat'), true)) fail('할 일 불러오기 폴더(area=copy)는 읽기만 합니다.', 403);

switch ($op) {
  case 'list':
    if (!is_dir($path)) out_json(array());
    $out = array();
    foreach (scandir($path) as $e) {
      if ($e === '.' || $e === '..' || ($rel === '' && ($e === '.htaccess' || $e === 'index.html'))) continue;
      if (strpos($e, '.teamhub-tmp-') !== false || strpos($e, '.teamhub-write-test-') === 0) continue;
      $f = $path . '/' . $e;
      if (is_dir($f)) $out[] = array('name' => $e, 'kind' => 'directory');
      else {
        $st = @stat($f);
        if ($st) $out[] = array('name' => $e, 'kind' => 'file', 'size' => $st['size'], 'mtime' => $st['mtime'] * 1000);
      }
    }
    out_json($out);

  case 'read':
    if (!is_file($path)) fail('', 404);
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($path));
    while (ob_get_level()) ob_end_clean();
    readfile($path);
    exit;

  case 'stat':
    if (!file_exists($path)) out_json(null);
    $st = @stat($path);
    out_json(array('kind' => is_dir($path) ? 'directory' : 'file', 'size' => is_dir($path) ? 0 : $st['size'], 'mtime' => $st['mtime'] * 1000));

  case 'write':
    if ($method !== 'PUT' && $method !== 'POST') fail('PUT 으로 보내세요.', 405);
    if ($rel === '') fail('파일 이름이 없습니다.');
    $dir = dirname($path);
    if (!ensure_dir($dir)) fail('폴더를 만들 수 없습니다: ' . dirname($rel), 500);
    // 다 쓴 다음 한 번에 바꿔 놓음 — 다른 PC 가 반쯤 쓴 파일을 읽지 않게
    $tmp = $dir . '/.' . basename($path) . '.teamhub-tmp-' . getmypid() . '-' . mt_rand();
    $in = fopen('php://input', 'rb');
    $fo = @fopen($tmp, 'wb');
    if (!$in || !$fo) fail('파일을 쓸 수 없습니다 (NAS 웹 서버의 폴더 쓰기 권한 확인): ' . $rel, 500);
    $n = stream_copy_to_stream($in, $fo);
    fclose($in);
    if (fclose($fo) === false || $n === false) { @unlink($tmp); fail('파일을 다 쓰지 못했습니다: ' . $rel, 500); }
    if (!@rename($tmp, $path)) {
      // Windows 공유 등 덮어쓰기 이름 바꾸기가 안 되는 곳
      @unlink($path);
      if (!@rename($tmp, $path)) { @unlink($tmp); fail('파일을 바꿔 놓지 못했습니다: ' . $rel, 500); }
    }
    out_json(array('ok' => true, 'size' => $n));

  case 'remove':
    if ($method !== 'DELETE' && $method !== 'POST') fail('DELETE 로 보내세요.', 405);
    if ($rel === '') fail('팀 폴더 자체는 지울 수 없습니다.');
    if (is_dir($path)) {
      if (isset($_GET['r']) && $_GET['r'] === '1') rm_tree($path); else @rmdir($path);
    } elseif (file_exists($path)) @unlink($path);
    out_json(array('ok' => true));

  case 'mkdir':
    if ($method !== 'POST' && $method !== 'PUT') fail('POST 로 보내세요.', 405);
    if (!ensure_dir($path)) fail('폴더를 만들 수 없습니다: ' . $rel, 500);
    out_json(array('ok' => true));

  case 'move':
    if ($method !== 'POST') fail('POST 로 보내세요.', 405);
    list($to, $toRel) = abs_path($root, isset($_GET['to']) ? $_GET['to'] : '');
    if ($rel === '' || $toRel === '') fail('잘못된 경로');
    if (!file_exists($path)) fail('없는 파일: ' . $rel, 404);
    $d = dirname($to);
    ensure_dir($d);
    if (file_exists($to) && !is_dir($to)) @unlink($to);
    if (!@rename($path, $to)) fail('옮기지 못했습니다: ' . $rel, 500);
    out_json(array('ok' => true));

  default:
    fail('모르는 요청: ' . $op, 404);
}
