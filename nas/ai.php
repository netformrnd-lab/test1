<?php
/**
 * AI 요약 — 회의록을 정리해 줍니다
 *
 *   ?action=check                 준비됐는지 확인
 *   ?action=net                   왜 AI 에 못 붙는지 점검 (네트워크)
 *   ?action=setkey  (POST)        API 키 저장 (한 번만)
 *   ?action=summarize (POST)      회의 내용을 요약
 *
 * ── 왜 NAS 가 대신 부르나 ───────────────────────────────────────
 * 사무실 브라우저는 밖으로 못 나가고, 키를 브라우저에 두면 대시보드를 여는
 * 누구나 볼 수 있습니다. 그래서 키는 NAS 에만 두고 NAS 가 대신 물어봅니다.
 *
 * 키는 data/ai-key.php 에 PHP 파일로 저장합니다. 주소로 직접 열어도
 * 내용이 보이지 않고 실행만 되어 빈 화면이 나옵니다.
 * 어떤 응답에도 키를 되돌려주지 않습니다.
 */

/* 로그인한 사람만 통과합니다 (계정을 안 만들었으면 예전처럼 누구나) */
if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';   // 파일이 아직 안 왔으면 예전처럼 동작합니다
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
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

$DATA_DIR = __DIR__ . '/data';
$KEY_FILE = $DATA_DIR . '/ai-key.php';
$LOG_FILE = $DATA_DIR . '/ai-usage.json';

$MODEL      = 'claude-opus-5';
$MAX_TOKENS = 8000;
$MAX_INPUT  = 60000;      // 글자 수 상한 (너무 긴 회의록은 잘라 알려줍니다)

function jout($a, $code = 200) {
    http_response_code(200);                  // 오류도 200 (웹 스테이션이 내용을 바꿔치기 함)
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

function load_key($f) {
    if (!is_file($f)) return '';
    $v = @include $f;                          // 파일이 키를 return 합니다
    return is_string($v) ? trim($v) : '';
}

/** 인터넷으로 물어봅니다. NAS 마다 막힌 방법이 달라 세 가지를 차례로 씁니다. */
function ai_post($url, $headers, $body, &$why) {
    $why = [];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 180, CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $out  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        if ($out !== false && $code > 0) return [$code, $out];
        $why[] = 'curl: ' . ($err ?: '실패');
    } else { $why[] = 'curl 확장이 꺼져 있습니다'; }

    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST', 'header' => implode("\r\n", $headers),
            'content' => $body, 'timeout' => 180, 'ignore_errors' => true,
        ]]);
        $out = @file_get_contents($url, false, $ctx);
        if ($out !== false) {
            $code = 0;
            foreach (($http_response_header ?? []) as $h) {
                if (preg_match('#^HTTP/[\d.]+\s+(\d{3})#', $h, $m)) $code = (int)$m[1];
            }
            return [$code, $out];
        }
        $why[] = 'file_get_contents 실패';
    } else { $why[] = 'allow_url_fopen 이 꺼져 있습니다'; }

    if (function_exists('shell_exec')) {
        $tmpB = tempnam(sys_get_temp_dir(), 'aib');
        $tmpO = tempnam(sys_get_temp_dir(), 'aio');
        file_put_contents($tmpB, $body);
        $cmd = 'wget -q -T 180 -O ' . escapeshellarg($tmpO)
             . ' --post-file=' . escapeshellarg($tmpB);
        foreach ($headers as $h) $cmd .= ' --header=' . escapeshellarg($h);
        $cmd .= ' ' . escapeshellarg($url) . ' 2>/dev/null';
        @shell_exec($cmd);
        $out = @file_get_contents($tmpO);
        @unlink($tmpB); @unlink($tmpO);
        if (is_string($out) && $out !== '') return [200, $out];
        $why[] = 'wget 으로도 받지 못했습니다';
    } else { $why[] = 'shell_exec 이 막혀 있습니다'; }

    return [0, false];
}

