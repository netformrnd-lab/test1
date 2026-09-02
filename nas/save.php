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

/**
 * 복구 모드: 브라우저에서 save.php?action=bootstrap 으로 열면
 * 빠졌거나 오래된 파일들을 GitHub에서 직접 받아옵니다.
 *
 * 파일을 손으로 옮기지 않아도 되게 하려고 만들었습니다.
 * 받아올 파일 목록이 아래에 고정되어 있어, 다른 파일은 건드리지 않습니다.
 */
if (isset($_GET['action']) && $_GET['action'] === 'bootstrap') {
    $BASE = 'https://raw.githubusercontent.com/netformrnd-lab/test1'
          . '/refs/heads/claude/ja-brand-dashboard-nas-4lvyrk';

    // 받아올 파일 목록입니다.
    // manifest.txt 를 먼저 읽어오기 때문에, 새 파일이 생겨도
    // 이 파일(save.php)을 고치지 않고 목록만 바꾸면 됩니다.
    // 목록을 못 받아오면 아래 기본 목록을 씁니다.
    $TARGETS = [
        'brand.html' => ['brand.html',     '</html>'],
        'load.php'   => ['nas/load.php',   '<?php'],
        'save.php'   => ['nas/save.php',   '<?php'],
        'files.php'  => ['nas/files.php',  '<?php'],
        'deploy.sh'  => ['nas/deploy.sh',  'update_file'],
        'metrics.php'=> ['nas/metrics.php','<?php'],
        'inquiries.php' => ['nas/inquiries.php','<?php'],
        'nasfiles.php'  => ['nas/nasfiles.php','<?php'],
        'nasscan.php'   => ['nas/nasscan.php','<?php'],
        'scan.sh'       => ['nas/scan.sh','ROOT='],
        'config.sample.php' => ['nas/config.sample.php','<?php'],
    ];

    // 내려받는 방법을 세 가지 순서로 시도합니다.
    // NAS 설정에 따라 어떤 방법은 막혀 있을 수 있어서입니다.
    $why = [];
    $fetch = function ($url) use (&$why) {
        // 1) curl 확장
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT        => 30,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err  = curl_error($ch);
            curl_close($ch);
            if ($body !== false && $code === 200) return $body;
            $why['curl'] = $err !== '' ? $err : ('HTTP ' . $code);
        } else {
            $why['curl'] = 'curl 확장이 꺼져 있음';
        }

        // 2) PHP 내장 (allow_url_fopen 이 켜져 있어야 합니다)
        if (ini_get('allow_url_fopen')) {
            $body = @file_get_contents($url);
            if ($body !== false && $body !== '') return $body;
            $why['file_get_contents'] = '내려받기 실패';
        } else {
            $why['file_get_contents'] = 'allow_url_fopen 이 꺼져 있음';
        }

        // 3) wget — deploy.sh 가 쓰는 방식이라 NAS에서 가장 확실합니다
        if (function_exists('shell_exec')) {
            $body = @shell_exec('wget -q -T 30 -O - ' . escapeshellarg($url) . ' 2>/dev/null');
            if ($body !== null && $body !== '') return $body;
            $why['wget'] = '실행했지만 내용을 받지 못함';
        } else {
            $why['wget'] = 'shell_exec 이 막혀 있음';
        }

        return false;
    };

    $result = [];
    // 목록 파일을 먼저 받아봅니다. 실패하면 위 기본 목록을 그대로 씁니다.
    $mf = $fetch($BASE . '/nas/manifest.txt');
    if (is_string($mf) && strpos($mf, "\t") !== false) {
        $parsed = [];
        foreach (preg_split('/\r?\n/', $mf) as $line) {
            if ($line === '' || $line[0] === '#') continue;
            $c = explode("\t", $line);
            if (count($c) < 3) continue;
            $name = trim($c[0]);
            if ($name === '' || strpbrk($name, "/\\") !== false) continue;   // 폴더 이동 금지
            $parsed[$name] = [trim($c[1]), trim($c[2])];
        }
        if (count($parsed) >= 5) $TARGETS = $parsed;
    }

    foreach ($TARGETS as $name => [$remote, $marker]) {
        $body = $fetch($BASE . '/' . $remote);
        if ($body === false || $body === '' || strpos($body, $marker) === false) {
            $result[$name] = '실패 — 내려받지 못했거나 내용이 올바르지 않습니다';
            continue;
        }
        $path = __DIR__ . '/' . $name;
        if (file_exists($path) && file_get_contents($path) === $body) {
            $result[$name] = '이미 최신';
            continue;
        }
        $result[$name] = (file_put_contents($path, $body) !== false)
            ? '설치 완료'
            : '실패 — 파일을 쓸 수 없습니다 (폴더 권한 확인 필요)';
    }

    $ok = !in_array(false, array_map(fn($v) => strpos($v, '실패') === false, $result), true);

    $out = ['ok' => $ok, 'mode' => 'bootstrap', '결과' => $result];
    if (!$ok) {
        $out['실패원인'] = $why;
        $out['해결방법'] = 'Web Station → 스크립트 언어 설정 → PHP → Default Profile → 편집 '
                        . '→ 「확장」 탭에서 curl 을 켜고 저장하세요';
    }
    $out['다음'] = $ok ? '브랜드 허브 화면에서 Ctrl+F5 로 새로고침하세요' : '위 해결방법을 적용한 뒤 다시 열어주세요';

    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// 진단 모드: 브라우저에서 save.php?check=1 로 열면 현재 상태를 보여줍니다.
