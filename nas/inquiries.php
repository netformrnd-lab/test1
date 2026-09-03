<?php
/**
 * 브랜드 허브 - 문의 기록 보관소
 *
 * 구글시트의 문의 기록을 n8n 등으로 밀어 넣으면 여기에 쌓이고,
 * 대시보드의 각 브랜드 「문의」 탭에서 보여줍니다.
 * 시트를 외부에 공개하지 않아도 되는 방식입니다.
 *
 *   POST ?action=push   { "token":"...", "rows":[ {..}, {..} ] }   전체 교체
 *   GET  ?action=list&brand=아파트스퀘어                            브랜드별 조회
 *   GET  ?action=check                                            상태 확인
 *
 * 토큰은 config.php 에 넣습니다. (없으면 사내망 전제로 토큰 없이 동작)
 */

header('Content-Type: application/json; charset=utf-8');

$DATA_DIR = __DIR__ . '/data';
$FILE     = $DATA_DIR . '/inquiries.json';
$MAX_ROWS = 20000;

function jout($arr, $code = 200) {
    // 웹 스테이션이 200 이 아닌 응답의 내용을 자기 오류 페이지로 바꿔치기 하므로,
    // 항상 200 으로 보내고 실패 여부는 JSON 안의 ok 로만 알립니다.
    http_response_code(200);
    if ($code !== 200 && is_array($arr) && !isset($arr['status'])) $arr['status'] = $code;
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

$config = is_file(__DIR__ . '/config.php') ? include __DIR__ . '/config.php' : null;
$token  = is_array($config) && !empty($config['push_token']) ? $config['push_token'] : null;

/** 어떤 열이 브랜드인지 찾아냅니다 */
function brand_of($row) {
    foreach (['브랜드', 'brand', 'Brand', '브랜드명'] as $k) {
        if (isset($row[$k]) && trim((string)$row[$k]) !== '') return trim((string)$row[$k]);
    }
    return '';
}

function load_all($file) {
    if (!is_file($file)) return ['updatedAt' => null, 'source' => null, 'rows' => []];
    $j = json_decode(file_get_contents($file), true);
    return is_array($j) ? $j : ['updatedAt' => null, 'source' => null, 'rows' => []];
}

$SRC_FILE = $DATA_DIR . '/inquiries-source.json';

/* 예전에는 시트를 하나만 담았습니다.
   지금은 여러 개를 담고, 시트마다 브랜드를 못박을 수 있습니다.
   예전 파일도 그대로 읽히도록 모양을 맞춰 돌려줍니다. */
function load_sources($f) {
    if (!is_file($f)) return [];
    $j = json_decode(file_get_contents($f), true);
    if (!is_array($j)) return [];

    if (!empty($j['sources']) && is_array($j['sources'])) {   // 새 모양
        $out = [];
        foreach ($j['sources'] as $s) {
            if (empty($s['url'])) continue;
            $out[] = [
                'id'    => $s['id']    ?? substr(md5($s['url']), 0, 8),
                'name'  => $s['name']  ?? '',
                'url'   => $s['url'],
                'brand' => trim($s['brand'] ?? ''),      // 비우면 시트의 브랜드 열을 씁니다
            ];
        }
        return $out;
    }
    if (!empty($j['url'])) {                                  // 예전 모양 (한 개)
        return [['id' => substr(md5($j['url']), 0, 8), 'name' => '', 'url' => $j['url'], 'brand' => '']];
    }
    return [];
}


/** 파일을 통째로 바꿔치기합니다. 반쯤 쓰인 내용이 읽히지 않게 하려는 것입니다. */
function atomic_put($path, $text) {
    $tmp = $path . '.tmp' . getmypid();
    if (@file_put_contents($tmp, $text) === false) { @unlink($tmp); return false; }
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, 0664);
    return true;
}

function save_sources($f, $list) {
    return atomic_put($f, json_encode(
        ['sources' => array_values($list), 'setAt' => date('c')], JSON_UNESCAPED_UNICODE));
}

