<?php
/**
 * AI 요약 — 회의록을 정리해 줍니다
 *
 *   ?action=check                 준비됐는지 확인
 *   ?action=net                   왜 AI 에 못 붙는지 점검 (네트워크)
 *   ?action=taskcheck             오래 걸리는 작업(마누스)이 끝났는지 확인
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
$LOG_FILE   = $DATA_DIR . '/ai-usage.json';
$MODEL_FILE  = $DATA_DIR . '/ai-model.txt';     // OpenAI 는 계정이 쓸 수 있는 모델을 골라 적어둡니다
$VENDOR_FILE = $DATA_DIR . '/ai-vendor.txt';    // 어느 회사 AI 인지 (키 모양으로 알 수 없는 곳도 있습니다)
$TASK_DIR    = $DATA_DIR . '/ai-tasks';         // 마누스처럼 오래 걸리는 작업의 진행 상황

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

/** wget 으로 한 번 부릅니다.
 *  -q -O 만 쓰면 서버가 401·400 을 주었을 때 아무것도 안 남아서
 *  「받지 못했습니다」 로만 보입니다. 실제 이유(키 거부 등)를 알 수 있게
 *  응답 코드와 본문을 함께 받아옵니다.
 *  옛 wget(--content-on-error 를 모르는 판)이면 예전 방식으로 한 번 더 합니다. */
function bh_wget($url, $headers, $postFile, $sec, &$code, &$note) {
    $code = 0; $note = '';
    if (!function_exists('shell_exec')) { $note = 'shell_exec 이 막혀 있음'; return false; }

    $outF = tempnam(sys_get_temp_dir(), 'wo');
    $errF = tempnam(sys_get_temp_dir(), 'we');
    $mk = function ($extra) use ($url, $headers, $postFile, $sec, $outF, $errF) {
        $c = 'wget' . $extra . ' -T ' . (int)$sec . ' -t 1 -O ' . escapeshellarg($outF);
        foreach ($headers as $h) $c .= ' --header=' . escapeshellarg($h);
        if ($postFile !== null) $c .= ' --post-file=' . escapeshellarg($postFile);
        return $c . ' ' . escapeshellarg($url) . ' 2>' . escapeshellarg($errF);
    };

    $body = false;
    foreach ([' -S --content-on-error', ' -q'] as $extra) {
        @file_put_contents($outF, '');
        @file_put_contents($errF, '');
        @shell_exec($mk($extra));
        $e = (string)@file_get_contents($errF);
        if (preg_match_all('#HTTP/[\d.]+\s+(\d{3})#', $e, $m)) $code = (int)end($m[1]);
        $b = (string)@file_get_contents($outF);
        if ($b !== '' || $code > 0) { $body = $b; break; }
        // 옵션을 못 알아들은 경우에만 예전 방식으로 다시 해봅니다
        $old = stripos($e, 'unrecognized option') !== false
            || stripos($e, 'invalid option')      !== false
            || stripos($e, 'illegal option')      !== false
            || stripos($e, 'unknown option')      !== false;
        if (!$old) {
            // 실패한 까닭만 골라냅니다 (진행 표시 줄은 버립니다)
            foreach (preg_split('/\r?\n/', $e) as $ln) {
                if (preg_match('/(error|failed|unable|refused|timed out|resolve)/i', $ln)) {
                    $note = trim($ln); break;
                }
            }
            if ($note === '') $note = '받지 못함';
            break;
        }
    }
    @unlink($outF); @unlink($errF);

    if ($body === false) { if ($note === '') $note = '받지 못함'; return false; }
    if ($body === '' && $code === 0) { $note = '받지 못함'; return false; }
    return $body;
}

/** 인터넷으로 물어봅니다. NAS 마다 막힌 방법이 달라 세 가지를 차례로 씁니다.
 *  $body 가 null 이면 그냥 받아오기(GET) 입니다. */
function ai_post($url, $headers, $body, &$why) {
    $why = [];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        // ⚠️ CURLOPT_POSTFIELDS 는 값이 null 이어도 POST 로 바꿔버립니다.
        //    받아오기(GET)일 때는 아예 넣지 않아야 합니다.
        $opt = [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 180, CURLOPT_CONNECTTIMEOUT => 10,
        ];
        if ($body !== null) { $opt[CURLOPT_POST] = true; $opt[CURLOPT_POSTFIELDS] = $body; }
        else                { $opt[CURLOPT_HTTPGET] = true; }
        curl_setopt_array($ch, $opt);
        $out  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        if ($out !== false && $code > 0) return [$code, $out];
        $why[] = 'curl: ' . ($err ?: '실패');
    } else { $why[] = 'curl 확장이 꺼져 있습니다'; }

    if (ini_get('allow_url_fopen')) {
        $opt = ['method' => $body === null ? 'GET' : 'POST',
                'header' => implode("\r\n", $headers),
                'timeout' => 180, 'ignore_errors' => true];
        if ($body !== null) $opt['content'] = $body;
        $ctx = stream_context_create(['http' => $opt]);
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
        $tmpB = null;
        if ($body !== null) {
            $tmpB = tempnam(sys_get_temp_dir(), 'aib');
            file_put_contents($tmpB, $body);
        }
        $code = 0; $note = '';
        $out = bh_wget($url, $headers, $tmpB, 180, $code, $note);
        if ($tmpB !== null) @unlink($tmpB);
        // 401·400 같은 오류 응답도 그대로 돌려줍니다. 그래야 진짜 이유가 보입니다.
        if ($out !== false) return [$code ?: 200, $out];
        $why[] = 'wget: ' . ($note ?: '받지 못했습니다');
    } else { $why[] = 'shell_exec 이 막혀 있습니다'; }

    return [0, false];
}

/* ═══════════════ 어느 회사 AI 를 쓰나 ═══════════════════════════════
   키 모양만 보고 알아서 갈라 씁니다.
     sk-ant-…  → Anthropic (클로드)
     sk-…      → OpenAI (챗GPT)
   회사마다 부르는 방법이 조금 달라서, 여기서만 다르게 만들어 보냅니다.
   ================================================================= */
