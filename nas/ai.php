<?php
/**
 * 브랜드 허브 - AI 정리 도우미
 *
 * 거칠게 적은 메모를 받아, 대시보드 여정 양식(무엇을 했나 / 왜 했나 /
 * 어떻게 됐나 / 그래서 다음은)에 맞게 정리해 돌려줍니다.
 *
 * API 키는 이 파일이 아니라 같은 폴더의 config.php 에 둡니다.
 * 브라우저로는 키가 절대 내려가지 않습니다.
 */

header('Content-Type: application/json; charset=utf-8');

function jout($arr, $code = 200) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------------- 설정 읽기 ---------------- */
$configPath = __DIR__ . '/config.php';
$config = is_file($configPath) ? include $configPath : null;
$hasKey = is_array($config)
    && !empty($config['api_key'])
    && strpos($config['api_key'], 'sk-ant-') === 0
    && strpos($config['api_key'], '여기에') === false;

$action = $_GET['action'] ?? '';

/* ---------------- 상태 확인 ---------------- */
if ($action === 'check') {
    jout([
        'ok'          => $hasKey,
        'config파일'  => is_file($configPath) ? '있음' : '없음 — config.sample.php 를 config.php 로 복사하세요',
        'api키'       => $hasKey ? '설정됨' : '설정 안 됨',
        '모델'        => $config['model'] ?? 'claude-opus-5',
        'curl'        => function_exists('curl_init') ? '사용 가능' : '꺼져 있음 (wget 으로 대체)',
        'wget'        => function_exists('shell_exec') ? '사용 가능' : '막혀 있음',
    ]);
}

if (!$hasKey) {
    jout(['ok' => false, 'error' =>
        'AI 기능이 아직 설정되지 않았습니다. NAS의 web/brand 폴더에서 '
        . 'config.sample.php 를 config.php 로 복사하고 API 키를 넣어주세요.'], 400);
}

/* ---------------- Claude 호출 ---------------- */
function call_claude($apiKey, $payload) {
    $url  = 'https://api.anthropic.com/v1/messages';
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $headers = [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ];

    // 1) curl 확장
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 180,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        if ($res !== false) return [$code, $res];
        return [0, json_encode(['error' => ['message' => 'curl 오류: ' . $err]])];
    }

    // 2) wget (curl 확장이 꺼져 있을 때)
    if (function_exists('shell_exec')) {
        $cmd = 'wget -q -O - -T 180 --post-data=' . escapeshellarg($body);
        foreach ($headers as $h) $cmd .= ' --header=' . escapeshellarg($h);
        $cmd .= ' ' . escapeshellarg($url) . ' 2>/dev/null';
        $res = shell_exec($cmd);
        if ($res !== null && $res !== '') return [200, $res];
        return [0, json_encode(['error' => ['message' =>
            'wget 으로 호출했지만 응답이 없습니다. NAS가 외부 인터넷에 나갈 수 있는지 확인해 주세요.']])];
    }

    return [0, json_encode(['error' => ['message' =>
        'PHP에서 외부 호출이 막혀 있습니다. Web Station의 PHP 프로필에서 curl 확장을 켜주세요.']])];
}

/* 정리 결과가 항상 같은 형태로 오도록 형식을 고정합니다 */
const JOURNEY_SCHEMA = [
    'type' => 'object',
    'properties' => [
        'title'  => ['type' => 'string', 'description' => '무엇을 했는지 한 줄로. 20자 내외'],
        'status' => ['type' => 'string', 'enum' => ['진행 중', '성공', '실패', '중단', '보류']],
        'period' => ['type' => 'string', 'description' => '시기. 알 수 없으면 빈 문자열'],
        'why'    => ['type' => 'string', 'description' => '왜 이걸 했는지, 어떤 판단이었는지'],
        'result' => ['type' => 'string', 'description' => '실제로 어떻게 됐는지'],
        'next'   => ['type' => 'string', 'description' => '여기서 배운 것과 다음 방향'],
        'note'   => ['type' => 'string', 'description' => '원문에 없어 추측한 부분이 있으면 여기에 짧게. 없으면 빈 문자열'],
    ],
    'required' => ['title', 'status', 'period', 'why', 'result', 'next', 'note'],
    'additionalProperties' => false,
];

const SYSTEM_PROMPT = <<<'TXT'
당신은 브랜드 담당자의 메모를 사내 브랜드 대시보드의 "여정" 기록으로 정리하는 편집자입니다.

