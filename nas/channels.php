<?php
/**
 * 브랜드 채널 (블로그·카페·유튜브 등)
 *
 * 채널 주소를 넣으면 RSS 주소를 찾아내고, 최근 올린 글을 가져옵니다.
 * 대시보드는 사무실 안에서만 열리지만, NAS 는 인터넷에 나갈 수 있어서
 * 가져오는 일은 NAS 가 대신합니다.
 *
 *   ?action=probe&url=...      채널 주소에서 RSS 주소 찾기
 *   ?action=feed&url=...&n=6   최근 글 가져오기
 *   ?action=check              상태 확인
 */

header('Content-Type: application/json; charset=utf-8');
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
ob_start();
register_shutdown_function(function () {
    $e = error_get_last();
    $fatal = $e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
    if (!ob_get_level()) return;
    if ($fatal) {
        ob_end_clean();
        if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '서버 오류: ' . $e['message']], JSON_UNESCAPED_UNICODE);
    } else { ob_end_flush(); }
});

$CACHE_DIR = __DIR__ . '/data/feedcache';
$CACHE_TTL = 1800;          // 30분

function jout($a, $code = 200) {
    http_response_code(200);
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

/* 인터넷에서 내려받습니다. NAS 설정에 따라 막힌 방법이 있어 세 가지를 차례로 씁니다. */
function fetch_url($url, &$why = null) {
    $why = [];
    if (!preg_match('#^https?://#i', $url)) { $why[] = 'http/https 주소가 아닙니다'; return false; }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; BrandHub/1.0)',
        ]);
        $b = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        if ($b !== false && $code >= 200 && $code < 400) return $b;
        $why[] = 'curl: ' . ($err ?: ('HTTP ' . $code));
    } else { $why[] = 'curl 확장이 꺼져 있습니다'; }

    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(['http' => [
            'timeout' => 20, 'follow_location' => 1, 'max_redirects' => 5,
            'header' => "User-Agent: Mozilla/5.0 (compatible; BrandHub/1.0)\r\n",
        ]]);
        $b = @file_get_contents($url, false, $ctx);
        if ($b !== false) return $b;
        $why[] = 'file_get_contents 실패';
    } else { $why[] = 'allow_url_fopen 이 꺼져 있습니다'; }

    // wget — 인증서가 오래된 NAS 를 위해 한 번 더 시도합니다
    $ua = 'Mozilla/5.0 (compatible; BrandHub/1.0)';
    foreach ([['', 'wget'], ['--no-check-certificate ', 'wget(인증서 검사 생략)']] as $v) {
        $tmp = tempnam(sys_get_temp_dir(), 'feed');
        $o = [];
        @exec('wget -q -T 20 ' . $v[0] . '-U ' . escapeshellarg($ua)
            . ' -O ' . escapeshellarg($tmp) . ' ' . escapeshellarg($url) . ' 2>&1', $o, $rc);
        if ($rc === 0 && is_file($tmp) && filesize($tmp) > 0) {
            $b = file_get_contents($tmp); @unlink($tmp);
            return $b;
        }
        @unlink($tmp);
        $why[] = $v[1] . ': 코드 ' . $rc . ($o ? ' — ' . implode(' ', array_slice($o, 0, 2)) : '');
    }
    return false;
}

