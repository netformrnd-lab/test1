<?php
/**
 * 블로그 발행 기록 가져오기
 *
 *   ?action=list      발행한 글 목록 (필요하면 새로 받아옵니다)
 *   ?action=refresh   지금 바로 다시 받아오기
 *   ?action=setup     어디서 받아올지 정하기 (POST)
 *   ?action=check     지금 설정과 상태
 *
 * ── 왜 NAS 가 받아오나 ─────────────────────────────────────────
 * 사무실 브라우저가 밖으로 못 나가는 경우가 있어, NAS 가 대신 받아
 * data/blog-posts.json 에 담아둡니다. 화면은 그 파일만 읽습니다.
 * 원본은 「블로그 포스팅 대시보드」(Firebase) 이고, 우리는 읽기만 합니다.
 */

if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@ini_set('display_errors', '0');

/* guard.php 가 아직 안 올라온 예전 상태에서도 돌아가게 하는 대비책입니다 */
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
/* 주소로 그냥 열리지 않게 .php 로 둡니다 (guard.php 의 방패와 같은 방식) */
$CONF_FILE = $DATA_DIR . '/blog-source.php';
$FILE      = $DATA_DIR . '/blog-posts.php';
$MAXAGE    = 600;                       // 10분 지나면 새로 받아옵니다

function jout($a, $code = 200) {
    http_response_code(200);            // 웹 스테이션이 오류 내용을 바꿔치기 하므로 항상 200
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

/** 인터넷에서 받아옵니다 (NAS 마다 막힌 방법이 달라 세 가지를 차례로) */
function bfetch($url, &$why, $sec = 25) {
    $why = [];
    $deadline = microtime(true) + $sec;
    $left = function () use ($deadline) { return (int)max(3, ceil($deadline - microtime(true))); };

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $left(), CURLOPT_CONNECTTIMEOUT => min(10, $left())]);
        $b = curl_exec($ch);
        $c = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $e = curl_error($ch);
        curl_close($ch);
        if ($b !== false && $c === 200) return $b;
        // 원본이 「안 됩니다」 하고 이유를 적어 보낸 경우 — 다른 방법으로 또 물어볼 필요가 없습니다
        if ($b !== false && $c >= 400 && $c < 500) {
            $j = json_decode((string)$b, true);
            if (is_array($j) && isset($j['error'])) return $b;
        }
        $why[] = 'curl: ' . ($e !== '' ? $e : 'HTTP ' . $c);
    } else { $why[] = 'curl 확장이 꺼져 있습니다'; }

    if (ini_get('allow_url_fopen') && extension_loaded('openssl')) {
        $ctx = stream_context_create(['http' => ['timeout' => $left(), 'ignore_errors' => true]]);
        $b = @file_get_contents($url, false, $ctx);
        if ($b !== false && $b !== '') return $b;
        $why[] = 'file_get_contents 실패';
    } else {
        $why[] = extension_loaded('openssl') ? 'allow_url_fopen 이 꺼져 있습니다'
                                             : 'openssl 이 꺼져 있어 https 로 못 나갑니다';
    }

    if (function_exists('shell_exec')) {
        $tmp = tempnam(sys_get_temp_dir(), 'blg');
        @shell_exec('wget -q -T ' . $left() . ' -t 1 -O ' . escapeshellarg($tmp) . ' '
                  . escapeshellarg($url) . ' 2>/dev/null');
        $b = @file_get_contents($tmp);
        @unlink($tmp);
        if (is_string($b) && $b !== '') return $b;
        $why[] = 'wget 으로도 받지 못했습니다';
    } else { $why[] = 'shell_exec 이 막혀 있습니다'; }

    return false;
}

/** 어디서 받아올지 (처음에는 우리 블로그 대시보드로 맞춰 둡니다) */
function conf($f) {
    $raw = bh_read_raw($f);
    if ($raw === '' && is_file(preg_replace('/\.php$/', '.json', $f))) {   // 예전 판
        $raw = bh_read_raw(preg_replace('/\.php$/', '.json', $f));
    }
    $j = $raw === '' ? null : json_decode($raw, true);
    if (!is_array($j)) $j = [];
    return [
        'project'  => (string)($j['project']  ?? 'marketing-blog-2de5e'),
        'key'      => (string)($j['key']      ?? 'AIzaSyBM9FaPaa87dHFi6NY9N1yR99Vdh42c8jM'),
        'coll'     => (string)($j['coll']     ?? 'posts'),
        'site'     => (string)($j['site']     ?? 'https://poursolution.github.io/marketing-blog/'),
        'off'      => !empty($j['off']),
    ];
}

/** 파이어스토어가 돌려준 모양을 우리 모양으로 폅니다 */
function flat($fields) {
    $out = [];
    foreach ((array)$fields as $k => $v) {
        if (!is_array($v)) continue;
        $val = null;
        foreach ($v as $kk => $vv) {
            if ($kk === 'stringValue' || $kk === 'integerValue' || $kk === 'doubleValue') $val = $vv;
            elseif ($kk === 'booleanValue') $val = $vv ? '예' : '아니오';
            elseif ($kk === 'timestampValue') $val = substr((string)$vv, 0, 10);
        }
        if ($val !== null) $out[$k] = is_string($val) ? trim($val) : $val;
    }
    return $out;
}

