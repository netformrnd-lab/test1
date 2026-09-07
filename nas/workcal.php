<?php
/**
 * 근무현황 캘린더 가져오기 (휴가 · 공휴일 · 외근)
 *
 *   ?action=list&ym=2026-09   그 달의 휴가·공휴일·외근
 *   ?action=refresh&ym=…      지금 바로 다시 받아오기
 *   ?action=setup   (POST)    어디서 받아올지 / 끄기
 *   ?action=check             지금 설정과 상태
 *
 * ── 어디서 오나 ────────────────────────────────────────────────
 * 「(주) 넷폼알앤디 근무현황 캘린더」가 쓰는 파이어베이스를 그대로 읽습니다.
 * 로그인이 필요 없는 공개 읽기라 주소만 알면 받아올 수 있고, 우리는 읽기만
 * 합니다. 사무실 브라우저가 밖으로 못 나가도 되게 NAS 가 대신 받아둡니다.
 *
 * ── 왜 60초인가 ────────────────────────────────────────────────
 * 웹 스테이션은 밀어주기(push)를 못 하므로 「받아두고 자주 확인」 이 최선입니다.
 * 달력은 60초면 사실상 실시간처럼 보입니다. 급하면 [↻ 새로 받기] 를 씁니다.
 */

if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@ini_set('display_errors', '0');

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
$CONF_FILE = $DATA_DIR . '/workcal-source.php';
$MAXAGE    = 60;                       // 60초 지나면 새로 받아옵니다

function jout($a, $code = 200) {
    http_response_code(200);           // 웹 스테이션이 오류 내용을 바꿔치기 하므로 항상 200
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

/** 어디서 받아올지 (처음에는 우리 근무현황 캘린더로 맞춰 둡니다) */
function conf($f) {
    $raw = bh_read_raw($f);
    $j = $raw === '' ? null : json_decode(preg_replace('/^<\?php.*?\n/s', '', $raw), true);
    if (!is_array($j)) $j = [];
    return [
        'db'   => rtrim((string)($j['db'] ?? 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app'), '/'),
        'site' => (string)($j['site'] ?? 'https://netformrnd.github.io/calendar/'),
        'off'  => !empty($j['off']),
        'secs' => max(10, min(300, (int)($j['secs'] ?? 25))),
    ];
}

/** 인터넷에서 받아옵니다 (NAS 마다 막힌 방법이 달라 세 가지를 차례로) */
function wfetch($url, &$why, $sec = 25) {
    $deadline = microtime(true) + $sec;
    $left = function () use ($deadline) { return (int)max(3, ceil($deadline - microtime(true))); };

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $left(), CURLOPT_CONNECTTIMEOUT => min(8, $left())]);
        $b = curl_exec($ch);
        $c = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $e = curl_error($ch);
        curl_close($ch);
        if ($b !== false && $c === 200) return $b;
        if ($b !== false && $c >= 400 && $c < 500) { $why[] = 'HTTP ' . $c . ' — ' . substr((string)$b, 0, 120); return false; }
        $why[] = 'curl: ' . ($e !== '' ? $e : 'HTTP ' . $c);
    } else { $why[] = 'curl 확장이 꺼져 있습니다'; }

    if (ini_get('allow_url_fopen') && extension_loaded('openssl') && $left() > 2) {
        $ctx = stream_context_create(['http' => ['timeout' => $left(), 'ignore_errors' => true]]);
        $b = @file_get_contents($url, false, $ctx);
        if ($b !== false && $b !== '') return $b;
        $why[] = 'file_get_contents 실패';
    } else {
        $why[] = extension_loaded('openssl') ? 'allow_url_fopen 이 꺼져 있습니다'
                                             : 'openssl 이 꺼져 있어 https 로 못 나갑니다';
    }

    if (function_exists('shell_exec') && $left() > 2) {
        $tmp = tempnam(sys_get_temp_dir(), 'wc');
        @shell_exec('wget -q -T ' . $left() . ' --connect-timeout=8 -t 1 -O ' . escapeshellarg($tmp)
                  . ' ' . escapeshellarg($url) . ' 2>/dev/null');
        $b = @file_get_contents($tmp);
        @unlink($tmp);
        if (is_string($b) && $b !== '') return $b;
        $why[] = 'wget 으로도 받지 못했습니다';
    } else { $why[] = 'shell_exec 이 막혀 있습니다'; }

    return false;
}

