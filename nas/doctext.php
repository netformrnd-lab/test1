<?php
/**
 * 문서 안의 글자로 찾기
 *
 * 워드·엑셀·파워포인트·PDF·텍스트 파일에서 글자를 뽑아 목록을 만들고,
 * 파일 이름이 아니라 "안에 적힌 내용"으로 찾을 수 있게 합니다.
 *
 *   ?action=sample&dir=...     몇 %나 읽히는지 먼저 재봅니다
 *   ?action=start&dir=...      글자 목록 만들기 시작
 *   ?action=step               조금 더 만들기 (브라우저가 반복해서 부릅니다)
 *   ?action=status             지금 상태
 *   ?action=cancel             중단
 *   ?action=search&q=검색어    내용으로 찾기
 *   ?action=check              목록 상태
 *
 * 원본 파일은 읽기만 하며 고치지 않습니다.
 */

header('Content-Type: application/json; charset=utf-8');
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
@set_time_limit(0);
@ini_set('memory_limit', '512M');

ob_start();
register_shutdown_function(function () {
    $e = error_get_last();
    $fatal = $e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
    if (!ob_get_level()) return;
    if ($fatal) {
        ob_end_clean();
        if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '서버 오류: ' . $e['message']
            . ' (' . basename($e['file']) . ' ' . $e['line'] . '줄)'], JSON_UNESCAPED_UNICODE);
    } else {
        ob_end_flush();
    }
});

$DATA     = __DIR__ . '/data';
$LIST     = $DATA . '/nasfiles.tsv';      // scan 이 만든 파일 목록
$ROOTF    = $DATA . '/nasroot.txt';
$OUT      = $DATA . '/doctext.tsv';       // 뽑아낸 글자
$TMP      = $OUT . '.part';
$QUEUE    = $DATA . '/docqueue.txt';
$STATE    = $DATA . '/docstate.json';

$SECONDS_PER_STEP = 3.0;
$MAX_TEXT   = 120000;                     // 문서 하나에서 담아둘 글자 수
$MAX_FILE   = 60 * 1024 * 1024;           // 이보다 큰 파일은 건너뜁니다

/* 글자를 뽑을 수 있는 형식 */
$OFFICE = ['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm'];
$PLAIN  = ['txt', 'csv', 'md', 'log', 'json', 'xml', 'html', 'htm'];
$KNOWN  = array_merge($OFFICE, $PLAIN, ['pdf']);