function fetch_posts($c, &$why) {
    $url = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode($c['project'])
         . '/databases/(default)/documents/' . rawurlencode($c['coll'])
         . '?pageSize=300&key=' . rawurlencode($c['key']);
    $rows = [];
    $token = '';
    for ($page = 0; $page < 8; $page++) {          // 넉넉히 2400건까지
        $u = $url . ($token !== '' ? '&pageToken=' . rawurlencode($token) : '');
        $body = bfetch($u, $why);
        if ($body === false) return null;
        $j = json_decode($body, true);
        if (!is_array($j)) { $why[] = '받은 내용을 읽지 못했습니다'; return null; }
        if (isset($j['error'])) {
            $why[] = '원본이 거절했습니다: ' . (string)($j['error']['message'] ?? '');
            return null;
        }
        foreach ((array)($j['documents'] ?? []) as $d) {
            $r = flat($d['fields'] ?? []);
            if (!count($r)) continue;
            $r['id'] = basename((string)($d['name'] ?? ''));
            $rows[] = $r;
        }
        $token = (string)($j['nextPageToken'] ?? '');
        if ($token === '') break;
    }
    usort($rows, function ($a, $b) {
        return strcmp((string)($b['publishedAt'] ?? ''), (string)($a['publishedAt'] ?? ''));
    });
    return $rows;
}

function save_all($file, $rows, $c) {
    $payload = ['updatedAt' => date('c'), 'source' => $c['site'],
                'project' => $c['project'], 'rows' => $rows];
    return bh_write_raw($file, json_encode($payload, JSON_UNESCAPED_UNICODE));
}

function load_all($file) {
    $raw = bh_read_raw($file);
    if ($raw === '' && is_file(preg_replace('/\.php$/', '.json', $file))) {   // 예전 판
        $raw = bh_read_raw(preg_replace('/\.php$/', '.json', $file));
    }
    $j = $raw === '' ? null : json_decode($raw, true);
    return is_array($j) ? $j : ['updatedAt' => null, 'rows' => []];
}

$action = $_GET['action'] ?? 'list';
$c = conf($CONF_FILE);

if ($action === 'setup') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $b = json_decode((string)file_get_contents('php://input'), true);
    $new = [
        'project' => trim((string)($b['project'] ?? $c['project'])),
        'key'     => trim((string)($b['key']     ?? $c['key'])),
        'coll'    => trim((string)($b['coll']    ?? $c['coll'])),
        'site'    => trim((string)($b['site']    ?? $c['site'])),
        'off'     => !empty($b['off']),
    ];
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true) && !is_dir($DATA_DIR)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들지 못했습니다'], 500);
    }
    if (!bh_write_raw($CONF_FILE, json_encode($new, JSON_UNESCAPED_UNICODE))) {
        jout(['ok' => false, 'error' => '설정을 저장하지 못했습니다 (data 폴더 권한을 봐주세요)'], 500);
    }
    jout(['ok' => true, '설정' => $new, '안내' => '맞췄습니다']);
}

if ($action === 'check') {
    $all = load_all($FILE);
    jout(['ok' => true, '주소' => $c['site'], '프로젝트' => $c['project'],
          '끔' => $c['off'], '글수' => count($all['rows'] ?? []),
          '받아온때' => $all['updatedAt'] ?? null]);
}

if ($action === 'refresh' || $action === 'list') {
    if ($c['off']) jout(['ok' => true, '끔' => true, '글' => [], '안내' => '블로그 연결을 꺼두었습니다']);

    $all  = load_all($FILE);
    $age  = ($all['updatedAt'] ?? null) ? (time() - strtotime($all['updatedAt'])) : PHP_INT_MAX;
    $need = ($action === 'refresh') || $age > $MAXAGE || !count($all['rows'] ?? []);

    $why = []; $fresh = null;
    if ($need) {
        $fresh = fetch_posts($c, $why);
        if (is_array($fresh)) { save_all($FILE, $fresh, $c); $all = load_all($FILE); }
    }
    $rows = $all['rows'] ?? [];

    // 브랜드별·달별로 세어 둡니다 (화면에서 바로 쓰라고)
    $byBrand = []; $byMonth = [];
    foreach ($rows as $r) {
        $b = (string)($r['brand'] ?? '(브랜드 없음)');
        $byBrand[$b] = ($byBrand[$b] ?? 0) + 1;
        $m = substr((string)($r['publishedAt'] ?? ''), 0, 7);
        if ($m !== '') $byMonth[$m] = ($byMonth[$m] ?? 0) + 1;
    }
    krsort($byMonth);
    arsort($byBrand);

    jout(['ok' => true, '글' => $rows, '글수' => count($rows),
          '브랜드별' => $byBrand, '달별' => array_slice($byMonth, 0, 12, true),
          '받아온때' => $all['updatedAt'] ?? null, '주소' => $c['site'],
          '새로받음' => is_array($fresh),
          '문제' => (is_array($fresh) || !$need) ? null
                   : ('새로 받아오지 못했습니다: ' . implode(' / ', $why))]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
