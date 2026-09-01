<?php
/**
 * AI 기능 설정 파일 (예시)
 *
 * 사용법
 *  1) 이 파일을 같은 폴더에 config.php 라는 이름으로 복사하세요
 *  2) 아래 API 키를 실제 키로 바꾸세요
 *
 * ⚠️ config.php 는 자동 업데이트 대상이 아니므로 덮어써지지 않습니다.
 * ⚠️ API 키는 절대 다른 사람과 공유하지 마세요. 키가 있으면 요금이 청구됩니다.
 *
 * 키 발급: https://console.anthropic.com  →  API Keys
 */

return [
    // 발급받은 키를 여기에 붙여넣으세요 (sk-ant- 로 시작합니다)
    'api_key' => 'sk-ant-여기에-키를-붙여넣으세요',

    // 사용할 모델. 그대로 두시면 됩니다.
    'model' => 'claude-opus-5',

    // 한 번 호출에 쓸 최대 출력 길이
    'max_tokens' => 8000,
];
