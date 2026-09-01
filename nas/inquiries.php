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
    http_response_code($code);
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

$action = $_GET['action'] ?? '';

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
        'rows'      => $rows,
    ]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