/** 파이어베이스 한 곳을 읽어 배열로 (없으면 빈 배열) */
function rt($db, $path, &$why, $sec) {
    $b = wfetch($db . '/' . ltrim($path, '/') . '.json', $why, $sec);
    if ($b === false) return null;
    $j = json_decode($b, true);
    return $j === null ? [] : $j;          // null 은 「그 자리에 아무것도 없음」 입니다
}

/* ── 휴가 종류 가려내기 (원본 화면의 isHalf / isHalfHalf / isHalfAM 그대로) ──
   하이웍스는 type_name 에 그냥 「휴가」 라고만 적어 보내는 경우가 많습니다.
   진짜 종류는 vacation_type_title(예: 오전반차) · type(hours) · hours 에 있습니다.
   ─────────────────────────────────────────────────────────────────────── */
function v_is_half($v) {
    $t  = (string)($v['vacation_type_title'] ?? '');
    $tn = (string)($v['type_name'] ?? '');
    if (mb_strpos($t, '반차') !== false || mb_strpos($t, '반일') !== false) return true;
    if (mb_strpos($tn, '반차') !== false || mb_strpos($tn, '반반차') !== false) return true;
    if (($v['type'] ?? '') === 'hours') return true;      // 시간 단위로 쓴 것
    return false;
}
function v_is_quarter($v) {
    if (!v_is_half($v)) return false;
    if (mb_strpos((string)($v['type_name'] ?? ''), '반반차') !== false) return true;
    return ($v['type'] ?? '') === 'hours'
        && !empty($v['hours']) && (float)$v['hours'] <= 2;
}
/** 오전인가 오후인가 ('' 이면 알 수 없음) */
function v_half_when($v) {
    if (!v_is_half($v)) return '';
    $t = (string)($v['vacation_type_title'] ?? '');
    if (mb_strpos($t, '오전') !== false) return '오전';
    if (mb_strpos($t, '오후') !== false) return '오후';
    $st = (string)($v['start_time'] ?? '');
    $et = (string)($v['end_time'] ?? '');
    if ($et !== '' && $et <= '12:00:00') return '오전';
    if ($st !== '' && $st >= '12:00:00') return '오후';
    if ($st !== '' && $et !== '') {                        // 걸쳐 있으면 한가운데로 봅니다
        $mins = function ($x) { return (int)substr($x, 0, 2) * 60 + (int)substr($x, 3, 2); };
        return (($mins($st) + $mins($et)) / 2) < 720 ? '오전' : '오후';
    }
    if ($st !== '') return $st < '12:00:00' ? '오전' : '오후';
    return '';
}
/** 화면에 쓸 종류 이름 */
function v_kind($v) {
    if (v_is_quarter($v)) return '반반차';
    if (v_is_half($v))    return '반차';
    return '연차';
}
/** 몇 시에 나오고 들어가는지 (알면) */
function v_detail($v, $kind, $when) {
    if ($kind === '연차') return '';
    $st = substr((string)($v['start_time'] ?? ''), 0, 5);
    $et = substr((string)($v['end_time'] ?? ''), 0, 5);
    if ($when === '오전') return $et !== '' ? $et . ' 출근' : '오전';
    if ($when === '오후') return $st !== '' ? $st . ' 퇴근' : '오후';
    return '';
}

/** 개인일정 제목에서 어떤 외근인지 골라냅니다 (원본 화면과 같은 규칙) */
function per_type($t) {
    foreach (['세미나','미팅','영업','계약'] as $k) if (mb_strpos($t, $k) !== false) return $k;
    if (mb_strpos($t, '방문') !== false || mb_strpos($t, '현장답사') !== false) return '방문';
    if (mb_strpos($t, '하자점검') !== false || mb_strpos($t, '하자 점검') !== false) return '하자점검';
    return '개인';
}

/** 개인일정에서 장소를 뽑습니다 (원본 화면과 같은 규칙) */
function per_site($i, $name) {
    $site = (string)($i['siteName'] ?? '');
    if ($site !== '') return $site;
    $t = (string)($i['title'] ?? '');
    $u = mb_strpos($t, '_');
    if ($u !== false) $t = mb_substr($t, $u + 1);
    $t = trim(preg_replace('/\s*(세미나|미팅|계약|현장답사|방문|하자\s*점검|영업|현설|PT|브리핑|개인|솔루션).*$/u', '', $t));
    return ($t !== '' && $t !== $name) ? $t : (string)($i['location'] ?? '');
}