if (isset($_GET['check'])) {
    $dir = __DIR__ . '/data';
    echo json_encode([
        'ok'                => true,
        'mode'              => 'check',
        'php_버전'          => PHP_VERSION,
        'php_실행계정'      => function_exists('posix_geteuid')
                                 ? (posix_getpwuid(posix_geteuid())['name'] ?? '알수없음')
                                 : '알수없음',
        '현재폴더'          => __DIR__,
        '현재폴더_쓰기가능' => is_writable(__DIR__) ? '예' : '아니오',
        'data폴더_존재'     => is_dir($dir) ? '예' : '아니오',
        'data폴더_쓰기가능' => is_dir($dir) ? (is_writable($dir) ? '예' : '아니오') : '(폴더없음)',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(200);   // 오류도 200 으로 (웹 스테이션이 내용을 바꿔치기 함)
    echo json_encode(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(200);   // 오류도 200 으로 (웹 스테이션이 내용을 바꿔치기 함)
    echo json_encode(['ok' => false, 'error' => '전달된 데이터가 없습니다'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($raw, true);
if ($data === null) {
    http_response_code(200);   // 오류도 200 으로 (웹 스테이션이 내용을 바꿔치기 함)
    echo json_encode(['ok' => false, 'error' => '데이터 형식이 올바르지 않습니다'], JSON_UNESCAPED_UNICODE);
    exit;
}

$dir = __DIR__ . '/data';
if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
    http_response_code(200);   // 오류도 200 으로 (웹 스테이션이 내용을 바꿔치기 함)
    echo json_encode(['ok' => false, 'error' =>
        "data 폴더를 만들 수 없습니다: $dir / 상위폴더 쓰기가능="
        . (is_writable(__DIR__) ? '예' : '아니오')
        . ' / PHP실행계정=' . (function_exists('posix_geteuid')
              ? (posix_getpwuid(posix_geteuid())['name'] ?? '?') : '?')
    ], JSON_UNESCAPED_UNICODE);
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
    http_response_code(200);   // 오류도 200 으로 (웹 스테이션이 내용을 바꿔치기 함)
    echo json_encode(['ok' => false, 'error' =>
        "파일을 열 수 없습니다: $file / data폴더 쓰기가능="
        . (is_writable($dir) ? '예' : '아니오')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(200);   // 오류도 200 으로 (웹 스테이션이 내용을 바꿔치기 함)
    echo json_encode(['ok' => false, 'error' => '다른 사람이 저장 중입니다. 잠시 후 다시 시도해 주세요'], JSON_UNESCAPED_UNICODE);
    exit;
}

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['ok' => true, 'savedAt' => date('c')]);