여정 기록은 나중에 읽는 사람이 "왜 그런 판단을 했는지"를 이해할 수 있어야 합니다.
다음 형식에 맞춰 정리하세요.

- title  : 무엇을 했는지 한 줄. 명사형으로 간결하게 (예: "정기구독 모델 전환")
- status : 진행 중 / 성공 / 실패 / 중단 / 보류 중 하나
- period : 시기. 메모에 있으면 그대로, 없으면 빈 문자열
- why    : 왜 이걸 했는지. 어떤 문제를 풀려 했고 어떤 판단이었는지
- result : 실제로 어떻게 됐는지. 숫자가 있으면 반드시 살릴 것
- next   : 여기서 배운 것과 그래서 다음은 무엇인지

작성 규칙
1. 사실을 지어내지 마세요. 특히 숫자, 날짜, 회사명, 성과는 메모에 없으면 절대 만들지 않습니다.
2. 메모가 짧으면 문장을 다듬고 맥락을 이어 읽히게 보완하되, 새로운 사실을 추가하지는 않습니다.
3. 메모에 근거가 없어 비워둔 항목은 빈 문자열로 두고, 무엇이 부족한지 note 에 한 줄로 적으세요.
4. 추측해서 채운 부분이 있다면 note 에 "○○는 추측입니다"처럼 밝히세요.
5. 담백한 한국어 평서문으로 씁니다. 과장이나 홍보 문구는 쓰지 않습니다.
TXT;

/* ---------------- 메모 정리 ---------------- */
if ($action === 'journey') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);

    $in    = json_decode(file_get_contents('php://input'), true) ?: [];
    $raw   = trim($in['raw'] ?? '');
    $brand = trim($in['brand'] ?? '');
    $mode  = $in['mode'] ?? 'new';        // new = 메모 정리 · polish = 기존 내용 다듬기

    if ($raw === '') jout(['ok' => false, 'error' => '정리할 내용이 비어 있습니다'], 400);

    $userText = "브랜드: " . ($brand !== '' ? $brand : '(미지정)') . "\n\n";
    $userText .= $mode === 'polish'
        ? "아래는 이미 작성된 여정 기록입니다. 사실은 그대로 두고 문장만 다듬어 읽기 좋게 정리해 주세요.\n\n"
        : "아래 메모를 여정 기록으로 정리해 주세요.\n\n";
    $userText .= "---\n" . $raw . "\n---";

    [$code, $res] = call_claude($config['api_key'], [
        'model'         => $config['model'] ?? 'claude-opus-5',
        'max_tokens'    => (int)($config['max_tokens'] ?? 8000),
        'thinking'      => ['type' => 'adaptive'],
        'output_config' => [
            'effort' => 'medium',
            'format' => ['type' => 'json_schema', 'schema' => JOURNEY_SCHEMA],
        ],
        'system'   => SYSTEM_PROMPT,
        'messages' => [['role' => 'user', 'content' => $userText]],
    ]);

    $json = json_decode($res, true);

    if ($code !== 200 || !is_array($json)) {
        $msg = $json['error']['message'] ?? ('응답을 이해할 수 없습니다 (HTTP ' . $code . ')');
        if ($code === 401) $msg = 'API 키가 올바르지 않습니다. config.php 를 확인해 주세요.';
        if ($code === 429) $msg = '요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.';
        jout(['ok' => false, 'error' => $msg], 502);
    }

    if (($json['stop_reason'] ?? '') === 'refusal') {
        jout(['ok' => false, 'error' => 'AI가 이 내용의 처리를 거절했습니다. 내용을 바꿔 다시 시도해 주세요.'], 400);
    }

    // 형식을 고정했으므로 첫 text 블록이 곧 결과 JSON 입니다
    $text = '';
    foreach ($json['content'] ?? [] as $block) {
        if (($block['type'] ?? '') === 'text') { $text = $block['text']; break; }
    }
    $parsed = json_decode($text, true);
    if (!is_array($parsed)) {
        jout(['ok' => false, 'error' => 'AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.'], 502);
    }

    $u = $json['usage'] ?? [];
    jout([
        'ok'     => true,
        'result' => $parsed,
        'usage'  => [
            '입력토큰' => $u['input_tokens'] ?? 0,
            '출력토큰' => $u['output_tokens'] ?? 0,
        ],
    ]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