/** 그 달의 휴가·공휴일·외근을 한 덩어리로 모읍니다 */
function fetch_month($c, $ym, &$why) {
    $db = $c['db']; $sec = $c['secs'];
    $deadline = microtime(true) + $sec;
    $left = function () use ($deadline) { return max(4, (int)ceil($deadline - microtime(true))); };

    $vac  = rt($db, 'hiworks_vacation_sync/data/' . $ym,      $why, $left());
    if ($vac === null) return null;                          // 첫 번째가 안 되면 길이 막힌 것
    $hol  = rt($db, 'hiworks_vacation_sync/holidays/' . $ym,  $why, $left());
    $sync = rt($db, 'hiworks_vacation_sync/meta/lastSync',    $why, $left());
    $sq   = rt($db, 'sq_vc_shared/users',                     $why, $left());
    $man  = rt($db, 'manual_outside',                         $why, $left());
    $pt   = rt($db, 'pt',        $why, $left());
    $br   = rt($db, 'briefing',  $why, $left());
    $per  = rt($db, 'personal',  $why, $left());

    // ── 휴가 ─────────────────────────────────────────────
    $byDay = [];
    foreach ((array)$vac as $v) {
        if (!is_array($v) || empty($v['date'])) continue;
        $kind = v_kind($v);
        $when = v_half_when($v);
        $byDay[$v['date']][] = [
            '이름' => (string)($v['user_name'] ?? ''),
            '종류' => $kind,
            '때'   => $when,                       // 오전 / 오후 (반차일 때)
            '상세' => v_detail($v, $kind, $when),  // 예: 13:00 퇴근
            '원본' => (string)($v['vacation_type_title'] ?? ($v['type_name'] ?? '')),
        ];
    }
    // sq_vc 쪽 연차도 합칩니다 (취소된 것은 빼고, 이 달 것만)
    foreach ((array)$sq as $u) {
        if (!is_array($u) || empty($u['leaves'])) continue;
        foreach ((array)$u['leaves'] as $date => $info) {
            if (!is_array($info)) continue;
            if (strpos((string)$date, $ym) !== 0) continue;      // 다른 달은 건너뜁니다
            if (($info['status'] ?? '') === 'cancelled') continue;
            $t = (string)($info['type'] ?? '');
            $kind = strpos($t, 'half') === 0 ? '반차' : (strpos($t, 'quarter') === 0 ? '반반차' : '연차');
            $when = '';
            if (substr($t, -3) === '_am' || strpos($t, 'am') !== false) $when = '오전';
            elseif (substr($t, -3) === '_pm' || strpos($t, 'pm') !== false) $when = '오후';
            $byDay[$date][] = ['이름' => (string)($u['name'] ?? ''), '종류' => $kind,
                               '때' => $when, '상세' => $when, '원본' => $t];
        }
    }

    // ── 외근 ─────────────────────────────────────────────
    $out = [];
    $put = function ($date, $name, $kind, $time, $site) use (&$out, $ym) {
        if (!$date || strpos((string)$date, $ym) !== 0 || $name === '') return;
        $out[$date][] = ['이름' => $name, '종류' => $kind,
                         '시간' => (string)$time, '장소' => (string)$site];
    };
    foreach ((array)$pt as $i) {
        if (is_array($i)) $put($i['date'] ?? '', (string)($i['ptAssignee'] ?? ''), 'PT',
                               $i['time'] ?? '', $i['siteName'] ?? '');
    }
    foreach ((array)$br as $i) {
        if (is_array($i)) $put($i['date'] ?? '', (string)($i['assignee'] ?? ''), '현설',
                               $i['time'] ?? '', $i['siteName'] ?? '');
    }
    foreach ((array)$per as $i) {
        if (!is_array($i)) continue;
        $title = (string)($i['title'] ?? '');
        if (mb_strpos($title, '연차') !== false || mb_strpos($title, '휴가') !== false) continue;
        $name = (string)(is_array($i['assignees'] ?? null) ? ($i['assignees'][0] ?? '') : '');
        if ($name === '') continue;
        $put($i['date'] ?? '', $name, per_type($title), $i['time'] ?? '', per_site($i, $name));
    }
    foreach ((array)$man as $k => $m) {
        if (is_array($m)) $put($m['date'] ?? '', (string)($m['name'] ?? ''), '외근',
                               $m['time'] ?? '', $m['siteName'] ?? '');
    }

    ksort($byDay); ksort($out);
    return ['달' => $ym, '휴가' => $byDay, '공휴일' => (array)$hol, '외근' => $out,
            '동기화된때' => is_scalar($sync) ? $sync : null, 'updatedAt' => date('c')];
}