/* 채널 주소에서 RSS 주소를 찾아냅니다 */
function guess_feed($url) {
    $u = trim($url);
    if (!preg_match('#^https?://#i', $u)) $u = 'https://' . ltrim($u, '/');
    $host = strtolower(parse_url($u, PHP_URL_HOST) ?: '');
    $path = parse_url($u, PHP_URL_PATH) ?: '';
    $q    = parse_url($u, PHP_URL_QUERY) ?: '';

    // 네이버 블로그 — blog.naver.com/아이디
    if (strpos($host, 'blog.naver.com') !== false) {
        $id = trim(explode('/', trim($path, '/'))[0] ?? '');
        if ($id === '' && preg_match('/blogId=([A-Za-z0-9_-]+)/', $q, $m)) $id = $m[1];
        if ($id !== '') return ['kind' => '네이버 블로그', 'feed' => 'https://rss.blog.naver.com/' . $id . '.xml'];
    }
    // 유튜브 — 채널 ID 가 있으면 바로, @핸들이면 페이지에서 찾습니다
    if (strpos($host, 'youtube.com') !== false || strpos($host, 'youtu.be') !== false) {
        if (preg_match('#/channel/(UC[\w-]+)#', $path, $m)) {
            return ['kind' => '유튜브', 'feed' => 'https://www.youtube.com/feeds/videos.xml?channel_id=' . $m[1]];
        }
        $html = fetch_url($u);
        if ($html !== false && preg_match('#"(?:channelId|externalId)"\s*:\s*"(UC[\w-]+)"#', $html, $m)) {
            return ['kind' => '유튜브', 'feed' => 'https://www.youtube.com/feeds/videos.xml?channel_id=' . $m[1]];
        }
        return ['kind' => '유튜브', 'feed' => null];
    }
    // 티스토리·워드프레스·브런치 등 흔한 규칙
    $base = rtrim($u, '/');
    $tries = [];
    if (strpos($host, 'tistory.com') !== false) $tries[] = $base . '/rss';
    if (strpos($host, 'brunch.co.kr') !== false) $tries[] = $base . '/rss';
    $tries[] = $base . '/rss';
    $tries[] = $base . '/feed';
    $tries[] = $base . '/rss.xml';
    $tries[] = $base . '/feed.xml';

    // 페이지 안에 적힌 RSS 주소를 먼저 봅니다
    $html = fetch_url($u);
    if ($html !== false && preg_match(
        '#<link[^>]+type=["\']application/(?:rss|atom)\+xml["\'][^>]*href=["\']([^"\']+)["\']#i', $html, $m)) {
        $href = html_entity_decode($m[1]);
        if (strpos($href, 'http') !== 0) {
            $sch  = parse_url($u, PHP_URL_SCHEME) ?: 'https';
            $port = parse_url($u, PHP_URL_PORT);
            $auth = $host . ($port ? ':' . $port : '');
            $href = $href[0] === '/' ? $sch . '://' . $auth . $href : $base . '/' . $href;
        }
        return ['kind' => guess_kind($host), 'feed' => $href];
    }
    foreach ($tries as $t) {
        $b = fetch_url($t);
        if ($b !== false && preg_match('#<(rss|feed)[\s>]#i', $b)) {
            return ['kind' => guess_kind($host), 'feed' => $t];
        }
    }
    return ['kind' => guess_kind($host), 'feed' => null];
}

function guess_kind($host) {
    if (strpos($host, 'cafe.naver') !== false) return '네이버 카페';
    if (strpos($host, 'blog.naver') !== false) return '네이버 블로그';
    if (strpos($host, 'youtube') !== false)    return '유튜브';
    if (strpos($host, 'instagram') !== false)  return '인스타그램';
    if (strpos($host, 'tistory') !== false)    return '티스토리';
    if (strpos($host, 'brunch') !== false)     return '브런치';
    if (strpos($host, 'facebook') !== false)   return '페이스북';
    return '웹사이트';
}

/* RSS / Atom 을 읽어 최근 글을 뽑습니다 */
function parse_feed($xml, $n) {
    $prev = libxml_use_internal_errors(true);
    $x = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NOENT);
    libxml_use_internal_errors($prev);
    if (!$x) return null;

    $items = [];
    $title = '';

    if (isset($x->channel)) {                       // RSS 2.0
        $title = trim((string)$x->channel->title);
        foreach ($x->channel->item as $it) {
            $items[] = [
                'title' => trim((string)$it->title),
                'link'  => trim((string)$it->link),
                'date'  => trim((string)$it->pubDate),
            ];
            if (count($items) >= $n) break;
        }
    } elseif (isset($x->entry)) {                   // Atom (유튜브 등)
        $title = trim((string)$x->title);
        foreach ($x->entry as $it) {
            $link = '';
            foreach ($it->link as $l) {
                $a = $l->attributes();
                if ((string)($a['rel'] ?? 'alternate') === 'alternate') { $link = (string)$a['href']; break; }
            }
            $items[] = [
                'title' => trim((string)$it->title),
                'link'  => $link,
                'date'  => trim((string)($it->published ?: $it->updated)),
            ];
            if (count($items) >= $n) break;
        }
    } else return null;

    foreach ($items as &$it) {
        // 앞의 요일(Mon, Tue …)은 떼고 읽습니다.
        // 요일이 실제 날짜와 어긋난 RSS 가 있는데, 그대로 두면 날짜가 밀립니다.
        $d  = preg_replace('/^\s*[A-Za-z]{3},\s*/', '', $it['date']);
        $ts = strtotime($d);
        if (!$ts) $ts = strtotime($it['date']);
        $it['iso'] = $ts ? date('c', $ts) : null;
    }
    unset($it);
    return ['title' => $title, 'items' => $items];
}