/* 예전 코드가 부르던 이름 — 첫 번째 시트를 돌려줍니다 */
function load_source($f) {
    $l = load_sources($f);
    return $l ? $l[0] : null;
}

/** curl → file_get_contents → wget 순으로 가져옵니다 */
function fetch_csv($url, &$how) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,   // 구글은 실제 파일로 넘겨줍니다
            CURLOPT_TIMEOUT        => 40,
            CURLOPT_USERAGENT      => 'BrandHub/1.0',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body !== false && $code === 200) { $how = 'curl'; return $body; }
    }
    if (ini_get('allow_url_fopen')) {
        $body = @file_get_contents($url);
        if ($body !== false && $body !== '') { $how = 'file_get_contents'; return $body; }
    }
    if (function_exists('shell_exec')) {
        $body = @shell_exec('wget -q -T 40 -O - ' . escapeshellarg($url) . ' 2>/dev/null');
        if ($body !== null && $body !== '') { $how = 'wget'; return $body; }
    }
    return false;
}

/** CSV 글자를 줄 단위 배열로 바꿉니다 (셀 안의 줄바꿈도 처리) */
function csv_to_rows($csv) {
    if (substr($csv, 0, 3) === "\xEF\xBB\xBF") $csv = substr($csv, 3);   // 엑셀 BOM
    $fp = fopen('php://memory', 'r+');
    fwrite($fp, $csv);
    rewind($fp);

    $head = fgetcsv($fp);
    if (!$head) { fclose($fp); return [null, []]; }
    $head = array_map(function ($h) { return trim((string)$h); }, $head);

    $rows = [];
    while (($r = fgetcsv($fp)) !== false) {
        $row = [];
        $has = false;
        foreach ($head as $i => $h) {
            if ($h === '') continue;
            $v = trim((string)($r[$i] ?? ''));
            $row[$h] = $v;
            if ($v !== '') $has = true;
        }
        if ($has) $rows[] = $row;
    }
    fclose($fp);
    return [$head, $rows];
}

function save_rows($file, $dir, $rows, $source) {
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return false;
    $payload = ['updatedAt' => date('c'), 'source' => substr($source, 0, 60), 'rows' => $rows];
    if (!atomic_put($file, json_encode($payload, JSON_UNESCAPED_UNICODE))) return false;

    // 「언제 · 몇 건」 만 적은 작은 파일. 화면이 자주 물어봐도 부담이 없게 하려는 것입니다.
    atomic_put($dir . '/inq-stamp.txt', $payload['updatedAt'] . "\t" . count($rows));
    return $payload;
}

$EDIT_FILE = $DATA_DIR . '/inquiry-edits.json';

/** 대시보드에서만 쓰는 칸들 (구글시트에는 없습니다) */
$OWN_COLS = ['처리상태', '담당자', '메모'];

function load_edits($f, $ownCols) {
    $j = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
    if (!is_array($j)) $j = [];
    if (!isset($j['cols']) || !is_array($j['cols'])) $j['cols'] = $ownCols;
    if (!isset($j['rows']) || !is_array($j['rows'])) $j['rows'] = [];
    return $j;
}

function save_edits($f, $j) {
    $j['savedAt'] = date('c');
    return atomic_put($f, json_encode($j, JSON_UNESCAPED_UNICODE));
}

/**
 * 한 줄을 알아보는 이름표를 만듭니다.
 * 시트를 다시 가져와도 같은 줄에 같은 이름표가 붙어야
 * 적어둔 메모가 그 줄에 그대로 남습니다.
 *
 * 「번호」 같은 열이 있으면 그걸 쓰고, 없으면 줄 내용으로 만듭니다.
 * (그래서 시트에서 그 줄의 내용을 고치면 이름표가 바뀝니다 — 안내에 적어두었습니다)
 */