function ai_vendor($key) {
    // 적어둔 값이 있으면 그것을 씁니다 (마누스는 키 모양으로 알 수 없습니다)
    $f = __DIR__ . '/data/ai-vendor.txt';
    if (is_file($f)) {
        $v = trim((string)@file_get_contents($f));
        if (in_array($v, ['openai', 'anthropic', 'manus'], true)) return $v;
    }
    if (strpos($key, 'sk-ant-') === 0) return 'anthropic';
    if (strpos($key, 'sk-') === 0)     return 'openai';
    return '';
}
function ai_vendor_name($v) {
    if ($v === 'openai')    return 'OpenAI (챗GPT)';
    if ($v === 'anthropic') return 'Anthropic (클로드)';
    if ($v === 'manus')     return 'Manus (마누스)';
    return '(모름)';
}

/* ═══════════════ 마누스 ═══════════════════════════════════════════
   마누스는 「물어보면 바로 답」 이 아니라 「일을 시키고 끝나면 받아오는」
   방식입니다. 그래서 두 걸음으로 나눕니다.
     ① 작업 시작 → 작업번호를 받아 화면에 돌려줍니다
     ② 화면이 몇 초마다 「끝났나요?」 물어봅니다
   PHP 가 몇 분씩 붙잡고 있으면 NAS 가 요청을 끊어버리기 때문입니다.
   ================================================================= */
const MANUS_API = 'https://api.manus.ai/v1/tasks';

function manus_head($key, $which = 0) {
    // 회사마다 키를 싣는 자리가 다릅니다. 거절당하면 다음 방법으로 한 번 더 해봅니다.
    //  0) v2 방식 (x-manus-api-key) + 예전 판(API_KEY) 을 함께
    //  1) 흔한 방식 (Authorization: Bearer)
    if ($which === 1) {
        return ['Content-Type: application/json', 'Authorization: Bearer ' . $key];
    }
    return ['Content-Type: application/json',
            'x-manus-api-key: ' . $key,
            'API_KEY: ' . $key];
}

/* 마누스는 한 번에 받는 글 길이에 한도가 있습니다 (5000 토큰).
   한글은 글자 수와 토큰 수가 비슷해서, 글자 수로 넉넉하게 어림잡습니다. */
const MANUS_LIMIT = 4200;        // 안전하게 잡은 글자 수

function manus_fit($text, $limit = MANUS_LIMIT, &$cut = false) {
    $n = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    if ($n <= $limit) { $cut = false; return $text; }
    $cut = true;
    $keep = function_exists('mb_substr') ? mb_substr($text, 0, $limit - 60, 'UTF-8')
                                         : substr($text, 0, $limit - 60);
    return $keep . "\n\n…(길어서 여기까지만 보냈습니다)";
}

/** 작업을 시작합니다 — [응답코드, 원문, 작업번호|''] */
function manus_start($key, $prompt, &$cut = false, $limit = MANUS_LIMIT) {
    $why = [];
    $prompt = manus_fit($prompt, $limit, $cut);
    $body = json_encode(['prompt' => $prompt], JSON_UNESCAPED_UNICODE);
    [$code, $raw] = ai_post(MANUS_API, manus_head($key, manus_head_pref()), $body, $why);
    // 키를 싣는 자리가 다를 수 있습니다 — 거절당하면 다른 방법으로 한 번 더
    if ($raw !== false && ($code === 401 || $code === 403)) {
        [$code2, $raw2] = ai_post(MANUS_API, manus_head($key, manus_head_pref() ? 0 : 1), $body, $why);
        if ($raw2 !== false && $code2 !== 401 && $code2 !== 403) {
            @file_put_contents(__DIR__ . '/data/ai-manus-head.txt', '1');   // 되는 방법을 적어둡니다
            $code = $code2; $raw = $raw2;
        }
    }
    // 「너무 길다」 고 하면 그 한도에 맞춰 한 번 더 줄여서 보냅니다
    if ($raw !== false && $code >= 400) {
        $msg = ai_errmsg($raw);
        if (preg_match('/at most\s+(\d+)\s+estimated tokens/i', (string)$msg, $m)) {
            $newLimit = max(800, (int)round((int)$m[1] * 0.75));
            if ($newLimit < $limit) {
                $prompt2 = manus_fit($prompt, $newLimit, $cut);
                $body2 = json_encode(['prompt' => $prompt2], JSON_UNESCAPED_UNICODE);
                [$code, $raw] = ai_post(MANUS_API, manus_head($key, manus_head_pref()), $body2, $why);
            }
        }
    }
    if ($raw === false) return [$code, false, '', $why];
    $j = json_decode($raw, true);
    $id = '';
    foreach (['task_id', 'taskId', 'id'] as $k) {
        if (!empty($j[$k]) && is_string($j[$k])) { $id = $j[$k]; break; }
    }
    if ($id === '' && !empty($j['data']) && is_array($j['data'])) {
        foreach (['task_id', 'taskId', 'id'] as $k) {
            if (!empty($j['data'][$k])) { $id = (string)$j['data'][$k]; break; }
        }
    }
    return [$code, $raw, $id, $why];
}

/** 마누스 답에서 글자만 뽑아냅니다 (모양이 조금씩 달라도 되게) */
function manus_text($j) {
    $out = '';
    $walk = function ($node) use (&$walk, &$out) {
        if (is_string($node)) return;
        if (!is_array($node)) return;
        // { type:"output_text"|"text", text:"…" }
        if (isset($node['text']) && is_string($node['text'])
            && (!isset($node['type']) || strpos((string)$node['type'], 'text') !== false)) {
            $out .= ($out === '' ? '' : "\n") . $node['text'];
        }
        if (isset($node['content']) && is_string($node['content'])) {
            $out .= ($out === '' ? '' : "\n") . $node['content'];
        }
        foreach ($node as $v) if (is_array($v)) $walk($v);
    };
    // 조수(assistant)가 한 말만 있으면 그것부터
    $pref = [];
    foreach ((array)($j['output'] ?? $j['messages'] ?? []) as $m) {
        if (is_array($m) && (($m['role'] ?? '') === 'assistant')) $pref[] = $m;
    }
    $walk($pref ?: $j);
    return trim($out);
}

