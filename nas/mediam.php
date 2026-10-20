<?php
/* 🪄 팀허브를 그대로 불러주되, 「할 일」 버튼만 우리로 보내는 한 줄을
   <<저절로 끼워>> 넣습니다. mediam_TeamHub.html 은 한 글자도 안 건드립니다.

   미디어마케팅팀은 주소만 이걸로 쓰면 됩니다 —
     …/brand/mediam.php          (할 일 · 캘린더 · 다 들어감)
   「할 일」 을 누르면 우리 브랜드허브 할 일 화면으로, 나머지는 팀허브 그대로.

   파일을 손으로 고칠 필요가 없습니다 (File Station 에 편집기가 없어도 됩니다). */

$FILE = __DIR__ . '/mediam_TeamHub.html';
/* 훅 파일이 바뀌면 주소도 바뀌게 — 브라우저가 옛 훅을 안 쓰게 (캐시 깨기) */
$HV = @filemtime(__DIR__ . '/th-hook.js') ?: time();
$HOOK = "\n<script src=\"th-hook.js?v=" . $HV . "\"></script>\n";

if (!is_file($FILE)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "mediam_TeamHub.html 이 없습니다 — 같은 폴더(web/brand)에 올려 주세요.";
    exit;
}

$mt  = @filemtime($FILE);
$sz  = @filesize($FILE);
/* 끼워 넣는 한 줄까지 지문에 넣습니다 — 그 줄이 바뀌면 새로 받게 */
$etag = '"m' . $mt . '-' . $sz . '-' . $HV . '"';

/* 안 바뀌었으면 304 한 줄만 (25MB 를 매번 받지 않게) */
$inm = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
if ($inm !== '' && $inm === $etag) {
    header('ETag: ' . $etag);
    http_response_code(304);
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mt) . ' GMT');
header('Cache-Control: no-cache, must-revalidate, max-age=0');
header('Content-Length: ' . ($sz + strlen($HOOK)));

while (ob_get_level()) { ob_end_clean(); }

/* 팀허브를 그대로 흘려보내고 */
$fp = @fopen($FILE, 'rb');
if ($fp) {
    while (!feof($fp)) {
        $buf = fread($fp, 1 << 20);   /* 1MB 씩 */
        if ($buf === false) break;
        echo $buf;
    }
    fclose($fp);
}
/* 맨 끝에 한 줄 끼워 넣습니다 (</html> 뒤라도 브라우저가 실행합니다) */
echo $HOOK;