function row_key($row, $keyCol, $ownCols) {
    if ($keyCol !== '' && isset($row[$keyCol]) && trim((string)$row[$keyCol]) !== '') {
        return 'k:' . substr(md5(trim((string)$row[$keyCol])), 0, 16);
    }
    $parts = [];
    foreach ($row as $k => $v) {
        if ($k === '' || $k[0] === '_') continue;
        if (in_array($k, $ownCols, true)) continue;
        $parts[] = $k . '=' . trim((string)$v);
    }
    sort($parts);
    return 'h:' . substr(md5(implode('|', $parts)), 0, 16);
}

/** 「번호」처럼 줄마다 다른 값이 들어있는 열을 찾습니다 */
function find_key_col($rows) {
    if (!$rows) return '';
    $cands = [];
    foreach (array_keys($rows[0]) as $c) {
        if ($c === '' || $c[0] === '_') continue;
        if (preg_match('/(번호|no$|^id$|아이디|접수번호|문의번호)/iu', $c)) $cands[] = $c;
    }
    foreach ($cands as $c) {
        $seen = []; $ok = true;
        foreach ($rows as $r) {
            $v = trim((string)($r[$c] ?? ''));
            if ($v === '' || isset($seen[$v])) { $ok = false; break; }
            $seen[$v] = 1;
        }
        if ($ok) return $c;
    }
    return '';
}

$action = $_GET['action'] ?? '';

/**
 * 한 칸을 고칩니다. (POST)
 *   {"key":"h:...", "col":"메모", "value":"전화드림"}
 *   {"edits":[{...},{...}]}                     여러 칸을 한 번에
 *
 * 원본 구글시트는 건드리지 않습니다. 고친 값만 여기 따로 쌓아두었다가
 * 시트를 다시 가져올 때마다 그 위에 얹습니다. 그래서 덮어써지지 않습니다.
 */
if ($action === 'edit') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    }
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) jout(['ok' => false, 'error' => '내용을 읽지 못했습니다'], 400);

    $list = isset($body['edits']) && is_array($body['edits']) ? $body['edits'] : [$body];
    if (count($list) > 200) jout(['ok' => false, 'error' => '한 번에 200칸까지만 됩니다'], 413);

    $lock = @fopen($DATA_DIR . '/inq-edit.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);            // 두 명이 같이 고쳐도 섞이지 않게

    $ed = load_edits($EDIT_FILE, $OWN_COLS);
    $n = 0;
    foreach ($list as $e) {
        $key = trim((string)($e['key'] ?? ''));
        $col = trim((string)($e['col'] ?? ''));
        if ($key === '' || $col === '' || $col[0] === '_') continue;
        if (!preg_match('/^[kh]:[0-9a-f]{16}$/', $key)) continue;
        $val = (string)($e['value'] ?? '');
        if (function_exists('mb_substr')) $val = mb_substr($val, 0, 500, 'UTF-8');

        if (!isset($ed['rows'][$key])) $ed['rows'][$key] = [];
        if ($val === '' && array_key_exists($col, $ed['rows'][$key])) {
            unset($ed['rows'][$key][$col]);      // 비우면 원래 값으로 되돌아갑니다
            if (!$ed['rows'][$key]) unset($ed['rows'][$key]);
        } else {
            $ed['rows'][$key][$col] = $val;
        }
        $n++;
    }
    if (count($ed['rows']) > 20000) {
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        jout(['ok' => false, 'error' => '고친 줄이 너무 많습니다 (2만 줄 한도)'], 413);
    }

    $ok = save_edits($EDIT_FILE, $ed);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    if (!$ok) jout(['ok' => false, 'error' => '저장하지 못했습니다 (data 폴더 권한 확인)'], 500);

    // 다른 분 화면에도 바로 반영되도록 갱신 시각을 올려둡니다.
    // 고친 사람 화면은 이미 최신이므로, 이 시각을 돌려주어 다시 안 받아도 되게 합니다.
    $at = date('c');
    atomic_put($DATA_DIR . '/inq-stamp.txt', $at . "\t" . count(load_all($FILE)['rows']));
    jout(['ok' => true, '고친칸' => $n, '고친줄' => count($ed['rows']), 'updatedAt' => $at]);
}