/** 끝났는지 물어봅니다 — [상태, 글, 응답코드, 원문] */
function manus_head_pref() {
    $f = __DIR__ . '/data/ai-manus-head.txt';
    return (is_file($f) && trim((string)@file_get_contents($f)) === '1') ? 1 : 0;
}

function manus_poll($key, $id) {
    $why = [];
    $url = MANUS_API . '/' . rawurlencode($id);
    [$code, $raw] = ai_post($url, manus_head($key, manus_head_pref()), null, $why);
    if ($raw !== false && ($code === 401 || $code === 403)) {
        [$c2, $r2] = ai_post($url, manus_head($key, manus_head_pref() ? 0 : 1), null, $why);
        if ($r2 !== false && $c2 !== 401 && $c2 !== 403) { $code = $c2; $raw = $r2; }
    }
    if ($raw === false) return ['모름', '', $code, false];
    $j = json_decode($raw, true);
    $st = strtolower((string)($j['status'] ?? $j['state'] ?? ($j['data']['status'] ?? '')));
    $text = manus_text(is_array($j) ? $j : []);
    if ($st === 'completed' || $st === 'succeeded' || $st === 'success' || $st === 'finished') {
        return ['끝', $text, $code, $raw];
    }
    if ($st === 'failed' || $st === 'error' || $st === 'cancelled' || $st === 'canceled') {
        return ['실패', $text, $code, $raw];
    }
    if ($st === '' && $text !== '') return ['끝', $text, $code, $raw];   // 상태가 없어도 글이 왔으면
    return ['하는 중', $text, $code, $raw];
}

/** OpenAI 는 모델 이름이 자주 바뀝니다. 계정이 실제로 쓸 수 있는 것 중에서 고릅니다. */
function openai_model($key, $modelFile, $force = false) {
    if (!$force && is_file($modelFile)) {
        $m = trim((string)@file_get_contents($modelFile));
        if ($m !== '') return $m;
    }
    $prefer = ['gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4o-mini'];
    $why = [];
    [$code, $raw] = ai_post('https://api.openai.com/v1/models',
        ['Authorization: Bearer ' . $key], null, $why);
    $pick = '';
    if ($raw !== false && $code === 200) {
        $j = json_decode($raw, true);
        $ids = [];
        foreach (($j['data'] ?? []) as $d) if (!empty($d['id'])) $ids[$d['id']] = true;
        foreach ($prefer as $want) if (isset($ids[$want])) { $pick = $want; break; }
        if ($pick === '') {                       // 그래도 없으면 gpt- 로 시작하는 것 중 하나
            foreach (array_keys($ids) as $id) {
                if (strpos($id, 'gpt-') === 0 && strpos($id, 'instruct') === false) { $pick = $id; break; }
            }
        }
    }
    if ($pick === '') $pick = 'gpt-4o';            // 못 물어봤으면 무난한 것으로
    @file_put_contents($modelFile, $pick);
    return $pick;
}

/** 회사에 맞게 물어보고, 글자만 뽑아 돌려줍니다.
 *  돌려주는 값: [응답코드, 원문, 뽑은글자|false, 쓴모델] */
function ai_ask($key, $sys, $user, $maxTokens, $modelFile, &$why) {
    $v = ai_vendor($key);

    if ($v === 'openai') {
        $model = openai_model($key, $modelFile);
        $mk = function ($model, $tokenKey) use ($sys, $user, &$maxTokens) {
            return json_encode([
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $sys],
                    ['role' => 'user',   'content' => $user],
                ],
                $tokenKey => $maxTokens,
            ], JSON_UNESCAPED_UNICODE);
        };
        $head = ['Content-Type: application/json', 'Authorization: Bearer ' . $key];
        $url  = 'https://api.openai.com/v1/chat/completions';

        // 요즘 모델은 max_completion_tokens, 옛 모델은 max_tokens 를 씁니다.
        // 첫 번째로 안 되면 반대쪽으로 한 번 더 해봅니다.
        [$code, $raw] = ai_post($url, $head, $mk($model, 'max_completion_tokens'), $why);
        $j = $raw === false ? null : json_decode($raw, true);
        $emsg = strtolower((string)($j['error']['message'] ?? ''));
        if ($raw !== false && $code !== 200 && strpos($emsg, 'max_completion_tokens') !== false) {
            [$code, $raw] = ai_post($url, $head, $mk($model, 'max_tokens'), $why);
            $j = $raw === false ? null : json_decode($raw, true);
            $emsg = strtolower((string)($j['error']['message'] ?? ''));
        }
        // 모델 이름이 안 맞으면 계정이 쓸 수 있는 것으로 다시 골라 한 번 더
        if ($raw !== false && $code !== 200
            && (strpos($emsg, 'model') !== false && (strpos($emsg, 'not exist') !== false
                || strpos($emsg, 'not found') !== false || strpos($emsg, 'access') !== false))) {
            $model = openai_model($key, $modelFile, true);
            [$code, $raw] = ai_post($url, $head, $mk($model, 'max_completion_tokens'), $why);
            $j = $raw === false ? null : json_decode($raw, true);
        }
        // 진짜로 몰린 것이면 잠깐 쉬었다가 한 번만 다시 물어봅니다
        //  (잔액 문제로 온 429 는 다시 해도 소용없으니 그대로 돌려줍니다)
        if ($raw !== false && $code === 429 && !ai_is_quota(ai_errmsg($raw))) {
            sleep(6);
            // 분당 한도에 걸린 것이면 답 길이를 줄여 부담을 낮춥니다
            $maxTokens = min($maxTokens, 4000);
            [$code, $raw] = ai_post($url, $head, $mk($model, 'max_completion_tokens'), $why);
            $j = $raw === false ? null : json_decode($raw, true);
        }
        if ($raw === false) return [$code, false, false, $model];
        $text = trim((string)($j['choices'][0]['message']['content'] ?? ''));
        return [$code, $raw, $text === '' ? false : $text, $model];
    }

    // Anthropic (클로드)
    $model = 'claude-opus-5';
    $payload = json_encode([
        'model' => $model, 'max_tokens' => $maxTokens, 'system' => $sys,
        'thinking' => ['type' => 'adaptive'],
        'messages' => [['role' => 'user', 'content' => $user]],
    ], JSON_UNESCAPED_UNICODE);
    $head = ['Content-Type: application/json', 'x-api-key: ' . $key,
             'anthropic-version: 2023-06-01'];
    $url  = 'https://api.anthropic.com/v1/messages';
    [$code, $raw] = ai_post($url, $head, $payload, $why);
    if ($raw !== false && $code === 429 && !ai_is_quota(ai_errmsg($raw))) {
        sleep(6);
        [$code, $raw] = ai_post($url, $head, $payload, $why);
    }
    if ($raw === false) return [$code, false, false, $model];
    $j = json_decode($raw, true);
    if (($j['stop_reason'] ?? '') === 'refusal') return [$code, $raw, false, $model];
    $text = '';
    foreach (($j['content'] ?? []) as $blk) if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
    $text = trim($text);
    return [$code, $raw, $text === '' ? false : $text, $model];
}