$action = $_GET['action'] ?? 'check';
$key    = load_key($KEY_FILE);

/* ═══════════════ 왜 AI 에 못 붙나 (점검) ═══════════════════════════
   NAS 가 밖으로 나가는 길이 막히면 AI 가 안 됩니다.
   어디가 막혔는지 하나씩 짚어 알려줍니다. (?action=net)
   ================================================================= */
function net_try($url, $sec = 6) {
    $out = [];

    // 1) curl
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_NOBODY => false,
            CURLOPT_TIMEOUT => $sec, CURLOPT_CONNECTTIMEOUT => $sec, CURLOPT_FOLLOWLOCATION => true]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        $out['curl'] = $code > 0 ? ('HTTP ' . $code) : ('실패: ' . ($err ?: '알 수 없음'));
    } else {
        $out['curl'] = '확장이 꺼져 있음';
    }

    // 2) PHP 내장
    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(['http' => ['timeout' => $sec, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach (($http_response_header ?? []) as $h) {
            if (preg_match('#^HTTP/[\d.]+\s+(\d{3})#', $h, $m)) $code = (int)$m[1];
        }
        $out['file_get_contents'] = $body !== false ? ('HTTP ' . ($code ?: '200')) : '실패';
    } else {
        $out['file_get_contents'] = 'allow_url_fopen 이 꺼져 있음';
    }

    // 3) wget
    if (function_exists('shell_exec')) {
        $tmp = tempnam(sys_get_temp_dir(), 'net');
        @shell_exec('wget -q -T ' . (int)$sec . ' -O ' . escapeshellarg($tmp) . ' '
                  . escapeshellarg($url) . ' 2>/dev/null');
        $got = @filesize($tmp);
        @unlink($tmp);
        $out['wget'] = ($got > 0) ? '받아옴' : '받지 못함';
    } else {
        $out['wget'] = 'shell_exec 이 막혀 있음';
    }
    return $out;
}

function net_ok($r) {
    foreach ($r as $v) {
        if (strpos($v, 'HTTP ') === 0 || $v === '받아옴') return true;
    }
    return false;
}

if ($action === 'net') {
    @set_time_limit(60);

    $wget = function_exists('shell_exec') ? trim((string)@shell_exec('command -v wget 2>/dev/null')) : '';
    $dns  = @gethostbyname('api.anthropic.com');
    $dnsOk = ($dns !== 'api.anthropic.com' && filter_var($dns, FILTER_VALIDATE_IP));

    $anth = net_try('https://api.anthropic.com/v1/models');       // 키 없이도 401 이면 「닿았다」
    $gh   = net_try('https://raw.githubusercontent.com/netformrnd-lab/test1/refs/heads/claude/ja-brand-dashboard-nas-4lvyrk/nas/manifest.txt');

    $anthOk = net_ok($anth);
    $ghOk   = net_ok($gh);

    // 무엇을 하면 되는지 골라 줍니다
    $todo = [];
    if (!function_exists('curl_init')) {
        $todo[] = 'DSM → 웹 스테이션 → PHP 프로필 → 우리 프로필 [편집] → 「확장」 에서 '
                . 'curl 을 켜고 저장하세요. 이것만으로 되는 경우가 가장 많습니다.';
    }
    if (!$dnsOk) {
        $todo[] = 'NAS 가 주소를 찾지 못합니다(DNS). DSM → 제어판 → 네트워크 → 「일반」 에서 '
                . 'DNS 서버를 8.8.8.8 로 넣어보세요.';
    }
    if ($dnsOk && !$anthOk && $ghOk) {
        $todo[] = '인터넷은 되는데 api.anthropic.com 만 막혔습니다. 방화벽·보안 정책에서 '
                . 'api.anthropic.com (443) 을 열어주세요.';
    }
    if ($dnsOk && !$anthOk && !$ghOk) {
        $todo[] = 'NAS 가 인터넷으로 아예 못 나갑니다. DSM → 제어판 → 네트워크 에서 '
                . '게이트웨이·DNS 를 확인하고, 회사 방화벽에서 NAS 의 바깥 접속이 막혀 있는지 '
                . '살펴보세요.';
    }
    if ($anthOk && $key === '') $todo[] = '길은 열려 있습니다. [🔑 AI 키 넣기] 로 키만 넣으면 됩니다.';
    if ($anthOk && $key !== '') $todo[] = '지금은 길이 열려 있습니다. 다시 한 번 해보세요.';

    jout([
        'ok' => true,
        '한줄'   => $anthOk ? '✅ AI 서버까지 닿습니다'
                            : ($ghOk ? '⚠️ 인터넷은 되는데 AI 서버만 막혀 있습니다'
                                     : '❌ NAS 가 인터넷으로 나가지 못합니다'),
        '닿나'   => ['AI 서버(api.anthropic.com)' => $anthOk ? '예' : '아니오',
                     '다른 사이트(github)'         => $ghOk   ? '예' : '아니오'],
        '주소찾기(DNS)' => $dnsOk ? ('예 · ' . $dns) : '아니오 — 이름을 못 찾습니다',
        '나가는 방법'   => [
            'curl 확장'        => function_exists('curl_init') ? '켜짐' : '꺼짐',
            'allow_url_fopen'  => ini_get('allow_url_fopen') ? '켜짐' : '꺼짐',
            'openssl(https)'   => extension_loaded('openssl') ? '켜짐' : '꺼짐',
            'shell_exec'       => function_exists('shell_exec') ? '가능' : '막힘',
            'wget'             => $wget !== '' ? $wget : '없음',
        ],
        'AI 서버에 해본 것'   => $anth,
        '다른 사이트에 해본 것' => $gh,
        '프록시설정' => [
            'http_proxy'  => getenv('http_proxy') ?: '(없음)',
            'https_proxy' => getenv('https_proxy') ?: '(없음)',
        ],
        '키등록됨' => $key !== '',
        '이렇게 해보세요' => $todo ?: ['특별히 손볼 곳이 보이지 않습니다.'],
    ]);
}

if ($action === 'check') {
    $u = is_file($LOG_FILE) ? json_decode((string)@file_get_contents($LOG_FILE), true) : null;
    jout([
        'ok'        => true,
        '키등록됨'  => $key !== '',
        '키앞자리'  => $key !== '' ? substr($key, 0, 7) . '…' : '',   // 확인용, 전체는 절대 안 보냅니다
        '모델'      => $MODEL,
        '쓴횟수'    => is_array($u) ? (int)($u['count'] ?? 0) : 0,
        '마지막'    => is_array($u) ? ($u['at'] ?? null) : null,
        '폴더쓰기'  => is_writable($DATA_DIR) ? '가능' : '불가',
    ]);
}

if ($action === 'setkey') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $b = json_decode((string)file_get_contents('php://input'), true);
    $k = trim((string)($b['key'] ?? ''));

    if ($k === '') {                                   // 빈 값이면 지웁니다
        if (is_file($KEY_FILE)) @unlink($KEY_FILE);
        jout(['ok' => true, '키등록됨' => false, '안내' => '키를 지웠습니다']);
    }
    if (!preg_match('/^sk-ant-[A-Za-z0-9_\-]{20,200}$/', $k)) {
        jout(['ok' => false, 'error' =>
            'Anthropic 키 모양이 아닙니다. console.anthropic.com 에서 만든 '
            . '"sk-ant-" 로 시작하는 키를 넣어주세요.'], 400);
    }
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true) && !is_dir($DATA_DIR)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들지 못했습니다'], 500);
    }
    $php = "<?php\n// 이 파일은 대시보드가 만든 것입니다. 직접 고치지 마세요.\n"
         . "// 주소로 열어도 내용이 보이지 않습니다.\nreturn " . var_export($k, true) . ";\n";
    $tmp = $KEY_FILE . '.tmp' . getmypid();
    if (@file_put_contents($tmp, $php) === false || !@rename($tmp, $KEY_FILE)) {
        @unlink($tmp);
        jout(['ok' => false, 'error' => '키를 저장하지 못했습니다 (data 폴더 권한 확인)'], 500);
    }
    @chmod($KEY_FILE, 0640);
    jout(['ok' => true, '키등록됨' => true, '안내' => '키를 NAS 에만 저장했습니다']);
}

