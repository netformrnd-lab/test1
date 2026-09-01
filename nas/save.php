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

    // 저장될 이름 => 저장소에서의 경로 => 정상 여부를 판단할 문구
    $TARGETS = [
        'brand.html' => ['brand.html',     '</html>'],
        'load.php'   => ['nas/load.php',   '<?php'],
        'files.php'  => ['nas/files.php',  '<?php'],
        'deploy.sh'  => ['nas/deploy.sh',  'update_file'],
    ];

    $fetch = function ($url) {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT        => 30,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return ($body !== false && $code === 200) ? $body : false;
        }
        return @file_get_contents($url);
    };

    $result = [];
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

    echo json_encode([
        'ok'     => !in_array(false, array_map(fn($v) => strpos($v, '실패') === false, $result), true),
        'mode'   => 'bootstrap',
        '결과'   => $result,
        '다음'   => '브랜드 허브 화면에서 Ctrl+F5 로 새로고침하세요',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
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
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => '전달된 데이터가 없습니다'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($raw, true);
if ($data === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => '데이터 형식이 올바르지 않습니다'], JSON_UNESCAPED_UNICODE);
    exit;
}

$dir = __DIR__ . '/data';
if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
    http_response_code(500);
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
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' =>
        "파일을 열 수 없습니다: $file / data폴더 쓰기가능="
        . (is_writable($dir) ? '예' : '아니오')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(500);
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