/** AI 가 돌려준 영어 오류를, 무엇을 해야 하는지 알 수 있는 말로 바꿉니다.
 *  회사에 따라 충전하는 곳이 다르므로 키 종류도 같이 봅니다. */
function ai_friendly($code, $msg, $vendor = '') {
    $m   = strtolower((string)$msg);
    $gpt = ($vendor === 'openai');
    $where = $gpt
        ? "platform.openai.com → 왼쪽 [Settings → Billing] 에서 결제 수단·크레딧을 확인해 주세요."
        : "console.anthropic.com → [Plans & Billing] 에서 크레딧을 충전해 주세요.";
    $sub = $gpt
        ? "(챗GPT Plus 구독료와 API 는 지갑이 다릅니다. 구독 중이어도 API 크레딧이 따로 필요합니다)"
        : "(클로드 구독료와 API 는 지갑이 다릅니다. 쓴 만큼만 나가는 선불입니다)";

    // 돈 문제 — OpenAI 는 이것도 429 로 보냅니다 (insufficient_quota)
    if (strpos($m, 'credit balance') !== false || strpos($m, 'insufficient') !== false
        || strpos($m, 'quota') !== false || strpos($m, 'billing') !== false
        || strpos($m, 'payment') !== false) {
        return "💳 AI 잔액이 떨어졌습니다.\n\n"
             . "대시보드 문제가 아니라 AI 회사 계정에 남은 크레딧이 없는 것입니다.\n"
             . $where . " 충전하면 바로 다시 됩니다.\n" . $sub . "\n\n"
             . "받은 말 그대로: " . $msg;
    }
    if (strpos($m, 'rate limit') !== false || strpos($m, 'rate_limit') !== false
        || strpos($m, 'too many requests') !== false || ($code === 429 && $m === '')) {
        return "⏳ 짧은 사이에 너무 여러 번 물어봤습니다.\n\n"
             . "1~2분 뒤에 다시 눌러주세요. 계속 이러면 계정의 분당 한도가 낮은 것이라\n"
             . ($gpt ? "platform.openai.com → Settings → Limits" : "console.anthropic.com → Limits")
             . " 에서 한도를 확인해 보세요.\n\n"
             . ($msg !== '' ? ("받은 말 그대로: " . $msg) : '');
    }
    if (strpos($m, 'overloaded') !== false) {
        return "AI 서버가 지금 몰려 있습니다. 1~2분 뒤에 다시 해주세요.\n\n받은 말: " . $msg;
    }
    if (strpos($m, 'context length') !== false || strpos($m, 'too long') !== false
        || strpos($m, 'maximum context') !== false) {
        return "내용이 너무 깁니다. 브랜드북(또는 회의록)을 조금 줄여서 다시 해주세요.\n\n"
             . "받은 말: " . $msg;
    }
    if (strpos($m, 'model') !== false && (strpos($m, 'not_found') !== false
        || strpos($m, 'not found') !== false || strpos($m, 'does not exist') !== false)) {
        return "이 키로는 지금 모델을 쓸 수 없습니다.\n"
             . "계정에서 모델 사용 권한을 확인해 주세요.\n\n받은 말: " . $msg;
    }
    if (strpos($m, 'authentication') !== false || strpos($m, 'invalid x-api-key') !== false
        || strpos($m, 'incorrect api key') !== false) {
        return "AI 키가 받아들여지지 않습니다. [🔑 AI 키 넣기] 로 새 키를 넣어주세요.\n\n받은 말: " . $msg;
    }
    return "AI 가 오류를 돌려줬습니다 (HTTP $code)\n\n" . $msg;
}

/** 429 가 「돈이 없어서」 인지 「너무 자주 불러서」 인지 */
function ai_is_quota($msg) {
    $m = strtolower((string)$msg);
    return strpos($m, 'quota') !== false || strpos($m, 'billing') !== false
        || strpos($m, 'credit') !== false || strpos($m, 'insufficient') !== false
        || strpos($m, 'payment') !== false;
}

/** 키가 거부됐을 때 — 「어디에」 물어봤는지 밝혀줍니다.
 *  엉뚱한 회사에 물어보고 있는 경우가 가장 흔하기 때문입니다. */
function ai_key_refused($code, $key) {
    $v = ai_vendor($key);
    $host = ($v === 'manus') ? 'api.manus.ai'
          : (($v === 'openai') ? 'api.openai.com' : 'api.anthropic.com');
    return "AI 키가 거부됐습니다 (HTTP $code).\n\n"
         . "지금 대시보드는 이 키를 「" . ai_vendor_name($v) . "」 의 키로 알고 있어서\n"
         . $host . " 에 물어봤습니다.\n\n"
         . "· 다른 회사(예: 마누스) 키라면 [🔑 AI 키 바꾸기] 에서 키를 다시 넣고\n"
         . "  「어느 AI 인가요?」 에서 맞는 번호를 골라주세요.\n"
         . "· 회사가 맞다면 키가 틀렸거나 만료된 것입니다. 새 키를 만들어 넣어주세요.";
}