function jout($a, $code = 200) {
    http_response_code(200);            // 웹 스테이션이 오류 응답 내용을 바꿔치기 하므로 항상 200
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

function human($b) {
    if ($b < 1024) return $b . ' B';
    if ($b < 1048576) return round($b / 1024) . ' KB';
    if ($b < 1073741824) return round($b / 1048576, 1) . ' MB';
    return round($b / 1073741824, 2) . ' GB';
}

/* ---------- 워드·엑셀·파워포인트 ---------- */
function office_text($file, $max) {
    if (!class_exists('ZipArchive')) return null;
    $z = new ZipArchive;
    if ($z->open($file) !== true) return null;
    $out = '';
    for ($i = 0; $i < $z->numFiles; $i++) {
        $n = $z->getNameIndex($i);
        if (!preg_match('#^(word/document|word/footnotes|word/endnotes'
            . '|xl/sharedStrings|ppt/slides/slide[0-9]+|ppt/notesSlides/notesSlide[0-9]+)#', $n)) continue;
        $x = $z->getFromIndex($i);
        if ($x === false) continue;
        $x = preg_replace('#<[^>]+>#u', ' ', $x);          // 태그를 공백으로
        $out .= ' ' . html_entity_decode($x, ENT_QUOTES | ENT_XML1, 'UTF-8');
        if (strlen($out) > $max) break;
    }
    $z->close();
    return $out;
}

/* ---------- PDF (글자층이 있는 경우) ---------- */
function pdf_text($file, $max) {
    $raw = @file_get_contents($file, false, null, 0, 12 * 1024 * 1024);
    if ($raw === false) return null;

    $body = '';
    if (preg_match_all('#stream\r?\n(.*?)endstream#s', $raw, $m)) {
        foreach ($m[1] as $s) {
            $d = @gzuncompress($s);
            if ($d === false) $d = @gzinflate(substr($s, 2));
            if ($d === false) $d = $s;
            if (strpos($d, 'Tj') === false && strpos($d, 'TJ') === false) continue;
            $body .= $d;
            if (strlen($body) > $max * 3) break;
        }
    }
    if ($body === '') return '';

    $txt = '';
    if (preg_match_all('#\((?:\\\\.|[^\\\\()])*\)#s', $body, $mm)) {
        foreach ($mm[0] as $p) {
            $p = substr($p, 1, -1);
            $p = str_replace(['\\(', '\\)', '\\\\', '\\n', '\\r', '\\t'], ['(', ')', '\\', ' ', ' ', ' '], $p);
            $txt .= $p . ' ';
            if (strlen($txt) > $max) break;
        }
    }
    return $txt;
}

/* ---------- 형식에 맞게 글자 뽑기 ---------- */
function extract_text($file, $ext, $max) {
    global $OFFICE, $PLAIN;
    if (in_array($ext, $OFFICE, true)) return office_text($file, $max);
    if (in_array($ext, $PLAIN, true)) {
        $t = @file_get_contents($file, false, null, 0, $max);
        if ($t === false) return null;
        if ($ext === 'html' || $ext === 'htm' || $ext === 'xml') $t = preg_replace('#<[^>]+>#u', ' ', $t);
        return $t;
    }
    if ($ext === 'pdf') return pdf_text($file, $max);
    return null;
}

/* 뽑은 글자가 사람이 읽을 만한지 봅니다.
   PDF 는 글꼴 방식에 따라 깨진 기호만 나오기도 해서 걸러냅니다. */
function text_quality($t) {
    $t = trim($t);
    if ($t === '') return 0.0;
    $len = mb_strlen($t, 'UTF-8');
    if ($len < 1) return 0.0;
    preg_match_all('/[가-힣a-zA-Z0-9]/u', $t, $m);
    return count($m[0]) / $len;
}

function tidy_text($t, $max) {
    $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', ' ', $t);
    $t = preg_replace('/\s+/u', ' ', $t);
    $t = trim($t);
    if (mb_strlen($t, 'UTF-8') > $max) $t = mb_substr($t, 0, $max, 'UTF-8');
    return $t;
}

/** 읽은 결과를 한 줄로 정리합니다 */
function read_one($path, $maxText, $maxFile) {
    $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $size = @filesize($path);
    if ($size === false || !is_file($path)) return ['상태' => '없음', 'text' => '', 'ext' => $ext];
    if ($size > $maxFile) return ['상태' => '너무큼', 'text' => '', 'ext' => $ext];

    $raw = @extract_text($path, $ext, $maxText);
    if ($raw === null) return ['상태' => '지원안함', 'text' => '', 'ext' => $ext];

    $t = tidy_text($raw, $maxText);
    $q = text_quality($t);
    if (mb_strlen($t, 'UTF-8') < 20 || $q < 0.35) {
        return ['상태' => '글자없음', 'text' => '', 'ext' => $ext, '품질' => round($q, 2)];
    }
    return ['상태' => '읽음', 'text' => $t, 'ext' => $ext, '품질' => round($q, 2)];
}

/** 파일 목록에서 글자를 뽑을 만한 파일들을 골라옵니다 */
function candidates($listFile, $dir, $known) {
    $out = [];
    if (!is_file($listFile)) return $out;
    $fp = fopen($listFile, 'r');
    if (!$fp) return $out;
    $prefix = $dir !== '' ? rtrim($dir, '/') . '/' : '';
    $preLen = strlen($prefix);
    while (($line = fgets($fp)) !== false) {
        $p = explode("\t", rtrim($line, "\r\n"), 3);
        if (count($p) < 3) continue;
        if ($prefix !== '' && strncmp($p[2], $prefix, $preLen) !== 0) continue;
        $ext = strtolower(pathinfo($p[2], PATHINFO_EXTENSION));
        if (!in_array($ext, $known, true)) continue;
        $out[] = $p[2];
    }
    fclose($fp);
    return $out;
}

function load_state($f) {
    if (!is_file($f)) return null;
    $s = json_decode(file_get_contents($f), true);
    return is_array($s) ? $s : null;
}
function save_state($f, $s) { file_put_contents($f, json_encode($s, JSON_UNESCAPED_UNICODE)); }

function progress($st) {
    return [
        'ok' => true,
        '진행'    => $st['done'] ? '완료' : '진행 중',
        'done'    => (bool)$st['done'],
        '전체'    => $st['total'],
        '살펴본수' => $st['seen'],
        '읽은수'   => $st['read'],
        '못읽은수' => $st['fail'],
        '지금파일' => $st['current'],
        '걸린시간' => round(microtime(true) - $st['started']) . '초',
    ];
}

$action = $_GET['action'] ?? '';

/* ---------------- 목록 상태 ---------------- */
if ($action === 'check') {
    jout([
        'ok'       => is_file($OUT),
        '글자목록'  => is_file($OUT) ? '있음' : '없음 — 먼저 만들어 주세요',
        '문서수'    => is_file($OUT) ? (int)trim(shell_exec('wc -l < ' . escapeshellarg($OUT)) ?: '0') : 0,
        '목록크기'  => is_file($OUT) ? human(filesize($OUT)) : '-',
        '만든시각'  => is_file($OUT) ? date('c', filemtime($OUT)) : null,
        '만드는중'  => is_file($STATE) ? '예' : '아니오',
        'zip기능'   => class_exists('ZipArchive') ? '있음' : '없음 (워드·엑셀·PPT 를 못 읽습니다)',
    ]);
}

/* ---------------- 얼마나 읽히는지 재보기 ---------------- */
if ($action === 'sample') {
    $dir = rtrim(trim($_GET['dir'] ?? ''), '/');
    $n   = min(max((int)($_GET['n'] ?? 30), 5), 100);

    $all = candidates($LIST, $dir, $KNOWN);
    if (!count($all)) {
        jout(['ok' => false, 'error' =>
            '글자를 뽑을 만한 문서를 찾지 못했습니다. 먼저 [🔎 목록 다시 만들기] 를 해주세요.'], 404);
    }

    // 형식별로 고르게 뽑습니다.
    // 한 형식이 압도적으로 많으면 그것만 뽑혀서 결과가 왜곡되기 때문입니다.
    $byExtAll = [];
    foreach ($all as $p) {
        $e = strtolower(pathinfo($p, PATHINFO_EXTENSION));
        $byExtAll[$e][] = $p;
    }
    $kinds = count($byExtAll);
    $per   = max(3, (int)ceil($n / max(1, $kinds)));
    $pick  = [];
    foreach ($byExtAll as $e => $list) {
        shuffle($list);
        foreach (array_slice($list, 0, $per) as $p) $pick[] = $p;
    }
    shuffle($pick);
    if (count($pick) > $n * 2) $pick = array_slice($pick, 0, $n * 2);

    $byExt = [];
    $rows  = [];
    foreach ($pick as $p) {
        $r = read_one($p, 4000, $MAX_FILE);
        $e = $r['ext'];
        if (!isset($byExt[$e])) $byExt[$e] = ['전체' => 0, '읽음' => 0];
        $byExt[$e]['전체']++;
        if ($r['상태'] === '읽음') $byExt[$e]['읽음']++;
        $rows[] = [
            '이름'   => basename($p),
            '형식'   => $e,
            '상태'   => $r['상태'],
            '맛보기' => $r['상태'] === '읽음' ? mb_substr($r['text'], 0, 90, 'UTF-8') : '',
        ];
    }
    $read = count(array_filter($rows, function ($r) { return $r['상태'] === '읽음'; }));

    $extList = [];
    foreach ($byExt as $e => $v) {
        $extList[] = ['형식' => $e, '전체' => $v['전체'], '읽음' => $v['읽음'],
                      '비율' => $v['전체'] ? round($v['읽음'] / $v['전체'] * 100) : 0,
                      '전체문서수' => count($byExtAll[$e] ?? [])];
    }
    usort($extList, function ($a, $b) { return $b['전체'] - $a['전체']; });

    jout([
        'ok' => true,
        '대상문서수' => count($all),
        '뽑아본수'   => count($pick),
        '읽힌수'     => $read,
        '읽힌비율'   => count($pick) ? round($read / count($pick) * 100) : 0,
        '형식별'     => $extList,
        '표본'       => $rows,
    ]);
}

/* ---------------- 만들기 시작 ---------------- */
if ($action === 'start') {
    $dir = rtrim(trim($_GET['dir'] ?? ''), '/');
    $all = candidates($LIST, $dir, $KNOWN);
    if (!count($all)) {
        jout(['ok' => false, 'error' =>
            '글자를 뽑을 만한 문서가 없습니다. 먼저 [🔎 목록 다시 만들기] 를 해주세요.'], 404);
    }
    if (!is_dir($DATA) && !@mkdir($DATA, 0775, true)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다'], 500);
    }
    if (@file_put_contents($TMP, '') === false) {
        jout(['ok' => false, 'error' => 'data 폴더에 쓸 수 없습니다 (권한 확인)'], 500);
    }
    file_put_contents($QUEUE, implode("\n", $all) . "\n");

    $st = ['dir' => $dir, 'qpos' => 0, 'total' => count($all), 'seen' => 0,
           'read' => 0, 'fail' => 0, 'current' => '', 'started' => microtime(true), 'done' => false];
    save_state($STATE, $st);
    jout(progress($st));
}

/* ---------------- 조금 더 만들기 ---------------- */
if ($action === 'step') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => false, 'error' => '시작하지 않았습니다'], 409);
    if ($st['done']) jout(progress($st));

    $out = @fopen($TMP, 'a');
    $qr  = @fopen($QUEUE, 'r');
    if (!$out || !$qr) jout(['ok' => false, 'error' => '작업 파일을 열지 못했습니다'], 500);
    fseek($qr, $st['qpos']);

    $deadline = microtime(true) + $SECONDS_PER_STEP;
    $finished = false;

    while (microtime(true) < $deadline) {
        $line = fgets($qr);
        if ($line === false) { $finished = true; break; }
        $st['qpos'] = ftell($qr);

        $path = rtrim($line, "\r\n");
        if ($path === '') continue;
        $st['seen']++;
        $st['current'] = basename($path);

        $r = read_one($path, $MAX_TEXT, $MAX_FILE);
        if ($r['상태'] === '읽음') {
            $st['read']++;
            fwrite($out, str_replace("\t", ' ', $path) . "\t" . $r['text'] . "\n");
        } else {
            $st['fail']++;
            // 못 읽은 파일도 남겨둡니다 (나중에 OCR 대상이 됩니다)
            fwrite($out, str_replace("\t", ' ', $path) . "\t\x01" . $r['상태'] . "\n");
        }
    }
    fclose($out); fclose($qr);

    if ($finished) {
        if (!@rename($TMP, $OUT)) jout(['ok' => false, 'error' => '목록을 저장하지 못했습니다'], 500);
        @unlink($QUEUE);
        $st['done'] = true;
        save_state($STATE, $st);
        $p = progress($st);
        $p['다음'] = '이제 문서 내용으로 찾을 수 있습니다.';
        jout($p);
    }
    save_state($STATE, $st);
    jout(progress($st));
}

