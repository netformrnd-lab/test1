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

/** 인터넷에서 파일 하나를 받아옵니다. NAS 마다 막힌 방법이 달라 세 가지를 차례로 시도합니다. */
function bh_fetch($url, &$why = null) {
    if (!is_array($why)) $why = [];
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
}


/** GitHub 에 올라가 있는 원본 위치입니다. */
function bh_base() {
    return 'https://raw.githubusercontent.com/netformrnd-lab/test1'
         . '/refs/heads/claude/ja-brand-dashboard-nas-4lvyrk';
}

/**
 * 새 판이 나왔는지 알려줍니다. (save.php?action=version)
 * 지금 NAS 에 있는 brand.html 의 판 번호와, GitHub 에 있는 판 번호를 비교합니다.
 * GitHub 을 매번 부르면 느리니 10분 동안은 앞서 확인한 값을 다시 씁니다. force=1 이면 바로 다시 봅니다.
 */
if (isset($_GET['action']) && $_GET['action'] === 'version') {
    $ver = function ($text) {
        return (is_string($text) && preg_match(
            "/APP_VER\\s*=\\s*['\"]([^'\"]{1,40})['\"]/", $text, $m)) ? $m[1] : '';
    };

    $local = '';
    $lp = __DIR__ . '/brand.html';
    if (is_file($lp)) {
        $fp = @fopen($lp, 'rb');
        if ($fp) {                       // 판 번호는 앞부분에 있어서 조금만 읽으면 됩니다
            $local = $ver(fread($fp, 200000));
            fclose($fp);
        }
    }

    $cacheFile = __DIR__ . '/data/version-check.json';
    $force = isset($_GET['force']);
    $remote = ''; $when = 0;
    if (!$force && is_file($cacheFile)) {
        $c = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($c) && isset($c['최신'], $c['확인시각'])
            && (time() - (int)$c['확인시각']) < 600) {
            $remote = (string)$c['최신'];
            $when   = (int)$c['확인시각'];
        }
    }
    if ($remote === '') {
        $why = [];
        $body = bh_fetch(bh_base() . '/brand.html', $why);
        $remote = $ver($body);
        if ($remote !== '') {
            $when = time();
            @mkdir(__DIR__ . '/data', 0775, true);
            @file_put_contents($cacheFile,
                json_encode(['최신' => $remote, '확인시각' => $when], JSON_UNESCAPED_UNICODE));
        }
    }

    echo json_encode([
        'ok'        => true,
        'mode'      => 'version',
        '지금'      => $local ?: '(알 수 없음)',
        '최신'      => $remote ?: '(확인 못함)',
        '새판있음'  => ($local !== '' && $remote !== '' && $local !== $remote),
        '확인시각'  => $when ? date('c', $when) : null,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * 복구 모드: 브라우저에서 save.php?action=bootstrap 으로 열면
 * 빠졌거나 오래된 파일들을 GitHub에서 직접 받아옵니다.
 *
 * 파일을 손으로 옮기지 않아도 되게 하려고 만들었습니다.
 * 받아올 파일 목록이 manifest.txt 로 정해져 있어, 다른 파일은 건드리지 않습니다.
 */
if (isset($_GET['action']) && $_GET['action'] === 'bootstrap') {
    $BASE = bh_base();

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
        'doctext.php'   => ['nas/doctext.php','<?php'],
        'channels.php'  => ['nas/channels.php','<?php'],
        'presence.php'  => ['nas/presence.php','<?php'],
        'scan.sh'       => ['nas/scan.sh','ROOT='],
        'feeds.sh'      => ['nas/feeds.sh','URL='],
        'config.sample.php' => ['nas/config.sample.php','<?php'],
    ];

    // 내려받는 방법을 세 가지 순서로 시도합니다.
    // NAS 설정에 따라 어떤 방법은 막혀 있을 수 있어서입니다.
    $why = [];

    $result = [];
    // 목록 파일을 먼저 받아봅니다. 실패하면 위 기본 목록을 그대로 씁니다.
    $mf = bh_fetch($BASE . '/nas/manifest.txt', $why);
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
        $body = bh_fetch($BASE . '/' . $remote, $why);
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

/**
 * 여러 명이 같이 쓰기 때문에 두 가지를 지킵니다.
 *
 * 1) 덮어쓰기 방지
 *    불러올 때 받은 판 번호(_rev)를 같이 보내주면, 그 사이에 다른 사람이
 *    저장했는지 확인합니다. 바뀌었으면 저장하지 않고 서버에 있는 내용을
 *    돌려줍니다. 화면에서 내 것과 합친 뒤 다시 저장합니다.
 *
 * 2) 반쯤 쓰인 파일이 읽히지 않게
 *    옆에 임시 파일로 다 쓴 다음 이름만 바꿔치기합니다(rename).
 *    그래서 읽는 쪽은 언제나 '이전 것' 아니면 '새 것' 중 하나만 봅니다.
 */
$lockFile = $dir . '/save.lock';
$lk = @fopen($lockFile, 'c');
if ($lk) { flock($lk, LOCK_EX); }          // 저장은 한 번에 한 명씩

$curRev = 0;
if (file_exists($file)) {
    $cur = json_decode((string)@file_get_contents($file), true);
    if (is_array($cur) && isset($cur['_rev'])) $curRev = (int)$cur['_rev'];
}

// 화면에서 보내온 '내가 불러올 때의 판 번호'
$baseRev = isset($data['_baseRev']) ? (int)$data['_baseRev'] : null;
unset($data['_baseRev']);

if ($baseRev !== null && $baseRev !== $curRev) {
    if ($lk) { flock($lk, LOCK_UN); fclose($lk); }
    echo json_encode([
        'ok'       => false,
        'conflict' => true,
        'rev'      => $curRev,
        'error'    => '그 사이에 다른 사람이 저장했습니다',
        'data'     => file_exists($file)
                        ? json_decode((string)@file_get_contents($file), true) : null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 하루 1회 백업
$backup = $dir . '/backup-' . date('Y-m-d') . '.json';
if (file_exists($file) && !file_exists($backup)) {
    @copy($file, $backup);
}

$data['_rev'] = $curRev + 1;
$json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($json === false) {
    if ($lk) { flock($lk, LOCK_UN); fclose($lk); }
    http_response_code(200);
    echo json_encode(['ok' => false, 'error' => '데이터를 저장 형식으로 바꾸지 못했습니다'],
        JSON_UNESCAPED_UNICODE);
    exit;
}

// 임시 파일에 다 쓴 다음 이름만 바꿉니다 (읽는 쪽이 반쪽짜리를 보지 않게)
$tmp = $file . '.tmp' . getmypid();
$wrote = @file_put_contents($tmp, $json);
if ($wrote === false || $wrote !== strlen($json) || !@rename($tmp, $file)) {
    @unlink($tmp);
    if ($lk) { flock($lk, LOCK_UN); fclose($lk); }
    http_response_code(200);
    echo json_encode(['ok' => false, 'error' =>
        "파일을 저장하지 못했습니다: $file / data폴더 쓰기가능="
        . (is_writable($dir) ? '예' : '아니오')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
@chmod($file, 0664);

// 판 번호만 따로 작은 파일에 적어둡니다.
// 다른 사람 화면이 "바뀐 게 있나?" 를 물을 때 이 파일만 읽으면 되어서
// 큰 데이터를 매번 읽지 않아도 됩니다.
$rev = $dir . '/rev.txt';
$rt  = $rev . '.tmp' . getmypid();
if (@file_put_contents($rt, $data['_rev'] . "\t" . date('c') . "\t"
        . (isset($data['_lastBy']) ? (string)$data['_lastBy'] : '')) !== false) {
    @rename($rt, $rev);
    @chmod($rev, 0664);
} else {
    @unlink($rt);
}

if ($lk) { flock($lk, LOCK_UN); fclose($lk); }

echo json_encode(['ok' => true, 'savedAt' => date('c'), 'rev' => $data['_rev']]);