/** 응답에서 오류 문구만 꺼냅니다 */
function ai_errmsg($raw) {
    $j = is_string($raw) ? json_decode($raw, true) : null;
    if (is_array($j) && isset($j['error'])) {
        if (is_array($j['error'])) return (string)($j['error']['message'] ?? json_encode($j['error'], JSON_UNESCAPED_UNICODE));
        return (string)$j['error'];
    }
    return is_string($raw) ? trim(substr($raw, 0, 300)) : '';
}

$action = $_GET['action'] ?? 'check';
$key    = load_key($KEY_FILE);

/* ═══════════════ 왜 AI 에 못 붙나 (점검) ═══════════════════════════
   NAS 가 밖으로 나가는 길이 막히면 AI 가 안 됩니다.
   어디가 막혔는지 하나씩 짚어 알려줍니다. (?action=net)
   ================================================================= */
function net_try($url, $sec = 8, $headers = []) {
    $out = [];

    // 1) curl
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $sec, CURLOPT_CONNECTTIMEOUT => $sec,
            CURLOPT_FOLLOWLOCATION => true, CURLOPT_HTTPHEADER => $headers]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        $out['curl'] = $code > 0 ? ('HTTP ' . $code) : ('실패: ' . ($err ?: '알 수 없음'));
    } else {
        $out['curl'] = '확장이 꺼져 있음';
    }

    // 2) PHP 내장 (https 로 나가려면 openssl 이 켜져 있어야 합니다)
    if (!ini_get('allow_url_fopen')) {
        $out['file_get_contents'] = 'allow_url_fopen 이 꺼져 있음';
    } elseif (strpos($url, 'https://') === 0 && !extension_loaded('openssl')) {
        $out['file_get_contents'] = 'openssl 이 꺼져 있어 https 로 못 나감';
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => $sec, 'ignore_errors' => true,
            'header' => implode("\r\n", $headers)]]);
        $body = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach (($http_response_header ?? []) as $h) {
            if (preg_match('#^HTTP/[\d.]+\s+(\d{3})#', $h, $m)) $code = (int)$m[1];
        }
        $out['file_get_contents'] = ($body !== false || $code > 0) ? ('HTTP ' . ($code ?: 200)) : '실패';
    }

    // 3) wget — 오류 응답(401 등)도 「닿은 것」 입니다
    $code = 0; $note = '';
    $body = bh_wget($url, $headers, null, $sec, $code, $note);
    $out['wget'] = $code > 0 ? ('HTTP ' . $code)
                 : (($body !== false && $body !== '') ? '받아옴' : ($note ?: '받지 못함'));

    return $out;
}

/** 응답 코드만 뽑아냅니다 (없으면 0) */
function net_code($r) {
    foreach ($r as $v) {
        if (preg_match('/^HTTP (\d{3})$/', $v, $m)) return (int)$m[1];
    }
    return 0;
}

/** 서버까지 닿았나 — 401·404 처럼 오류를 돌려줘도 「닿은 것」 입니다 */
function net_ok($r) {
    foreach ($r as $v) {
        if (strpos($v, 'HTTP ') === 0 || $v === '받아옴') return true;
    }
    return false;
}