/* 대시보드에서만 쓰는 칸을 더하거나 뺍니다 (POST {"cols":[...]}) */
if ($action === 'editcols') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $body = json_decode((string)file_get_contents('php://input'), true);
    $cols = (is_array($body) && isset($body['cols']) && is_array($body['cols'])) ? $body['cols'] : null;
    if ($cols === null) jout(['ok' => false, 'error' => '칸 목록이 없습니다'], 400);

    $clean = [];
    foreach ($cols as $c) {
        $c = trim(preg_replace('/[\x00-\x1f<>"\\]+/u', '', (string)$c));
        if ($c === '' || $c[0] === '_') continue;
        if (function_exists('mb_substr')) $c = mb_substr($c, 0, 20, 'UTF-8');
        if (!in_array($c, $clean, true)) $clean[] = $c;
        if (count($clean) >= 8) break;
    }
    $ed = load_edits($EDIT_FILE, $OWN_COLS);
    $ed['cols'] = $clean;
    if (!save_edits($EDIT_FILE, $ed)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);
    $at = date('c');
    atomic_put($DATA_DIR . '/inq-stamp.txt', $at . "\t" . count(load_all($FILE)['rows']));
    jout(['ok' => true, '내칸' => $clean, 'updatedAt' => $at]);
}

/* 언제 · 몇 건인지만 알려줍니다 (실시간 확인용 — 몇 십 바이트) */
if ($action === 'stamp') {
    $st = $DATA_DIR . '/inq-stamp.txt';
    if (is_file($st)) {
        $p = explode("\t", (string)@file_get_contents($st));
        jout(['ok' => true, 'updatedAt' => ($p[0] ?? null) ?: null, 'total' => (int)($p[1] ?? 0)]);
    }
    $all = load_all($FILE);            // 표시 파일이 아직 없으면 한 번만 본문을 봅니다
    jout(['ok' => true, 'updatedAt' => $all['updatedAt'], 'total' => count($all['rows'])]);
}

/* ---------------- 상태 확인 ---------------- */
if ($action === 'check') {
    $all = load_all($FILE);
    $byBrand = [];
    foreach ($all['rows'] as $r) {
        $b = brand_of($r) ?: '(브랜드 없음)';
        $byBrand[$b] = ($byBrand[$b] ?? 0) + 1;
    }
    jout([
        'ok'         => true,
        '토큰'       => $token ? '설정됨' : '없음 (사내망 전제)',
        '보관건수'   => count($all['rows']),
        '브랜드별'   => $byBrand,
        '마지막갱신' => $all['updatedAt'],
        '보낸곳'     => $all['source'],
        '연결된시트수' => count(load_sources($SRC_FILE)),
        '연결된시트' => (function () use ($SRC_FILE) {
            $l = load_sources($SRC_FILE);
            if (!$l) return '연결 안 됨';
            return array_map(function ($s) {
                return ($s['name'] !== '' ? $s['name'] . ' — ' : '')
                     . ($s['brand'] !== '' ? '[' . $s['brand'] . '] ' : '') . $s['url'];
            }, $l);
        })(),
        'data폴더_쓰기가능' => is_dir($DATA_DIR)
            ? (is_writable($DATA_DIR) ? '예' : '아니오')
            : (is_writable(__DIR__) ? '아직 없지만 만들 수 있음' : '상위 폴더에 쓸 수 없음'),
    ]);
}

