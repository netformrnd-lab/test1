<?php
/**
 * 🎬 영상 자동화 studio 전용 — 읽기 전용 피드
 *
 *   ?action=check                키·설정이 맞는지 (자료는 안 돌려줌)
 *   ?action=brands               브랜드 자료·대본용 문서 (기본값)
 *   ?action=brand&id=<brandId>   한 브랜드만
 *
 * ── 왜 이 파일이 따로 있나 ─────────────────────────────────────
 * load.php 는 사람이 '로그인'해서 보는 화면용입니다. studio(구글 클라우드
 * 함수)는 서버라서 로그인을 못 합니다. 그래서 studio 에게는 '읽기 전용 열쇠'
 * 하나를 주고, 이 파일이 그 열쇠를 확인한 뒤 <<필요한 자료만>> 내줍니다.
 *
 * ── 무엇을 내주나 (딱 이것만) ──────────────────────────────────
 *   브랜드: 이름·소개·톤(마스터프롬프트)·브랜드북·자료(글/프롬프트)·위키(매뉴얼)
 *   빼는 것: 💳 비용 · 🔐 내부계정 · 비밀번호 · 문의 · 할 일 등 (대본과 무관/민감)
 *   무거운 것(사진 base64 등)은 떼고 글자만 내보냅니다.
 *
 * ── 열쇠 두는 법 (NAS 에만, 저장소엔 안 올림) ──────────────────
 *   data/studio-key.php 를 만들고 아래 한 줄만 적습니다:
 *     <?php return 'studio 가 쓸-아무도-모르는-긴-문자열';
 *   studio 는 이 값을  ?key=...  또는 헤더  X-Studio-Key  로 보냅니다.
 *   (이 저장소는 공개라 열쇠는 절대 코드에 적지 않습니다)
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
/* studio 가 브라우저에서 직접 부를 수도 있으니 읽기(GET)만 교차 허용 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: X-Studio-Key, Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
@ini_set('display_errors', '0');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

$DATA_DIR = __DIR__ . '/data';
$KEY_FILE = $DATA_DIR . '/studio-key.php';
$DAT_FILE = $DATA_DIR . '/brand-data.json';

function out($a, $code = 200) {
    http_response_code(200);                 // 웹스테이션이 오류코드 본문을 바꿔치기 하므로 늘 200
    if ($code !== 200) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* 열쇠 읽기 — 파일이 키를 return 합니다. 어떤 응답에도 키를 돌려주지 않습니다. */
function studio_key($f) {
    if (!is_file($f)) return '';
    $v = @include $f;
    return is_string($v) ? trim($v) : '';
}
function given_key() {
    $k = $_GET['key'] ?? '';
    if ($k === '' && isset($_SERVER['HTTP_X_STUDIO_KEY'])) $k = $_SERVER['HTTP_X_STUDIO_KEY'];
    return trim((string)$k);
}
/* 길이·내용이 같아도 시간차로 안 새게 비교 */
function key_ok($a, $b) {
    if ($a === '' || $b === '') return false;
    return function_exists('hash_equals') ? hash_equals($a, $b) : ($a === $b);
}

$want = studio_key($KEY_FILE);
if ($want === '') {
    out(['ok' => false, 'error' => '아직 설정 전입니다 — NAS 의 data/studio-key.php 에 열쇠를 넣어 주세요'], 503);
}
if (!key_ok($want, given_key())) {
    out(['ok' => false, 'error' => '열쇠가 맞지 않습니다'], 401);
}

$action = $_GET['action'] ?? 'brands';
if ($action === 'check') {
    out(['ok' => true, '준비됨' => is_file($DAT_FILE), '무엇' => 'studio-feed', 'ver' => 1]);
}

/* ── 자료 정리 도우미 ───────────────────────────────────────── */

/* 무거운/쓸모없는 값은 떼고 글자만 남깁니다. 사진(base64·data:)·긴 덩어리 제거 */
function slim_str($v) {
    if (!is_string($v)) return $v;
    if (strpos($v, 'data:') === 0) return '';                 // 내장 이미지/파일 통째 제거
    if (strlen($v) > 8000 && preg_match('#^[A-Za-z0-9+/=\r\n]+$#', $v)) return '';  // base64 덩어리
    return $v;
}
/* 목록 항목에서 '대본에 쓸 글'만 골라 남깁니다 (화이트리스트) */
function slim_item($x) {
    if (!is_array($x)) return null;
    $keep = ['id','name','title','label','text','body','note','desc','prompt','url','tag','kind'];
    $o = [];
    foreach ($keep as $k) {
        if (!isset($x[$k])) continue;
        $v = slim_str($x[$k]);
        if ($v === '' || $v === null) continue;
        $o[$k] = $v;
    }
    return $o ? $o : null;
}
function slim_list($arr) {
    if (!is_array($arr)) return [];
    $o = [];
    foreach ($arr as $x) { $s = slim_item($x); if ($s) $o[] = $s; }
    return $o;
}

/* 한 브랜드 → 대본/브랜드 자료만 */
function brand_pack($b) {
    if (!is_array($b)) return null;
    if (!empty($b['nfHolder'])) return null;                  // 🎬 동기화 보관함은 자료가 아니라 제외
    return [
        'id'      => (string)($b['id'] ?? ''),
        'name'    => (string)($b['name'] ?? ''),
        'icon'    => (string)($b['icon'] ?? ''),
        'color'   => (string)($b['color'] ?? ''),
        'desc'    => (string)($b['desc'] ?? ''),
        'owner'   => (string)($b['owner'] ?? ''),
        '톤·가이드'  => slim_str((string)($b['masterPrompt'] ?? '')),
        '브랜드북'   => is_array($b['book'] ?? null) ? slim_list($b['book']) : slim_str((string)($b['book'] ?? '')),
        '자료'      => slim_list($b['assets'] ?? []),
        '문서'      => slim_list($b['docs'] ?? []),
        '기획서'    => slim_list($b['plans'] ?? []),
    ];
}

$raw = is_file($DAT_FILE) ? (string)@file_get_contents($DAT_FILE) : '';
$data = $raw !== '' ? json_decode($raw, true) : null;
if (!is_array($data)) {
    out(['ok' => false, 'error' => '허브 자료를 읽지 못했습니다'], 500);
}
$brands = is_array($data['brands'] ?? null) ? $data['brands'] : [];

if ($action === 'brand') {
    $id = (string)($_GET['id'] ?? '');
    foreach ($brands as $b) {
        if (is_array($b) && (string)($b['id'] ?? '') === $id) {
            $p = brand_pack($b);
            if ($p) out(['ok' => true, 'brand' => $p]);
        }
    }
    out(['ok' => false, 'error' => '그 브랜드를 찾지 못했습니다'], 404);
}

/* 기본: 브랜드 자료 전체 + 공용 위키(매뉴얼) */
$packed = [];
foreach ($brands as $b) { $p = brand_pack($b); if ($p) $packed[] = $p; }

$wiki = [];
foreach (['wiki', 'wikiItems', 'manuals'] as $wk) {
    if (is_array($data[$wk] ?? null)) { $wiki = slim_list($data[$wk]); break; }
}

out([
    'ok'      => true,
    '받은때'   => date('c'),
    '브랜드수' => count($packed),
    'brands'  => $packed,
    '위키'     => $wiki,
    '안내'     => '읽기 전용 · 비용·계정·문의·할일 등은 포함하지 않습니다',
]);
