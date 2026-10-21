<?php
/* ═══════════════ 📰 업계 브리핑 받는 창구 ═══════════════════════════
   사무실 PC 가 월요일마다 「웹검색 되는 AI」 에게 업계 이슈를 정리시킨 뒤,
   그 결과를 사내망으로 이 창구에 올립니다. 그러면 허브의 📰 업계 브리핑에
   저절로 뜨고, 모든 팀이 봅니다.

   · NAS 는 인터넷에 안 나갑니다 — 받기만 합니다 (보안 그대로).
   · 비밀 열쇠(data/brief-key.txt)를 아는 PC 만 올릴 수 있습니다.
   · 같은 주(week)를 다시 올리면 「자동으로 올린 것」만 덮습니다
     (사람이 손으로 쓴 브리핑은 건드리지 않습니다).

   ── 준비 (한 번만) ────────────────────────────────────────────────
   NAS 의 web/brand/data/ 폴더에 brief-key.txt 를 만들고, 아무도 모르는
   긴 글자(예: 40자 랜덤)를 한 줄 적어 둡니다. 그 값을 PC 스크립트에도
   같은 값으로 넣습니다. (이 파일은 저장소에 올리지 마세요 — 비밀입니다)
   ================================================================= */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function bi_out($o, $code = 200){
    http_response_code($code);
    echo json_encode($o, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST')
    bi_out(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);

$DIR  = __DIR__ . '/data';
$KEYF = $DIR . '/brief-key.txt';
if (!is_file($KEYF))
    bi_out(['ok' => false, 'error' =>
        'brief-key.txt 가 없습니다 — NAS 의 data 폴더에 비밀 열쇠 한 줄을 넣어주세요'], 403);
$KEY = trim((string)@file_get_contents($KEYF));
if ($KEY === '' || strlen($KEY) < 12)
    bi_out(['ok' => false, 'error' => 'brief-key.txt 가 비었거나 너무 짧습니다 (12자 이상 권장)'], 403);

$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) bi_out(['ok' => false, 'error' => '본문(JSON)을 읽지 못했습니다'], 400);

$given = (string)($body['key'] ?? ($_SERVER['HTTP_X_BRIEF_KEY'] ?? ''));
if (!hash_equals($KEY, $given))
    bi_out(['ok' => false, 'error' => '열쇠가 맞지 않습니다'], 403);

$title = trim((string)($body['title'] ?? ''));
$week  = trim((string)($body['week'] ?? ''));
$text  = (string)($body['body'] ?? '');
$chat  = trim((string)($body['chaturl'] ?? ''));
$links = (string)($body['links'] ?? '');
$by    = trim((string)($body['by'] ?? '')) ?: '🤖 자동';
/* 위험한 링크는 안 받습니다 (http/https 만) */
if ($chat !== '' && !preg_match('#^https?://#i', $chat)) $chat = '';
if ($text === '' && $chat === '')
    bi_out(['ok' => false, 'error' => '내용(body)이나 공유 링크(chaturl) 중 하나는 있어야 합니다'], 400);
/* 주차(week)는 보통 그 주 월요일. 안 주면 오늘로 둡니다 */
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $week)) $week = date('Y-m-d');
if ($title === '') $title = '업계 브리핑 (' . $week . ')';
/* 너무 긴 본문은 잘라 둡니다 (자료 파일이 비대해지지 않게) */
if (function_exists('mb_substr') && mb_strlen($text, 'UTF-8') > 20000)
    $text = mb_substr($text, 0, 20000, 'UTF-8') . "\n…(너무 길어 줄였습니다)";

/* ── 자료 파일 읽기/쓰기 (guard.php 의 방패 형식과 같게) ─────────── */
$SHIELD = "<?php exit; /* 브랜드 대시보드 자료 — 주소로 열면 보이지 않습니다 */ ?>\n";
$strip = function($raw){
    if (!is_string($raw) || $raw === '') return '';
    if (substr($raw, 0, 5) === '<?php') { $nl = strpos($raw, "\n"); return $nl === false ? '' : substr($raw, $nl + 1); }
    return $raw;
};
$FILE = is_file($DIR . '/brand-data.php') ? $DIR . '/brand-data.php' : $DIR . '/brand-data.json';

$lk = @fopen($DIR . '/save.lock', 'c');
if ($lk) flock($lk, LOCK_EX);                 // 실시간 저장과 한 번에 한 명씩

$raw  = is_file($FILE) ? $strip((string)@file_get_contents($FILE)) : '';
$data = $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($data)) { if ($lk){ flock($lk, LOCK_UN); fclose($lk); } bi_out(['ok' => false, 'error' => '자료를 읽지 못했습니다'], 500); }
if (!isset($data['briefs']) || !is_array($data['briefs'])) $data['briefs'] = [];

/* 같은 주의 「자동」 브리핑이 있으면 덮고, 없으면 맨 위에 새로 넣습니다 */
$id = '';
foreach ($data['briefs'] as &$b) {
    if (is_array($b) && ($b['week'] ?? '') === $week && !empty($b['auto'])) {
        $b['title'] = $title; $b['body'] = $text; $b['chaturl'] = $chat;
        $b['links'] = $links; $b['by'] = $by; $b['auto'] = true;
        $b['updatedAt'] = date('c');
        $id = (string)($b['id'] ?? '');
        break;
    }
}
unset($b);
if ($id === '') {
    try { $id = 'i' . bin2hex(random_bytes(5)); } catch (Exception $e) { $id = 'i' . substr(md5(uniqid('', true)), 0, 10); }
    array_unshift($data['briefs'], [
        'id' => $id, 'title' => $title, 'week' => $week, 'body' => $text,
        'chaturl' => $chat, 'links' => $links, 'by' => $by,
        'auto' => true, 'updatedAt' => date('c'),
    ]);
}

$data['_rev']    = (int)($data['_rev'] ?? 0) + 1;
$data['_lastBy'] = $by;
$json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($json === false) { if ($lk){ flock($lk, LOCK_UN); fclose($lk); } bi_out(['ok' => false, 'error' => '저장 형식으로 바꾸지 못했습니다'], 500); }

$tmp = $FILE . '.tmp' . getmypid();
$done = (@file_put_contents($tmp, $SHIELD . $json) !== false) && @rename($tmp, $FILE);
if (!$done) { @unlink($tmp); if ($lk){ flock($lk, LOCK_UN); fclose($lk); }
    bi_out(['ok' => false, 'error' => '파일을 저장하지 못했습니다 (data 폴더 쓰기 권한 확인)'], 500); }
@chmod($FILE, 0664);

/* 판 번호를 따로 적어 둡니다 — 열려 있는 허브가 몇 초 안에 새 브리핑을 받아오게 */
$rt = $DIR . '/rev.txt.tmp' . getmypid();
if (@file_put_contents($rt, $data['_rev'] . "\t" . date('c') . "\t" . $by) !== false) {
    @rename($rt, $DIR . '/rev.txt'); @chmod($DIR . '/rev.txt', 0664);
} else { @unlink($rt); }

if ($lk) { flock($lk, LOCK_UN); fclose($lk); }
bi_out(['ok' => true, 'id' => $id, 'week' => $week, 'rev' => $data['_rev']]);