/* ---------------- 밀어넣기 ---------------- */
if ($action === 'push') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);

    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in)) jout(['ok' => false, 'error' => '보낸 내용이 JSON 형식이 아닙니다'], 400);

    if ($token !== null && ($in['token'] ?? '') !== $token) {
        jout(['ok' => false, 'error' => '토큰이 올바르지 않습니다'], 401);
    }

    $rows = $in['rows'] ?? null;
    if (!is_array($rows)) jout(['ok' => false, 'error' => 'rows 는 배열이어야 합니다'], 400);
    if (count($rows) > $MAX_ROWS) {
        jout(['ok' => false, 'error' => '한 번에 보낼 수 있는 건수를 넘었습니다 (최대 ' . $MAX_ROWS . '건)'], 413);
    }

    // 값은 문자열로 정리하고, 내용이 전부 빈 줄은 버립니다
    $clean = [];
    foreach ($rows as $r) {
        if (!is_array($r)) continue;
        $row = [];
        $has = false;
        foreach ($r as $k => $v) {
            if (is_array($v) || is_object($v)) continue;
            $s = trim((string)$v);
            $row[(string)$k] = $s;
            if ($s !== '') $has = true;
        }
        if ($has) $clean[] = $row;
    }

    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true) && !is_dir($DATA_DIR)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다 (권한 확인 필요)'], 500);
    }

    $payload = [
        'updatedAt' => date('c'),
        'source'    => substr((string)($in['source'] ?? 'unknown'), 0, 60),
        'rows'      => $clean,
    ];

    $fp = @fopen($FILE, 'c+');
    if (!$fp || !flock($fp, LOCK_EX)) {
        if ($fp) fclose($fp);
        jout(['ok' => false, 'error' => '파일을 쓰지 못했습니다 (권한 확인 필요)'], 500);
    }
    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($payload, JSON_UNESCAPED_UNICODE));
    fflush($fp); flock($fp, LOCK_UN); fclose($fp);

    $byBrand = [];
    foreach ($clean as $r) { $b = brand_of($r) ?: '(브랜드 없음)'; $byBrand[$b] = ($byBrand[$b] ?? 0) + 1; }

    jout(['ok' => true, '받은건수' => count($clean), '브랜드별' => $byBrand, '시각' => $payload['updatedAt']]);
}

/* ---------------- 조회 ---------------- */
if ($action === 'list') {
    $all   = load_all($FILE);
    $brand = trim($_GET['brand'] ?? '');

    // 대시보드에서 고친 내용을 각 줄에 얹습니다.
    // 원본(구글시트)은 그대로 두고, 고친 값만 따로 보관했다가 여기서 덮습니다.
    $ed     = load_edits($EDIT_FILE, $OWN_COLS);
    $keyCol = find_key_col($all['rows']);
    foreach ($all['rows'] as $i => $r) {
        $key = row_key($r, $keyCol, $ed['cols']);
        $all['rows'][$i]['_key'] = $key;
        $changed = [];
        if (isset($ed['rows'][$key]) && is_array($ed['rows'][$key])) {
            foreach ($ed['rows'][$key] as $c => $v) {
                if ($c === '' || $c[0] === '_') continue;
                if (!in_array($c, $ed['cols'], true) && !array_key_exists($c, $r)) continue;
                if (!in_array($c, $ed['cols'], true)) {
                    $all['rows'][$i]['_원래'][$c] = (string)($r[$c] ?? '');
                    $changed[] = $c;
                }
                $all['rows'][$i][$c] = $v;
            }
        }
        foreach ($ed['cols'] as $c) {
            if (!isset($all['rows'][$i][$c])) $all['rows'][$i][$c] = '';
        }
        if ($changed) $all['rows'][$i]['_고침'] = $changed;
    }

    $rows = $all['rows'];
    if ($brand !== '') {
        $rows = array_values(array_filter($rows, function ($r) use ($brand) {
            $b = brand_of($r);
            // "POUR공법"과 "POUR 공법"처럼 띄어쓰기만 다른 경우도 같이 봅니다
            return $b !== '' && str_replace(' ', '', $b) === str_replace(' ', '', $brand);
        }));
    }

    // 열 순서는 첫 줄 기준으로 잡습니다
    $cols = [];
    foreach ($rows as $r) { foreach (array_keys($r) as $k) { if (!in_array($k, $cols, true)) $cols[] = $k; } }

    jout([
        'ok'        => true,
        'updatedAt' => $all['updatedAt'],
        'source'    => $all['source'],
        'total'     => count($all['rows']),
        'columns'   => $cols,
        '내칸'      => $ed['cols'],
        '이름표열'  => $keyCol,
        'rows'      => $rows,
    ]);
}