if ($action === 'status') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => true, '진행' => '없음', 'done' => false, 'running' => false]);
    jout(progress($st) + ['running' => true]);
}

if ($action === 'cancel') {
    @unlink($STATE); @unlink($QUEUE); @unlink($TMP);
    jout(['ok' => true, '진행' => '중단했습니다']);
}

if ($action === 'clear') { @unlink($STATE); jout(['ok' => true]); }

/* ---------------- 내용으로 찾기 ---------------- */
if ($action === 'search') {
    if (!is_file($OUT)) {
        jout(['ok' => false, 'error' => '글자 목록이 아직 없습니다. 먼저 만들어 주세요.'], 404);
    }
    $q = trim($_GET['q'] ?? '');
    if ($q === '') jout(['ok' => false, 'error' => '찾을 말을 입력해 주세요'], 400);

    $terms = array_values(array_filter(preg_split('/\s+/u', mb_strtolower($q, 'UTF-8'))));
    $limit = min(max((int)($_GET['limit'] ?? 60), 1), 200);

    $fp = fopen($OUT, 'r');
    if (!$fp) jout(['ok' => false, 'error' => '목록을 열지 못했습니다'], 500);

    $hits = [];
    $matched = 0;
    while (($line = fgets($fp)) !== false) {
        $tab = strpos($line, "\t");
        if ($tab === false) continue;
        $path = substr($line, 0, $tab);
        $text = rtrim(substr($line, $tab + 1), "\r\n");
        if ($text === '' || $text[0] === "\x01") continue;      // 못 읽은 문서

        $low = mb_strtolower($text, 'UTF-8');
        $ok = true;
        foreach ($terms as $t) { if (mb_strpos($low, $t, 0, 'UTF-8') === false) { $ok = false; break; } }
        if (!$ok) continue;

        $matched++;
        if (count($hits) >= $limit) continue;

        // 첫 검색어 주변을 잘라 보여줍니다
        $pos = mb_strpos($low, $terms[0], 0, 'UTF-8');
        $from = max(0, $pos - 60);
        $snip = mb_substr($text, $from, 220, 'UTF-8');
        $hits[] = [
            'name' => basename($path),
            'dir'  => dirname($path),
            'path' => $path,
            'ext'  => strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            'snip' => ($from > 0 ? '…' : '') . $snip . '…',
        ];
    }
    fclose($fp);

    jout(['ok' => true, 'matched' => $matched, 'shown' => count($hits), 'results' => $hits]);
}

/* ---------------- 못 읽은 문서 목록 (나중에 OCR 대상) ---------------- */
if ($action === 'unread') {
    if (!is_file($OUT)) jout(['ok' => false, 'error' => '글자 목록이 아직 없습니다'], 404);
    $limit = min(max((int)($_GET['limit'] ?? 200), 1), 1000);
    $fp = fopen($OUT, 'r');
    $rows = []; $n = 0; $byExt = [];
    while (($line = fgets($fp)) !== false) {
        $tab = strpos($line, "\t");
        if ($tab === false) continue;
        $text = rtrim(substr($line, $tab + 1), "\r\n");
        if ($text === '' || $text[0] !== "\x01") continue;
        $n++;
        $path = substr($line, 0, $tab);
        $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $byExt[$ext] = ($byExt[$ext] ?? 0) + 1;
        if (count($rows) < $limit) {
            $rows[] = ['name' => basename($path), 'dir' => dirname($path),
                       'path' => $path, 'ext' => $ext, '이유' => substr($text, 1)];
        }
    }
    fclose($fp);
    arsort($byExt);
    jout(['ok' => true, '못읽은수' => $n, '형식별' => $byExt, 'results' => $rows]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다: ' . $action], 400);