$action = $_GET['action'] ?? '';

if ($action === 'check') {
    $why = [];
    $ok = fetch_url('https://www.google.com/generate_204', $why) !== false;
    jout(['ok' => true, '인터넷' => $ok ? '나갈 수 있습니다' : '막혀 있습니다',
          '시도내역' => $why,
          'curl' => function_exists('curl_init') ? '있음' : '없음',
          'allow_url_fopen' => ini_get('allow_url_fopen') ? '켜짐' : '꺼짐',
          'simplexml' => function_exists('simplexml_load_string') ? '있음' : '없음']);
}

/* 특정 주소에 닿는지 하나씩 확인합니다 */
if ($action === 'test') {
    $url = trim($_GET['url'] ?? 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBR8-60-B28hp2BmDPdntcQ');
    $why = [];
    $b = fetch_url($url, $why);
    jout([
        'ok'       => true,
        '주소'     => $url,
        '받았나'   => $b === false ? '아니오' : ('예 (' . strlen($b) . ' 바이트)'),
        '앞부분'   => $b === false ? '' : substr(preg_replace('/\s+/', ' ', $b), 0, 200),
        '시도내역' => $why,
        'curl'     => function_exists('curl_init') ? '있음' : '없음',
        'allow_url_fopen' => ini_get('allow_url_fopen') ? '켜짐' : '꺼짐',
        'wget'     => trim(@shell_exec('command -v wget 2>/dev/null') ?: '') ?: '없음',
    ]);
}

if ($action === 'probe') {
    $url = trim($_GET['url'] ?? '');
    if ($url === '') jout(['ok' => false, 'error' => '채널 주소를 넣어주세요'], 400);
    $g = guess_feed($url);
    if (!$g['feed']) {
        jout(['ok' => true, 'kind' => $g['kind'], 'feed' => null,
              '안내' => '이 채널은 최근 글을 가져올 수 없습니다. 주소만 저장해 바로가기로 쓰시면 됩니다.']);
    }
    $body = fetch_url($g['feed'], $why);
    if ($body === false) {
        jout(['ok' => true, 'kind' => $g['kind'], 'feed' => $g['feed'], '읽기' => '실패',
              '시도내역' => $why,
              '안내' => 'RSS 주소는 찾았는데 지금은 읽지 못했습니다. 주소만 저장해 두셔도 됩니다.']);
    }
    $p = parse_feed($body, 3);
    jout(['ok' => true, 'kind' => $g['kind'], 'feed' => $g['feed'],
          '채널이름' => $p['title'] ?? '', '미리보기' => $p['items'] ?? []]);
}

if ($action === 'feed') {
    $feed = trim($_GET['url'] ?? '');
    $n    = min(max((int)($_GET['n'] ?? 6), 1), 20);
    if ($feed === '') jout(['ok' => false, 'error' => 'RSS 주소가 없습니다'], 400);

    if (!is_dir($CACHE_DIR)) @mkdir($CACHE_DIR, 0775, true);
    $cf = $CACHE_DIR . '/' . md5($feed) . '.json';
    if (!isset($_GET['fresh']) && is_file($cf) && (time() - filemtime($cf)) < $CACHE_TTL) {
        $c = json_decode(file_get_contents($cf), true);
        if (is_array($c)) { $c['캐시'] = '예'; jout($c); }
    }

    $body = fetch_url($feed, $why);
    if ($body === false) {
        if (is_file($cf)) {                        // 실패하면 예전 것이라도 보여줍니다
            $c = json_decode(file_get_contents($cf), true);
            if (is_array($c)) { $c['캐시'] = '예 (새로 못 받음)'; jout($c); }
        }
        jout(['ok' => false,
              'error' => "채널을 읽지 못했습니다.\n\n"
                . "NAS 가 이 주소에 닿지 못했습니다:\n" . $feed . "\n\n"
                . "시도한 방법:\n \xc2\xb7 " . implode("\n \xc2\xb7 ", $why),
              '시도내역' => $why, 'feed' => $feed], 502);
    }
    $p = parse_feed($body, $n);
    if (!$p) jout(['ok' => false, 'error' => 'RSS 형식이 아닙니다'], 422);

    $out = ['ok' => true, 'title' => $p['title'], 'items' => $p['items'],
            '받은시각' => date('c'), '캐시' => '아니오'];
    @file_put_contents($cf, json_encode($out, JSON_UNESCAPED_UNICODE));
    jout($out);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다: ' . $action], 400);