/* ---------------- 시트 주소 등록 / 해제 ---------------- */
if ($action === 'setsource') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    $in   = json_decode(file_get_contents('php://input'), true) ?: [];
    $list = load_sources($SRC_FILE);

    // 목록을 통째로 주면 그대로 저장합니다
    if (isset($in['sources']) && is_array($in['sources'])) {
        $clean = [];
        foreach ($in['sources'] as $s) {
            $u = trim($s['url'] ?? '');
            if ($u === '') continue;
            if (!preg_match('#^https://#i', $u)) {
                jout(['ok' => false, 'error' => 'https:// 로 시작하는 주소만 연결할 수 있습니다: ' . $u], 400);
            }
            $clean[] = ['id' => $s['id'] ?? substr(md5($u . microtime()), 0, 8),
                        'name' => trim($s['name'] ?? ''), 'url' => $u,
                        'brand' => trim($s['brand'] ?? '')];
        }
        if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true) && !is_dir($DATA_DIR)) {
            jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다 (권한 확인 필요)'], 500);
        }
        if (!save_sources($SRC_FILE, $clean)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);
        jout(['ok' => true, '연결된시트수' => count($clean), 'sources' => $clean]);
    }

    // 하나 지우기
    $del = trim($in['remove'] ?? '');
    if ($del !== '') {
        $list = array_values(array_filter($list, function ($s) use ($del) { return $s['id'] !== $del; }));
        save_sources($SRC_FILE, $list);
        jout(['ok' => true, '연결된시트수' => count($list), 'sources' => $list]);
    }

    // 하나 더하기 (빈 주소면 전부 해제 — 예전 방식과 같게)
    $url = trim($in['url'] ?? '');
    if ($url === '') {
        @unlink($SRC_FILE);
        jout(['ok' => true, '연결' => '해제됨', '연결된시트수' => 0]);
    }
    if (!preg_match('#^https://#i', $url)) {
        jout(['ok' => false, 'error' => 'https:// 로 시작하는 주소만 연결할 수 있습니다'], 400);
    }
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0775, true) && !is_dir($DATA_DIR)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다 (권한 확인 필요)'], 500);
    }
    foreach ($list as $s) {
        if ($s['url'] === $url) jout(['ok' => false, 'error' => '이미 연결된 시트입니다'], 400);
    }
    $list[] = ['id' => substr(md5($url . microtime()), 0, 8),
               'name' => trim($in['name'] ?? ''), 'url' => $url,
               'brand' => trim($in['brand'] ?? '')];
    if (!save_sources($SRC_FILE, $list)) jout(['ok' => false, 'error' => '저장하지 못했습니다'], 500);
    jout(['ok' => true, '연결된시트수' => count($list), 'sources' => $list]);
}

/* ---------------- 연결된 시트 목록 ---------------- */
if ($action === 'sources') {
    jout(['ok' => true, 'sources' => load_sources($SRC_FILE)]);
}

/* ---------------- 시트에서 지금 가져오기 ----------------
   연결된 시트를 모두 읽어 하나로 합칩니다.
   브랜드를 못박아 둔 시트는 그 브랜드로 채웁니다 (브랜드 열이 없어도 됩니다).
   ------------------------------------------------------- */
