<?php
/**
 * 브랜드 대시보드 - 데이터 불러오기
 * NAS의 web 폴더에 brand.html 과 함께 올려두면 됩니다.
 * 수정할 필요 없습니다.
 *
 * 여러 명이 같이 쓰기 때문에, 다른 사람이 저장하는 중에 읽어도
 * 반쪽짜리 내용이 나가지 않도록 확인하고 돌려줍니다.
 */

/* 로그인한 사람만 통과합니다 (계정을 안 만들었으면 예전처럼 누구나) */
if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';   // 파일이 아직 안 왔으면 예전처럼 동작합니다
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$file = __DIR__ . '/data/brand-data.json';

/**
 * ?rev=1 — 지금 판 번호만 알려줍니다. (실시간 반영에 씁니다)
 *
 * 다른 사람 화면이 몇 초마다 이걸 물어보고, 번호가 달라졌을 때만
 * 전체 내용을 받아갑니다. 그래서 자주 물어봐도 NAS 가 힘들지 않습니다.
 */
if (isset($_GET['rev'])) {
    $revFile = __DIR__ . '/data/rev.txt';
    $rev = 0; $at = null; $by = '';
    if (is_file($revFile)) {
        $parts = explode("\t", (string)@file_get_contents($revFile));
        $rev = (int)($parts[0] ?? 0);
        $at  = $parts[1] ?? null;
        $by  = $parts[2] ?? '';
    } elseif (is_file($file)) {
        // rev.txt 가 아직 없으면(예전 판) 한 번만 본문에서 읽습니다
        $d = json_decode((string)@file_get_contents($file), true);
        $rev = is_array($d) && isset($d['_rev']) ? (int)$d['_rev'] : 0;
    }
    echo json_encode(['ok' => true, 'rev' => $rev, '시각' => $at, '고친사람' => $by],
        JSON_UNESCAPED_UNICODE);
    exit;
}

// 아직 저장된 데이터가 없으면 빈 값을 돌려줍니다 (첫 사용 시 정상입니다)
if (!file_exists($file)) {
    echo 'null';
    exit;
}

// 읽은 내용이 온전한지 확인합니다. 저장이 겹쳐 이상하면 잠깐 뒤 다시 읽습니다.
$body = false;
for ($i = 0; $i < 4; $i++) {
    $t = @file_get_contents($file);
    if (is_string($t) && $t !== '' && json_decode($t) !== null) { $body = $t; break; }
    usleep(120000);   // 0.12초
}

if ($body === false) {
    // 여기까지 왔으면 파일이 정말 이상한 것입니다.
    // 빈 값('null')을 주면 화면이 "처음 쓰는 것" 으로 오해하고
    // 기본값으로 덮어쓸 수 있어서, 잘못됐다고 분명히 알려줍니다.
    echo json_encode([
        '_error' => '저장된 데이터를 읽지 못했습니다. 파일이 손상됐을 수 있습니다.',
        '_file'  => $file,
        '_크기'  => (int)@filesize($file),
        '_안내'  => 'data 폴더의 backup-날짜.json 으로 되돌릴 수 있습니다.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo $body;