/* ---------------- 브랜드북 → 마스터프롬프트 ---------------- */
if ($action === 'prompt') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    if ($key === '') {
        jout(['ok' => false, 'error' =>
            'AI 키가 아직 없습니다. [🔑 AI 키 넣기] 로 한 번만 넣어주세요.'], 400);
    }

    $b     = json_decode((string)file_get_contents('php://input'), true);
    $book  = trim((string)($b['book'] ?? ''));
    $brand = trim((string)($b['brand'] ?? ''));
    if ($book === '') jout(['ok' => false, 'error' => '브랜드북 내용이 비어 있습니다'], 400);

    $cut = false;
    if (function_exists('mb_strlen') && mb_strlen($book, 'UTF-8') > $MAX_INPUT) {
        $book = mb_substr($book, 0, $MAX_INPUT, 'UTF-8');
        $cut = true;
    }

    $sys = "당신은 브랜드 마케팅 실무자를 돕는 사람입니다.\n"
         . "받은 브랜드북을 읽고, 다른 AI 에게 그대로 붙여넣어 쓸 수 있는\n"
         . "「마스터프롬프트」를 한국어로 써 주세요.\n\n"
         . "형식 (이 제목들을 그대로 쓰세요):\n"
         . "당신은 [브랜드]의 마케팅 담당자입니다. 로 시작하는 한 문단\n\n"
         . "[브랜드 정의]\n"
         . "[핵심 고객]\n"
         . "[우리가 지키는 약속]\n"
         . "[톤앤매너]\n"
         . "[자주 쓰는 표현 / 쓰지 않는 표현]\n"
         . "[경쟁사와 다른 점]\n"
         . "[하지 않는 것]\n"
         . "[글을 쓸 때 지킬 것]\n\n"
         . "규칙:\n"
         . "- 브랜드북에 없는 사실을 지어내지 마세요. 내용이 없는 항목은\n"
         . "  제목만 남기고 「(브랜드북에 아직 없음 — 채워주세요)」 라고 적으세요.\n"
         . "- 설명하지 말고, 바로 붙여넣어 쓸 수 있는 지시문으로 쓰세요.\n"
         . "- 「[글을 쓸 때 지킬 것]」 에는 브랜드북에서 읽어낸 원칙을\n"
         . "  실제로 지킬 수 있는 문장 5~8개로 정리하세요.\n"
         . "- 마크다운 기호(**, ##)는 쓰지 마세요. 그냥 글로 쓰세요.\n"
         . "- 답에는 마스터프롬프트만 쓰세요. 인사말이나 설명을 붙이지 마세요.";

    $user = ($brand !== '' ? "브랜드: $brand\n\n" : '') . "--- 브랜드북 ---\n" . $book;

    $payload = json_encode([
        'model'      => $MODEL,
        'max_tokens' => $MAX_TOKENS,
        'system'     => $sys,
        'thinking'   => ['type' => 'adaptive'],
        'messages'   => [['role' => 'user', 'content' => $user]],
    ], JSON_UNESCAPED_UNICODE);

    [$code, $raw] = ai_post('https://api.anthropic.com/v1/messages', [
        'Content-Type: application/json',
        'x-api-key: ' . $key,
        'anthropic-version: 2023-06-01',
    ], $payload, $why);

    if ($raw === false) {
        jout(['ok' => false, 'error' =>
            "AI 에 연결하지 못했습니다.\n\n시도한 방법:\n · " . implode("\n · ", $why)
            . "\n\nNAS 가 인터넷에 나갈 수 있는지 확인해 주세요."], 502);
    }
    $j = json_decode($raw, true);
    if ($code === 401 || $code === 403) {
        jout(['ok' => false, 'error' => "AI 키가 거부됐습니다 (HTTP $code). 키를 다시 넣어주세요."], 401);
    }
    if ($code === 429) {
        jout(['ok' => false, 'error' => '잠시 뒤에 다시 시도해 주세요 (요청이 몰렸습니다).'], 429);
    }
    if (!is_array($j) || isset($j['error'])) {
        $msg = is_array($j) && isset($j['error']['message']) ? $j['error']['message']
             : substr((string)$raw, 0, 300);
        jout(['ok' => false, 'error' => "AI 가 오류를 돌려줬습니다 (HTTP $code)\n\n" . $msg], 502);
    }
    if (($j['stop_reason'] ?? '') === 'refusal') {
        jout(['ok' => false, 'error' => 'AI 가 이 내용은 쓸 수 없다고 답했습니다.'], 400);
    }

    $text = '';
    foreach (($j['content'] ?? []) as $blk) {
        if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
    }
    $text = trim($text);
    if ($text === '') jout(['ok' => false, 'error' => 'AI 가 빈 답을 보냈습니다. 다시 시도해 주세요.'], 502);

    @file_put_contents($LOG_FILE, json_encode([
        'count' => (int)((json_decode((string)@file_get_contents($LOG_FILE), true)['count'] ?? 0)) + 1,
        'at'    => date('c'),
    ], JSON_UNESCAPED_UNICODE));

    $usage = $j['usage'] ?? [];
    jout(['ok' => true, '프롬프트' => $text, '잘림' => $cut, '만든때' => date('c'),
          '쓴글자' => (int)($usage['input_tokens'] ?? 0),
          '만든글자' => (int)($usage['output_tokens'] ?? 0)]);
}