if ($action === 'sync') {
    $list = load_sources($SRC_FILE);
    if (!$list) jout(['ok' => false, 'error' => '연결된 시트가 없습니다. 먼저 시트 주소를 등록해 주세요.'], 400);

    // maxage=180 처럼 주면, 그만큼 안 지났으면 그냥 넘어갑니다.
    // 여러 명이 대시보드를 열어둬도 구글에는 한 번만 갔다 옵니다.
    $maxage = isset($_GET['maxage']) ? max(30, (int)$_GET['maxage']) : 0;
    if ($maxage > 0 && is_file($FILE)) {
        $age = time() - (int)@filemtime($FILE);
        if ($age < $maxage) {
            jout(['ok' => true, '건너뜀' => true, '이유' => $age . '초 전에 이미 가져왔습니다',
                  'updatedAt' => date('c', (int)@filemtime($FILE))]);
        }
    }
    $lock = @fopen($DATA_DIR . '/inq.lock', 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        jout(['ok' => true, '건너뜀' => true, '이유' => '지금 다른 곳에서 가져오는 중입니다']);
    }
    // 잠금을 잡는 동안 다른 사람이 이미 받아왔을 수 있어 한 번 더 봅니다
    if ($maxage > 0 && is_file($FILE) && time() - (int)@filemtime($FILE) < $maxage) {
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        jout(['ok' => true, '건너뜀' => true, '이유' => '방금 다른 곳에서 가져왔습니다',
              'updatedAt' => date('c', (int)@filemtime($FILE))]);
    }

    $all      = [];
    $perSheet = [];
    $fails    = [];

    foreach ($list as $src) {
        $label = $src['name'] !== '' ? $src['name'] : ($src['brand'] !== '' ? $src['brand'] : $src['url']);
        $how = null;
        $csv = fetch_csv($src['url'], $how);

        if ($csv === false) {
            $fails[] = $label . ': 가져오지 못했습니다 (주소와 인터넷 연결 확인)';
            continue;
        }
        if (stripos(ltrim($csv), '<!DOCTYPE') === 0 || stripos(ltrim($csv), '<html') === 0) {
            $fails[] = $label . ': CSV가 아니라 웹페이지가 왔습니다 (「웹에 게시」 → 형식 CSV 확인)';
            continue;
        }

        [$head, $rows] = csv_to_rows($csv);
        if (!$head) { $fails[] = $label . ': 내용이 비어 있습니다'; continue; }

        $hasBrand = false;
        foreach (['브랜드','brand','Brand','브랜드명'] as $k) if (in_array($k, $head, true)) $hasBrand = true;

        // 브랜드를 못박지 않았는데 브랜드 열도 없으면 어느 브랜드인지 알 수 없습니다
        if (!$hasBrand && $src['brand'] === '') {
            $fails[] = $label . ': 브랜드 열이 없습니다. 시트에 「브랜드」 열을 넣거나, '
                     . '이 시트를 브랜드 하나에 못박아 주세요. (찾은 열: '
                     . implode(', ', array_slice(array_filter($head), 0, 8)) . ')';
            continue;
        }

        foreach ($rows as $r) {
            if ($src['brand'] !== '' && brand_of($r) === '') $r['브랜드'] = $src['brand'];
            $r['_시트'] = $label;
            $all[] = $r;
        }
        $perSheet[$label] = count($rows);
    }

    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    if (!$all) {
        jout(['ok' => false,
              'error' => "시트를 하나도 가져오지 못했습니다.\n\n · " . implode("\n · ", $fails),
              '실패' => $fails], 502);
    }
    if (count($all) > $MAX_ROWS) {
        jout(['ok' => false, 'error' => '합친 건수가 너무 많습니다 (최대 ' . $MAX_ROWS . '건)'], 413);
    }

    $saved = save_rows($FILE, $DATA_DIR, $all, 'sheet');
    if (!$saved) jout(['ok' => false, 'error' => '저장하지 못했습니다 (권한 확인 필요)'], 500);

    $byBrand = [];
    foreach ($all as $r) { $b = brand_of($r) ?: '(브랜드 없음)'; $byBrand[$b] = ($byBrand[$b] ?? 0) + 1; }
    arsort($byBrand);

    $out = ['ok' => true, '건너뜀' => false, '가져온건수' => count($all), '시트별' => $perSheet,
            '브랜드별' => $byBrand, '시각' => $saved['updatedAt']];
    if ($fails) $out['일부실패'] = $fails;
    jout($out);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