function cache_file($dir, $ym) { return $dir . '/workcal-' . preg_replace('/[^0-9\-]/', '', $ym) . '.php'; }

$action = $_GET['action'] ?? 'list';
$c = conf($CONF_FILE);

if ($action === 'setup') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $b = json_decode((string)file_get_contents('php://input'), true);
    $new = ['db'   => rtrim(trim((string)($b['db']   ?? $c['db'])), '/'),
            'site' => trim((string)($b['site'] ?? $c['site'])),
            'secs' => (int)($b['secs'] ?? $c['secs']),
            'off'  => !empty($b['off'])];
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true) && !is_dir($DATA_DIR)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들지 못했습니다'], 500);
    }
    if (!bh_write_raw($CONF_FILE, "<?php exit; ?>\n" . json_encode($new, JSON_UNESCAPED_UNICODE))) {
        jout(['ok' => false, 'error' => '설정을 저장하지 못했습니다'], 500);
    }
    foreach ((array)@glob($DATA_DIR . '/workcal-2*.php') as $f) @unlink($f);   // 받아둔 것 비움
    jout(['ok' => true, '설정' => $new, '안내' => '맞췄습니다']);
}

if ($action === 'check') {
    $ym  = date('Y-m');
    $f   = cache_file($DATA_DIR, $ym);
    $raw = bh_read_raw($f);
    $j   = $raw === '' ? null : json_decode(preg_replace('/^<\?php.*?\n/s', '', $raw), true);
    jout(['ok' => true, '주소' => $c['site'], '파이어베이스' => $c['db'], '끔' => $c['off'],
          '이번달받아둠' => is_array($j), '받아온때' => $j['updatedAt'] ?? null,
          '동기화된때' => $j['동기화된때'] ?? null]);
}

if ($action === 'list' || $action === 'refresh') {
    if ($c['off']) jout(['ok' => true, '끔' => true, '안내' => '근무현황 연결을 꺼두었습니다']);

    $ym = (string)($_GET['ym'] ?? date('Y-m'));
    if (!preg_match('/^\d{4}-\d{2}$/', $ym)) jout(['ok' => false, 'error' => '달을 YYYY-MM 으로 주세요'], 400);

    $f   = cache_file($DATA_DIR, $ym);
    $raw = bh_read_raw($f);
    $old = $raw === '' ? null : json_decode(preg_replace('/^<\?php.*?\n/s', '', $raw), true);
    $age = (is_array($old) && !empty($old['updatedAt'])) ? (time() - strtotime($old['updatedAt'])) : PHP_INT_MAX;
    $need = ($action === 'refresh') || $age > $MAXAGE || !is_array($old);

    $why = []; $fresh = null;
    if ($need) {
        $fresh = fetch_month($c, $ym, $why);
        if (is_array($fresh)) {
            bh_write_raw($f, "<?php exit; ?>\n" . json_encode($fresh, JSON_UNESCAPED_UNICODE));
            $old = $fresh;
        }
    }
    if (!is_array($old)) {
        jout(['ok' => false, '문제' => true,
              'error' => "근무현황 캘린더에서 받아오지 못했습니다.\n\n시도한 방법:\n · "
                       . implode("\n · ", $why)
                       . "\n\nNAS 가 인터넷에 나갈 수 있는지 확인해 주세요."], 502);
    }

    $n = 0; foreach ((array)$old['휴가'] as $a) $n += count($a);
    $m = 0; foreach ((array)$old['외근'] as $a) $m += count($a);
    jout(['ok' => true] + $old + [
        '휴가수' => $n, '외근수' => $m, '주소' => $c['site'],
        '새로받음' => is_array($fresh),
        '문제' => (is_array($fresh) || !$need) ? null
                 : ('새로 받아오지 못해 예전 것을 보여줍니다: ' . implode(' / ', $why))]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
