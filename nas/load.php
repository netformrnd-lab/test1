<?php
/**
 * 브랜드 대시보드 - 데이터 불러오기
 * NAS의 web 폴더에 brand.html 과 함께 올려두면 됩니다.
 * 수정할 필요 없습니다.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$file = __DIR__ . '/data/brand-data.json';

// 아직 저장된 데이터가 없으면 빈 값을 돌려줍니다 (첫 사용 시 정상입니다)
if (!file_exists($file)) {
    echo 'null';
    exit;
}

echo file_get_contents($file);