if ($action === 'summarize') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    if ($key === '') {
        jout(['ok' => false, 'error' =>
            'AI 키가 아직 없습니다. 회의록 화면의 [🔑 AI 키 넣기] 로 한 번만 넣어주세요.'], 400);
    }

    $b     = json_decode((string)file_get_contents('php://input'), true);
    $notes = trim((string)($b['notes'] ?? ''));
    $title = trim((string)($b['title'] ?? ''));
    $brand = trim((string)($b['brand'] ?? ''));
    if ($notes === '') jout(['ok' => false, 'error' => '회의 내용이 비어 있습니다'], 400);

    $cut = false;
    if (function_exists('mb_strlen') && mb_strlen($notes, 'UTF-8') > $MAX_INPUT) {
        $notes = mb_substr($notes, 0, $MAX_INPUT, 'UTF-8');
        $cut = true;
    }

    $sys = "당신은 한국 중소기업 브랜드 마케팅팀의 회의록을 정리하는 사람입니다.\n"
         . "받은 메모를 읽고 아래 JSON 형식으로만 답하세요. 다른 말은 쓰지 마세요.\n\n"
         . "{\n"
         . '  "요약": "3~6문장. 무엇을 논의했고 무엇이 정해졌는지.",' . "\n"
         . '  "결정사항": ["정해진 것만. 없으면 빈 배열"],' . "\n"
         . '  "할일": [{"내용":"할 일", "담당":"이름 또는 빈 문자열", "기한":"YYYY-MM-DD 또는 빈 문자열"}],' . "\n"
         . '  "다음회의": "다음에 다룰 것. 없으면 빈 문자열",' . "\n"
         . '  "확인필요": ["메모만으로는 불분명해 사람이 확인해야 하는 것"]' . "\n"
         . "}\n\n"
         . "규칙:\n"
         . "- 메모에 없는 내용을 지어내지 마세요. 불확실하면 「확인필요」에 넣으세요.\n"
         . "- 담당자·기한은 메모에 적혀 있을 때만 채우세요. 추측하지 마세요.\n"
         . "- 존댓말로, 짧고 담백하게 쓰세요.";

    $user = ($brand !== '' ? "브랜드: $brand\n" : '')
          . ($title !== '' ? "회의 제목: $title\n" : '')
          . "\n--- 회의 메모 ---\n" . $notes;

    $payload = json_encode([
        'model'      => $MODEL,
        'max_tokens' => $MAX_TOKENS,
        'system'     => $sys,
        'thinking'   => ['type' => 'adaptive'],
        'messages'   => [['role' => 'user', 'content' => $user]],
    ], JSON_UNESCAPED_UNICODE);

    [$code, $raw] = ai_post('https://api.anthropic.com/v1/messages', [
        'Content-Type: application/json',
        'x-api-key: ' . $key,
        'anthropic-version: 2023-06-01',
    ], $payload, $why);

    if ($raw === false) {
        jout(['ok' => false, 'error' =>
            "AI 에 연결하지 못했습니다.\n\n시도한 방법:\n · " . implode("\n · ", $why)
            . "\n\nNAS 가 인터넷에 나갈 수 있는지 확인해 주세요."], 502);
    }

    $j = json_decode($raw, true);
    if ($code === 401 || $code === 403) {
        jout(['ok' => false, 'error' =>
            "AI 키가 거부됐습니다 (HTTP $code). 키를 다시 넣어주세요.\n"
            . '회사 네트워크가 중간에서 막고 있을 수도 있습니다.'], 401);
    }
    if ($code === 429) {
        jout(['ok' => false, 'error' => '잠시 뒤에 다시 시도해 주세요 (요청이 몰렸습니다).'], 429);
    }
    if (!is_array($j) || isset($j['error'])) {
        $msg = is_array($j) && isset($j['error']['message']) ? $j['error']['message']
             : substr((string)$raw, 0, 300);
        jout(['ok' => false, 'error' => "AI 가 오류를 돌려줬습니다 (HTTP $code)\n\n" . $msg], 502);
    }
    if (($j['stop_reason'] ?? '') === 'refusal') {
        jout(['ok' => false, 'error' => 'AI 가 이 내용은 정리할 수 없다고 답했습니다.'], 400);
    }

    // 답에서 글자 블록만 모읍니다 (생각 블록은 건너뜁니다)
    $text = '';
    foreach (($j['content'] ?? []) as $blk) {
        if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
    }
    $text = trim($text);

    // JSON 으로 답하라고 했지만, 앞뒤에 다른 말이 붙는 경우도 대비합니다
    $parsed = json_decode($text, true);
    if (!is_array($parsed) && preg_match('/\{.*\}/s', $text, $m)) {
        $parsed = json_decode($m[0], true);
    }
    if (!is_array($parsed)) {
        jout(['ok' => true, '요약' => $text, '결정사항' => [], '할일' => [],
              '다음회의' => '', '확인필요' => [], '형식' => '글', '잘림' => $cut]);
    }

    $usage = $j['usage'] ?? [];
    @file_put_contents($LOG_FILE, json_encode([
        'count' => (int)((json_decode((string)@file_get_contents($LOG_FILE), true)['count'] ?? 0)) + 1,
        'at'    => date('c'),
    ], JSON_UNESCAPED_UNICODE));

    jout([
        'ok'        => true,
        '요약'      => (string)($parsed['요약'] ?? ''),
        '결정사항'  => is_array($parsed['결정사항'] ?? null) ? $parsed['결정사항'] : [],
        '할일'      => is_array($parsed['할일'] ?? null) ? $parsed['할일'] : [],
        '다음회의'  => (string)($parsed['다음회의'] ?? ''),
        '확인필요'  => is_array($parsed['확인필요'] ?? null) ? $parsed['확인필요'] : [],
        '형식'      => 'json',
        '잘림'      => $cut,
        '쓴글자'    => (int)($usage['input_tokens'] ?? 0),
        '만든글자'  => (int)($usage['output_tokens'] ?? 0),
    ]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
