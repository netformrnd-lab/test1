<?php
/**
 * 할 일 내보내기 — 다른 프로그램이 읽어 가는 주소
 *
 * 미디어마케팅팀 TeamHub 처럼 <<밖에 있는 프로그램>> 이 우리 할 일을
 * 읽어 가도록 열어 주는 통로입니다. 기준은 이쪽(브랜드 대시보드)이고,
 * 저쪽은 읽어다 자기 화면을 갱신합니다. 쓰기는 없습니다 — 읽기만.
 *
 *   tasks.php?token=…              할 일 전부 (JSON)
 *   tasks.php?token=…&f=csv        같은 것을 CSV 로 (엑셀·구글시트용)
 *   tasks.php?token=…&since=…      그 시각 뒤에 바뀐 것만
 *   tasks.php?token=…&done=0       끝낸 것은 빼고
 *
 * ⚠️ 로그인을 거치지 않습니다. TeamHub 같은 프로그램은 로그인을 할 수
 *    없기 때문입니다. 대신 <<암호 글자(token)>> 를 맞춘 쪽만 받습니다.
 *    config.php 에 적기 전에는 아무것도 안 나갑니다 (꺼진 상태).
 *    주소를 아는 사람은 할 일을 다 볼 수 있으니 아무 데나 적지 마세요.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function tk_out($a, $code = 200) {
    http_response_code(200);            // 웹 스테이션이 오류 응답을 바꿔치기 합니다
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ── 암호 글자 확인 ──────────────────────────────────────────────
   config.php 에 export_token 을 적어야 열립니다. 안 적었으면 꺼진
   것으로 보고 아무것도 안 내보냅니다 — 모르고 켜 두는 일이 없게. */
$cfg   = is_file(__DIR__ . '/config.php') ? (array)(include __DIR__ . '/config.php') : [];
$want  = trim((string)($cfg['export_token'] ?? ''));
if ($want === '') {
    tk_out(['ok' => false, 'error' =>
        '아직 꺼져 있습니다. NAS 의 web/brand/config.php 에 '
      . "'export_token' => '아무도 모를 긴 글자' 를 적으면 열립니다."], 403);
}
$got = (string)($_GET['token'] ?? ($_SERVER['HTTP_X_TOKEN'] ?? ''));
/* 글자를 하나씩 맞춰 보는 공격을 막으려고 길이·시간이 안 새는 비교를 씁니다 */
if (!hash_equals($want, $got)) {
    tk_out(['ok' => false, 'error' => '암호 글자가 다릅니다.'], 403);
}

/* ── 자료 읽기 ───────────────────────────────────────────────────
   guard.php 는 <<부르지 않습니다>> — 부르면 로그인 검사에 걸려 막힙니다.
   여기서는 위의 암호 글자가 문지기 노릇을 합니다.
   자료는 주소로 그냥 열리지 않게 .php 로 두었고, 예전 판은 .json 입니다. */
$file = __DIR__ . '/data/brand-data.php';
if (!is_file($file)) $file = __DIR__ . '/data/brand-data.json';
$raw = is_file($file) ? (string)@file_get_contents($file) : '';
/* .php 로 둔 자료는 맨 앞에 못 열게 막는 한 줄이 붙어 있습니다 */
if (($p = strpos($raw, '{')) !== false && $p > 0) $raw = substr($raw, $p);
$data = json_decode($raw, true);
if (!is_array($data)) tk_out(['ok' => false, 'error' => '자료를 읽지 못했습니다.'], 500);

/* ── 할 일 모으기 ───────────────────────────────────────────────── */
$since   = trim((string)($_GET['since'] ?? ''));
$withDone = ($_GET['done'] ?? '1') !== '0';
$rows = [];
foreach ((array)($data['brands'] ?? []) as $b) {
    $bn = (string)($b['name'] ?? '');
    foreach ((array)($b['tasks'] ?? []) as $t) {
        $st = (string)($t['status'] ?? '');
        if (!$withDone && $st === '완료') continue;
        $up = (string)($t['updatedAt'] ?? '');
        if ($since !== '' && $up !== '' && strcmp($up, $since) <= 0) continue;
        $subs = [];
        foreach ((array)($t['subs'] ?? []) as $s) {
            $subs[] = ['이름' => (string)($s['title'] ?? ''),
                       '상태' => (string)($s['st'] ?? ''),
                       '진척률' => (int)($s['pct'] ?? 0)];
        }
        $rows[] = [
            'id'      => (string)($t['id'] ?? ''),
            '업무명'   => (string)($t['title'] ?? ''),
            '담당자'   => (string)($t['owner'] ?? ''),
            '상태'     => $st,
            '우선순위' => (string)($t['prio'] ?? ''),
            '유형'     => (string)($t['kind'] ?? ''),
            '시작일'   => (string)($t['start'] ?? ''),
            '마감일'   => (string)($t['due'] ?? ''),
            '진척률'   => (int)($t['pct'] ?? 0),
            '브랜드'   => $bn,
            '메모'     => (string)($t['note'] ?? ''),
            '보조업무' => $subs,
            '수정시각' => $up,
        ];
    }
}
/* 다음에 「이 뒤로 바뀐 것만」 달라고 할 때 그대로 쓸 값입니다.
   지금 시각이 아니라 <<내보낸 것 중 가장 늦은 수정시각>> 을 줍니다 —
   저장 중이던 변경이 사이에 끼어 빠지는 일을 막습니다. */
$next = $since;
foreach ($rows as $r) if (strcmp((string)$r['수정시각'], (string)$next) > 0) $next = $r['수정시각'];

/* ── CSV 로 달라고 했으면 ────────────────────────────────────────── */
if (strtolower((string)($_GET['f'] ?? '')) === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: inline; filename="tasks.csv"');
    $cols = ['id','업무명','담당자','상태','우선순위','유형','시작일','마감일','진척률','브랜드','메모','수정시각'];
    echo "\xEF\xBB\xBF";                     // 엑셀이 한글을 안 깨게 하는 표시
    $out = fopen('php://output', 'w');
    fputcsv($out, $cols);
    foreach ($rows as $r) {
        $line = [];
        foreach ($cols as $c) $line[] = (string)$r[$c];
        fputcsv($out, $line);
    }
    fclose($out);
    exit;
}

tk_out([
    'ok'         => true,
    '할일'        => $rows,
    '건수'        => count($rows),
    'next_since' => $next,
    '만든시각'    => date('c'),
]);
