<?php
/**
 * 브랜드 대시보드 - 데이터 저장
 * NAS의 web 폴더에 brand.html 과 함께 올려두면 됩니다.
 * 수정할 필요 없습니다.
 *
 * - 여러 명이 동시에 저장해도 파일이 깨지지 않도록 잠금(lock)을 씁니다.
 * - 하루에 한 번, 그날 처음 저장할 때 이전 데이터를 백업해 둡니다.
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST 요청만 허용됩니다']);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => '전달된 데이터가 없습니다']);
    exit;
}

$data = json_decode($raw, true);
if ($data === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => '데이터 형식이 올바르지 않습니다']);
    exit;
}

$dir = __DIR__ . '/data';
if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다 (권한 확인 필요)']);
    exit;
}

$file = $dir . '/brand-data.json';

// 하루 1회 백업
$backup = $dir . '/backup-' . date('Y-m-d') . '.json';
if (file_exists($file) && !file_exists($backup)) {
    @copy($file, $backup);
}

$fp = @fopen($file, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => '파일을 열 수 없습니다 (권한 확인 필요)']);
    exit;
}
if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => '다른 사람이 저장 중입니다. 잠시 후 다시 시도해 주세요']);
    exit;
}

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['ok' => true, 'savedAt' => date('c')]);
