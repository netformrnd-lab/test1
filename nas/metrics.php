<?php
/**
 * 브랜드 허브 - 외부 수치 가져오기
 *
 * 브라우저는 다른 사이트의 데이터를 직접 가져올 수 없지만(보안 정책),
 * NAS는 가능합니다. 이 파일이 NAS에서 대신 가져오는 역할을 합니다.
 *
 * 현재 지원
 *   ?action=probe&url=...   대상 페이지가 어떤 구조인지 살펴봅니다 (설정 단계용)
 *
 * ⚠️ 이 파일은 지정한 주소를 서버가 대신 열어봅니다.
 *    사내망에서만 접근되도록 두시고, 외부에 공개하지 마세요.
 */

header('Content-Type: application/json; charset=utf-8');

function jout($arr, $code = 200) {
    // 웹 스테이션이 200 이 아닌 응답의 내용을 자기 오류 페이지로 바꿔치기 하므로,
    // 항상 200 으로 보내고 실패 여부는 JSON 안의 ok 로만 알립니다.
    http_response_code(200);
    if ($code !== 200 && is_array($arr) && !isset($arr['status'])) $arr['status'] = $code;
    echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/** curl → file_get_contents → wget 순으로 시도합니다 */
function fetch_url($url, &$info) {
    $info = ['방법' => null, '상태' => null];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_USERAGENT      => 'BrandHub/1.0',
        ]);
        $body = curl_exec($ch);
        $info['상태'] = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $info['형식'] = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body !== false) { $info['방법'] = 'curl'; return $body; }
        $info['오류'] = $err;
    }

    if (ini_get('allow_url_fopen')) {
        $body = @file_get_contents($url);
        if ($body !== false) { $info['방법'] = 'file_get_contents'; $info['상태'] = 200; return $body; }
    }

    if (function_exists('shell_exec')) {
        $body = @shell_exec('wget -q -T 30 -O - ' . escapeshellarg($url) . ' 2>/dev/null');
        if ($body !== null && $body !== '') { $info['방법'] = 'wget'; $info['상태'] = 200; return $body; }
    }

    return false;
}

$action = $_GET['action'] ?? '';

/* ---------------- 구조 살펴보기 ---------------- */
if ($action === 'probe') {
    $url = trim($_GET['url'] ?? '');
    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        jout(['ok' => false, 'error' => 'http:// 또는 https:// 로 시작하는 주소를 넣어주세요'], 400);
    }

    $body = fetch_url($url, $info);
    if ($body === false) {
        jout(['ok' => false, 'error' => '페이지를 가져오지 못했습니다', '시도' => $info], 502);
    }

    // 데이터를 어디서 가져오는지 단서를 찾습니다
    preg_match_all('#<script[^>]+src=["\']([^"\']+)["\']#i', $body, $m1);
    preg_match_all('#["\']([^"\']*\.json[^"\']*)["\']#i', $body, $m2);
    preg_match_all('#fetch\s*\(\s*["\']([^"\']+)["\']#i', $body, $m3);

    // 화면에 보이는 글자만 추려냅니다
    $text = preg_replace('#<script\b[^>]*>.*?</script>#is', ' ', $body);
    $text = preg_replace('#<style\b[^>]*>.*?</style>#is', ' ', $text);
    $text = trim(preg_replace('/\s+/u', ' ', strip_tags($text)));

    // 데이터를 어디에 두는 구조인지 단서가 되는 단어들을 세어봅니다
    $keywords = ['localStorage','sessionStorage','indexedDB','supabase','firebase',
                 'api.','/api','.json','fetch(','XMLHttpRequest'];
    $found = [];
    foreach ($keywords as $k) {
        $c = substr_count($body, $k);
        if ($c > 0) $found[$k] = $c . '회';
    }

    // 찾고 싶은 단어를 직접 지정할 수도 있습니다 (&find=단어)
    $findResult = null;
    $find = trim($_GET['find'] ?? '');
    if ($find !== '') {
        $pos = stripos($body, $find);
        $findResult = $pos === false
            ? '없음'
            : ('있음 (' . substr_count(strtolower($body), strtolower($find)) . '회) · 주변: '
               . mb_substr(preg_replace('/\s+/u', ' ',
                   substr($body, max(0, $pos - 120), 320)), 0, 300, 'UTF-8'));
    }

    jout([
        'ok'          => true,
        '가져온방법'  => $info['방법'],
        '데이터단서'  => $found ?: '단서 없음',
        '찾은단어'    => $findResult,
        'HTTP상태'    => $info['상태'],
        '형식'        => $info['형식'] ?? '',
        '전체크기'    => strlen($body) . ' bytes',
        '표(table)'   => substr_count(strtolower($body), '<table') . '개',
        '캔버스(그래프)' => substr_count(strtolower($body), '<canvas') . '개',
        '외부스크립트' => array_slice(array_unique($m1[1] ?? []), 0, 15),
        'json경로'    => array_slice(array_unique($m2[1] ?? []), 0, 15),
        'fetch호출'   => array_slice(array_unique($m3[1] ?? []), 0, 15),
        '화면글자'    => mb_substr($text, 0, 2500, 'UTF-8'),
    ]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다. ?action=probe&url=... 형태로 열어주세요'], 400);