if ($action === 'net') {
    @set_time_limit(90);

    $v = ai_vendor($key);
    if ($v === 'manus')       { $host = 'api.manus.ai';      $mUrl = MANUS_API; }
    elseif ($v === 'openai')  { $host = 'api.openai.com';    $mUrl = 'https://api.openai.com/v1/models'; }
    else                      { $host = 'api.anthropic.com'; $mUrl = 'https://api.anthropic.com/v1/models'; }
    $vName = $key === '' ? 'Anthropic (클로드) · 키를 넣으면 챗GPT 도 됩니다' : ai_vendor_name($v);

    $wget  = function_exists('shell_exec') ? trim((string)@shell_exec('command -v wget 2>/dev/null')) : '';
    $dns   = @gethostbyname($host);
    $dnsOk = ($dns !== $host && filter_var($dns, FILTER_VALIDATE_IP));

    // 키 없이 부르면 401 이 옵니다. 401 이 왔다는 것 자체가 「닿았다」 는 뜻입니다.
    $anth = net_try($mUrl);
    $gh   = net_try('https://raw.githubusercontent.com/netformrnd-lab/test1/refs/heads/claude/ja-brand-dashboard-nas-4lvyrk/nas/manifest.txt');
    $anthOk = net_ok($anth);
    $ghOk   = net_ok($gh);

    // 키가 있으면 그 키가 살아 있는지도 봅니다 (글자를 만들지 않아 돈이 들지 않습니다)
    $keyCheck = null; $keyOk = null;
    if ($v === 'manus') {
        // 마누스는 「작업 만들기」 말고 키만 확인하는 길이 없습니다.
        // 목록을 받아보는 것으로 판단하면 멀쩡한 키를 거부됐다고 말하게 됩니다.
        $keyCheck = '마누스는 키만 따로 확인할 방법이 없습니다 '
                  . '([✨ AI로 정리] 를 눌러 실제로 되는지 보세요)';
    } elseif ($key !== '' && $anthOk) {
        $head = ($v === 'openai')
                    ? ['Authorization: Bearer ' . $key]
                    : ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01'];
        $r = net_try($mUrl, 8, $head);
        $c = net_code($r);
        $keyOk = ($c === 200);
        if ($c === 200)                      $keyCheck = '정상 (키가 받아들여집니다)';
        elseif ($c === 401 || $c === 403)    $keyCheck = '거부됨 (' . $c . ') — 키가 틀렸거나 만료됐습니다';
        elseif ($c)                          $keyCheck = 'HTTP ' . $c;
        else                                 $keyCheck = '확인하지 못했습니다';
    }

    // 진짜로 한 번 물어봅니다 — 이게 제일 확실합니다.
    // 「안녕」 한 마디라 값은 0 에 가깝고, 실패하면 AI 가 준 말을 그대로 보여줍니다.
    $real = null; $realOk = null;
    if ($v === 'manus') {
        $real = '마누스는 물어보기만 해도 작업 하나가 시작되고 크레딧을 써서, '
              . '점검에서는 실제로 물어보지 않습니다. [✨ AI로 정리] 로 확인해 주세요.';
    } elseif ($key !== '' && $anthOk) {
        $why2 = [];
        [$rc, $rraw, $rtext, $rmodel] = ai_ask($key, '한 단어로만 답하세요.', '안녕', 16, $MODEL_FILE, $why2);
        if ($rraw === false) {
            $real = '물어보지 못했습니다 — ' . implode(' / ', $why2);
            $realOk = false;
        } elseif ($rc === 200 && $rtext !== false) {
            $real = '✅ 됩니다 (모델 ' . $rmodel . ' · 답: ' . mb_substr(trim($rtext), 0, 20) . ')';
            $realOk = true;
        } else {
            $real = '❌ HTTP ' . $rc . ' · ' . ai_errmsg($rraw);
            $realOk = false;
        }
    }

    $ways = [];
    if (function_exists('curl_init')) $ways[] = 'curl';
    if (ini_get('allow_url_fopen') && extension_loaded('openssl')) $ways[] = 'file_get_contents';
    if ($wget !== '') $ways[] = 'wget';

    $todo = [];
    if (!function_exists('curl_init') || !extension_loaded('openssl')) {
        $miss = [];
        if (!function_exists('curl_init'))    $miss[] = 'curl';
        if (!extension_loaded('openssl'))     $miss[] = 'openssl';
        $todo[] = 'DSM → 웹 스테이션 → PHP 프로필 → 우리 프로필 [편집] → 「확장」 에서 '
                . implode(' 과 ', $miss) . ' 을(를) 켜고 저장하세요. '
                . '(openssl 이 꺼져 있으면 PHP 가 https 주소로 아예 나가지 못합니다)';
    }
    if (!$dnsOk) {
        $todo[] = 'NAS 가 주소를 찾지 못합니다(DNS). DSM → 제어판 → 네트워크 → 「일반」 에서 '
                . 'DNS 서버를 8.8.8.8 로 넣어보세요.';
    }
    if ($dnsOk && !$anthOk && $ghOk) {
        $todo[] = '다른 사이트는 되는데 ' . $host . ' 만 닿지 않습니다. '
                . '방화벽·보안 정책에서 ' . $host . ' (443) 을 열어주세요.';
    }
    if ($dnsOk && !$anthOk && !$ghOk) {
        $todo[] = 'NAS 가 인터넷으로 아예 못 나갑니다. DSM → 제어판 → 네트워크 에서 '
                . '게이트웨이·DNS 를 확인하고, 회사 방화벽에서 NAS 의 바깥 접속이 막혀 있는지 '
                . '살펴보세요.';
    }
    if ($anthOk && $key === '')  $todo[] = '길은 열려 있습니다. [🔑 AI 키 넣기] 로 키만 넣으면 됩니다. '
                                         . '(챗GPT sk-… / 클로드 sk-ant-… 둘 다 됩니다)';
    if ($keyOk === false)        $todo[] = 'AI 키가 받아들여지지 않습니다. 새 키를 만들어 '
                                         . '[🔑 AI 키 넣기] 로 다시 넣어주세요.';
    if ($realOk === true)        $todo[] = '지금 이 자리에서 물어보니 정상으로 답했습니다. '
                                         . '아까 실패했다면 그 사이 한도에 걸렸던 것이니 다시 해보세요.';
    if ($realOk === false && $real !== null) {
        $todo[] = '실제로 물어봤을 때 이렇게 나왔습니다 → ' . $real;
        $todo[] = ai_friendly(0, $real, $v);
    }

    $one = !$anthOk
        ? ($ghOk ? '⚠️ 인터넷은 되는데 AI 서버에는 닿지 못합니다'
                 : '❌ NAS 가 인터넷으로 나가지 못합니다')
        : ($realOk === true  ? '✅ 지금 물어보니 정상으로 답했습니다'
        : ($realOk === false ? '⚠️ 서버까지는 닿는데 AI 가 거절했습니다 (아래 「실제로 물어보기」 를 보세요)'
        : ($keyOk === false  ? '⚠️ AI 서버까지는 닿지만 키가 거부됩니다'
                             : '✅ AI 서버까지 닿습니다')));

    jout([
        'ok' => true,
        '한줄'   => $one,
        '어느 AI' => $vName,
        '닿나'   => ['AI 서버(' . $host . ')' => $anthOk ? '예' : '아니오',
                     '다른 사이트(github)'     => $ghOk   ? '예' : '아니오'],
        '주소찾기(DNS)' => $dnsOk ? ('예 · ' . $dns) : '아니오 — 이름을 못 찾습니다',
        '나가는 방법'   => [
            'curl 확장'        => function_exists('curl_init') ? '켜짐' : '꺼짐',
            'allow_url_fopen'  => ini_get('allow_url_fopen') ? '켜짐' : '꺼짐',
            'openssl(https)'   => extension_loaded('openssl') ? '켜짐' : '꺼짐 — PHP 가 https 로 못 나감',
            'shell_exec'       => function_exists('shell_exec') ? '가능' : '막힘',
            'wget'             => $wget !== '' ? $wget : '없음',
            '지금 쓸 수 있는 길' => $ways ? implode(' · ', $ways) : '없음',
        ],
        'AI 서버에 해본 것'   => $anth,
        '다른 사이트에 해본 것' => $gh,
        '키 확인' => $key === '' ? '키가 아직 없습니다' : ($keyCheck ?: '서버에 닿지 못해 확인하지 못했습니다'),
        '실제로 물어보기' => $key === '' ? '키가 아직 없습니다' : ($real ?: '서버에 닿지 못해 해보지 못했습니다'),
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
    $v = ai_vendor($key);
    jout([
        'ok'        => true,
        '키등록됨'  => $key !== '',
        '키앞자리'  => $key !== '' ? substr($key, 0, 7) . '…' : '',   // 확인용, 전체는 절대 안 보냅니다
        '어느 AI'   => $key === '' ? '(키 없음)' : ai_vendor_name($v),
        '모델'      => $key === '' ? ''
                        : ($v === 'openai'
                            ? (is_file($MODEL_FILE) ? trim((string)@file_get_contents($MODEL_FILE)) : '(고르는 중)')
                            : 'claude-opus-5'),
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
        @unlink($MODEL_FILE);
        @unlink($VENDOR_FILE);
        jout(['ok' => true, '키등록됨' => false, '안내' => '키를 지웠습니다']);
    }
    // 어느 회사 키인지 (화면에서 골라 보냅니다. 안 보내면 키 모양으로 짐작합니다)
    $vend = strtolower(trim((string)($b['vendor'] ?? '')));
    if (!in_array($vend, ['openai', 'anthropic', 'manus'], true)) {
        $vend = (strpos($k, 'sk-ant-') === 0) ? 'anthropic'
              : ((strpos($k, 'sk-') === 0) ? 'openai' : '');
    }
    if ($vend === '') {
        jout(['ok' => false, 'error' =>
            '어느 AI 의 키인지 알 수 없습니다.\n\n'
            . '· 챗GPT: platform.openai.com 의 "sk-…" 키\n'
            . '· 클로드: console.anthropic.com 의 "sk-ant-…" 키\n'
            . '· 마누스: 마누스 앱 → API 설정에서 만든 키\n\n'
            . '마누스 키라면 화면에서 「마누스」 를 골라 주세요.'], 400);
    }
    if ($vend !== 'manus' && !preg_match('/^sk-[A-Za-z0-9_\-]{20,250}$/', $k)) {
        jout(['ok' => false, 'error' => '키 모양이 아닙니다. "sk-" 로 시작하는 키를 넣어주세요.'], 400);
    }
    if ($vend === 'manus') {
        // 마누스 키는 정해진 모양이 없어서 길이만 봅니다.
        // 우리가 괜히 막아서 못 쓰게 되는 일이 없도록 넉넉하게 받습니다.
        if (preg_match('/\s/', $k)) {
            jout(['ok' => false, 'error' =>
                '키에 빈칸이나 줄바꿈이 섞여 있습니다. 앞뒤 공백 없이 붙여넣어 주세요.'], 400);
        }
        if (strlen($k) < 8) {
            jout(['ok' => false, 'error' =>
                '키가 너무 짧습니다 (' . strlen($k) . '글자). 마누스 앱에서 만든 키를 '
                . '전체 복사해서 넣어주세요.'], 400);
        }
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
    @unlink($MODEL_FILE);                       // 회사가 바뀌었을 수 있으니 모델은 다시 고릅니다
    @file_put_contents($VENDOR_FILE, $vend);
    jout(['ok' => true, '키등록됨' => true, '어느 AI' => ai_vendor_name($vend),
          '안내' => ai_vendor_name($vend) . ' 키를 NAS 에만 저장했습니다']);
}

/* ---------------- 오래 걸리는 작업 확인하기 (마누스) ----------------
   화면이 몇 초마다 「끝났나요?」 하고 물어봅니다.
   끝났으면 그 자리에서 글을 다듬어(회의 요약이면 JSON 으로) 돌려줍니다.
   ------------------------------------------------------------------ */
if ($action === 'taskcheck') {
    if ($key === '') jout(['ok' => false, 'error' => 'AI 키가 없습니다'], 400);
    $tid  = trim((string)($_GET['id'] ?? ''));
    $kind = ($_GET['kind'] ?? 'prompt') === 'summarize' ? 'summarize' : 'prompt';
    if ($tid === '' || !preg_match('/^[A-Za-z0-9._\-]{4,200}$/', $tid)) {
        jout(['ok' => false, 'error' => '작업번호가 이상합니다'], 400);
    }

    [$st, $text, $c, $raw] = manus_poll($key, $tid);

    if ($raw === false) {
        jout(['ok' => true, '상태' => '하는 중', '안내' => '아직 확인하지 못했습니다. 잠시 뒤 다시 봅니다.']);
    }
    if ($c === 401 || $c === 403) {
        jout(['ok' => false, 'error' => 'AI 키가 거부됐습니다 (HTTP ' . $c . ')'], 401);
    }
    if ($st === '실패') {
        jout(['ok' => false, 'error' => ai_friendly($c, ($text !== '' ? $text : ai_errmsg($raw)), 'manus')], 502);
    }
    if ($st !== '끝') {
        jout(['ok' => true, '상태' => '하는 중']);
    }

    if (trim($text) === '') {
        jout(['ok' => false, 'error' => "마누스가 빈 답을 보냈습니다.\n\n받은 것 앞부분:\n"
            . mb_strcut((string)$raw, 0, 400)], 502);
    }

    @file_put_contents($LOG_FILE, json_encode([
        'count' => (int)((json_decode((string)@file_get_contents($LOG_FILE), true)['count'] ?? 0)) + 1,
        'at'    => date('c'),
    ], JSON_UNESCAPED_UNICODE));

    if ($kind === 'prompt') {
        jout(['ok' => true, '상태' => '끝', '프롬프트' => trim($text), '만든때' => date('c')]);
    }

    // 회의 요약 — JSON 으로 답하라고 했지만 앞뒤에 다른 말이 붙을 수 있습니다
    $parsed = json_decode(trim($text), true);
    if (!is_array($parsed) && preg_match('/\{.*\}/s', $text, $m)) $parsed = json_decode($m[0], true);
    if (!is_array($parsed)) {
        jout(['ok' => true, '상태' => '끝', '요약' => trim($text), '결정사항' => [], '할일' => [],
              '다음회의' => '', '확인필요' => [], '형식' => '글']);
    }
    jout(['ok' => true, '상태' => '끝',
          '요약'     => (string)($parsed['요약'] ?? ''),
          '결정사항' => (array)($parsed['결정사항'] ?? []),
          '할일'     => (array)($parsed['할일'] ?? []),
          '다음회의' => (string)($parsed['다음회의'] ?? ''),
          '확인필요' => (array)($parsed['확인필요'] ?? [])]);
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

    // 마누스는 오래 걸립니다 — 작업만 시작하고 화면이 물어보게 합니다
    if (ai_vendor($key) === 'manus') {
        // 마누스는 한 번에 받는 글이 짧아서 지시문도 줄여 보냅니다
        $short = "아래 브랜드북을 읽고, 이 브랜드의 글을 쓸 때 쓸 마스터프롬프트를 "
               . "한국어로 써 주세요. 없는 내용은 지어내지 말고 「브랜드북에 아직 없음」 "
               . "이라고 적어주세요. 설명 없이 프롬프트만 답하세요.";
        $cut2 = false;
        [$c, $r, $tid, $w] = manus_start($key, $short . "\n\n" . $user, $cut2);
        if ($r === false) {
            jout(['ok' => false, 'error' =>
                "마누스에 연결하지 못했습니다.\n\n시도한 방법:\n · " . implode("\n · ", $w)], 502);
        }
        if ($tid === '') {
            jout(['ok' => false, 'error' => ai_friendly($c, ai_errmsg($r), 'manus')
                . "\n\n(마누스가 보낸 것 앞부분: " . mb_strcut((string)$r, 0, 200) . ')'], 502);
        }
        jout(['ok' => true, '진행중' => true, '작업번호' => $tid, '무엇' => 'prompt',
              '잘림' => $cut || $cut2,
              '안내' => '마누스가 작업을 시작했습니다'
                . (($cut || $cut2) ? ' (마누스가 한 번에 받는 길이를 넘어서 앞부분만 보냈습니다)' : '')]);
    }

    $why = [];
    [$code, $raw, $text, $usedModel] = ai_ask($key, $sys, $user, $MAX_TOKENS, $MODEL_FILE, $why);

    if ($raw === false) {
        jout(['ok' => false, 'error' =>
            "AI 에 연결하지 못했습니다.\n\n시도한 방법:\n · " . implode("\n · ", $why)
            . "\n\nNAS 가 인터넷에 나갈 수 있는지 확인해 주세요."], 502);
    }
    $j = json_decode($raw, true);
    if ($code === 401 || $code === 403) {
        jout(['ok' => false, 'error' => ai_key_refused($code, $key)], 401);
    }
    if ($code === 429) {
        // OpenAI 는 잔액이 없을 때도 429 를 보냅니다. 무엇 때문인지 보고 알려줍니다.
        jout(['ok' => false, 'error' => ai_friendly(429, ai_errmsg($raw), ai_vendor($key))], 429);
    }
    if (!is_array($j) || isset($j['error'])) {
        $msg = is_array($j) && isset($j['error']['message']) ? $j['error']['message']
             : substr((string)$raw, 0, 300);
        jout(['ok' => false, 'error' => ai_friendly($code, $msg, ai_vendor($key))], 502);
    }
    if (($j['stop_reason'] ?? '') === 'refusal') {
        jout(['ok' => false, 'error' => 'AI 가 이 내용은 쓸 수 없다고 답했습니다.'], 400);
    }
    if ($text === false || $text === '') {
        jout(['ok' => false, 'error' => 'AI 가 빈 답을 보냈습니다. 다시 시도해 주세요.'], 502);
    }

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

    if (ai_vendor($key) === 'manus') {
        $short = "아래 회의 메모를 정리해 주세요. JSON 하나만 답하고 다른 말은 붙이지 마세요.\n"
               . '{"요약":"3~5문장","결정사항":[],"할일":[{"내용":"","담당":"","기한":""}],'
               . '"다음회의":"","확인필요":[]}' . "\n"
               . "메모에 없는 내용은 지어내지 마세요.";
        $cut2 = false;
        [$c, $r, $tid, $w] = manus_start($key, $short . "\n\n" . $user, $cut2);
        if ($r === false) {
            jout(['ok' => false, 'error' =>
                "마누스에 연결하지 못했습니다.\n\n시도한 방법:\n · " . implode("\n · ", $w)], 502);
        }
        if ($tid === '') {
            jout(['ok' => false, 'error' => ai_friendly($c, ai_errmsg($r), 'manus')
                . "\n\n(마누스가 보낸 것 앞부분: " . mb_strcut((string)$r, 0, 200) . ')'], 502);
        }
        jout(['ok' => true, '진행중' => true, '작업번호' => $tid, '무엇' => 'summarize',
              '잘림' => $cut || $cut2,
              '안내' => '마누스가 작업을 시작했습니다'
                . (($cut || $cut2) ? ' (길어서 앞부분만 보냈습니다)' : '')]);
    }

    $why = [];
    [$code, $raw, $text, $usedModel] = ai_ask($key, $sys, $user, $MAX_TOKENS, $MODEL_FILE, $why);

    if ($raw === false) {
        jout(['ok' => false, 'error' =>
            "AI 에 연결하지 못했습니다.\n\n시도한 방법:\n · " . implode("\n · ", $why)
            . "\n\nNAS 가 인터넷에 나갈 수 있는지 확인해 주세요."], 502);
    }

    $j = json_decode($raw, true);
    if ($code === 401 || $code === 403) {
        jout(['ok' => false, 'error' => ai_key_refused($code, $key)], 401);
    }
    if ($code === 429) {
        // OpenAI 는 잔액이 없을 때도 429 를 보냅니다. 무엇 때문인지 보고 알려줍니다.
        jout(['ok' => false, 'error' => ai_friendly(429, ai_errmsg($raw), ai_vendor($key))], 429);
    }
    if (!is_array($j) || isset($j['error'])) {
        $msg = is_array($j) && isset($j['error']['message']) ? $j['error']['message']
             : substr((string)$raw, 0, 300);
        jout(['ok' => false, 'error' => ai_friendly($code, $msg, ai_vendor($key))], 502);
    }
    if (($j['stop_reason'] ?? '') === 'refusal') {
        jout(['ok' => false, 'error' => 'AI 가 이 내용은 정리할 수 없다고 답했습니다.'], 400);
    }

    if ($text === false) $text = '';

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
