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
 *   ?action=ytcheck&url=...    유튜브가 왜 안 되는지 한 번에 판정
 *   ?action=summary            받아둔 최근 글을 한 번에 (인터넷에 안 나갑니다 — 빠릅니다)
 *   ?action=refreshall         등록된 채널을 전부 새로 받아옵니다 (feeds.sh 가 주기적으로 부릅니다)
 */

// 작업 스케줄러에서 명령줄로도 부를 수 있게 합니다.
//   php channels.php action=refreshall
if (PHP_SAPI === 'cli') {
    parse_str(implode('&', array_slice($argv, 1)), $cliQ);
    $_GET = array_merge($_GET, $cliQ);
}

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

    // wget — 브라우저처럼 보이는 이름으로, 인증서가 오래된 NAS 도 고려해 두 번 시도합니다
    $uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
            . 'Chrome/124.0 Safari/537.36',
        'Mozilla/5.0 (compatible; BrandHub/1.0)',
    ];
    foreach ([['', 'wget'], ['--no-check-certificate ', 'wget(인증서 검사 생략)']] as $v) {
        foreach ($uas as $ui => $ua) {
            $tmp = tempnam(sys_get_temp_dir(), 'feed');
            $o = [];
            // -S 는 서버가 준 상태줄(예: 404 Not Found)을 보여줍니다.
            // -q(조용히) 를 같이 쓰면 그 줄까지 사라지므로 절대 붙이면 안 됩니다.
            @exec('wget -S -T 20 ' . $v[0] . '-U ' . escapeshellarg($ua)
                . ' -O ' . escapeshellarg($tmp) . ' ' . escapeshellarg($url) . ' 2>&1', $o, $rc);
            if ($rc === 0 && is_file($tmp) && filesize($tmp) > 0) {
                $b = file_get_contents($tmp); @unlink($tmp);
                return $b;
            }
            @unlink($tmp);

            // wget 이 상태를 알려주는 방식이 여러 가지라 모두 살펴봅니다
            $status = '';
            foreach ($o as $line) {
                if (preg_match('#HTTP/[\d.]+\s+(\d{3})([^\r\n]*)#', $line, $m)) {
                    $status = 'HTTP ' . $m[1] . ' ' . trim($m[2]);
                } elseif (preg_match('#awaiting response\.\.\.\s*(\d{3})([^\r\n]*)#', $line, $m)) {
                    $status = 'HTTP ' . $m[1] . ' ' . trim($m[2]);
                } elseif (preg_match('#ERROR\s+(\d{3}):([^\r\n]*)#', $line, $m)) {
                    $status = 'HTTP ' . $m[1] . ' ' . trim($m[2], " .\t");
                }
            }
            $status = trim($status);
            $meaning = [4 => '네트워크 오류 (주소를 찾지 못함)', 5 => 'SSL 인증서 오류',
                        8 => '서버가 오류로 답함', 1 => '일반 오류', 3 => '파일 쓰기 오류'];
            $why[] = $v[1] . ($ui ? '·다른 이름' : '') . ': 코드 ' . $rc
                   . ($status ? ' → ' . $status : '')
                   . (isset($meaning[$rc]) ? ' (' . $meaning[$rc] . ')' : '');
            if ($rc !== 0 && $status !== '' && strpos($status, '404') === false) break 1;
        }
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

    // RSS 주소를 그대로 붙여넣은 경우에는 찾을 것 없이 바로 씁니다.
    // (자동으로 못 찾는 채널은 RSS 주소를 직접 넣으면 됩니다)
    if (preg_match('#feeds/videos\.xml#i', $u)
        || preg_match('#(\.xml|/rss|/feed)(\?|$)#i', $u)) {
        return ['kind' => guess_kind($host), 'feed' => $u];
    }

    // 네이버 블로그 — blog.naver.com/아이디
    if (strpos($host, 'blog.naver.com') !== false) {
        $id = trim(explode('/', trim($path, '/'))[0] ?? '');
        if ($id === '' && preg_match('/blogId=([A-Za-z0-9_-]+)/', $q, $m)) $id = $m[1];
        if ($id !== '') return ['kind' => '네이버 블로그', 'feed' => 'https://rss.blog.naver.com/' . $id . '.xml'];
    }
    // 유튜브 — 채널 ID 가 있으면 바로, @핸들이면 페이지에서 찾습니다
    if (strpos($host, 'youtube.com') !== false || strpos($host, 'youtu.be') !== false) {
        $ids = [];
        if (preg_match('#/channel/(UC[\w-]+)#', $path, $m)) $ids[] = $m[1];

        // 채널 페이지에 적힌 값이 가장 확실합니다 (@핸들·사용자명·바뀐 주소 모두 여기서 나옵니다)
        $html = fetch_url($u);
        if ($html !== false) {
            if (preg_match('#<link[^>]+rel=["\']alternate["\'][^>]+href=["\']([^"\']*feeds/videos\.xml[^"\']*)["\']#i',
                    $html, $m)) {
                return ['kind' => '유튜브', 'feed' => html_entity_decode($m[1])];
            }
            if (preg_match('#"(?:channelId|externalId)"\s*:\s*"(UC[\w-]+)"#', $html, $m)) {
                array_unshift($ids, $m[1]);
            }
        }
        foreach (array_unique($ids) as $id) {
            $f = 'https://www.youtube.com/feeds/videos.xml?channel_id=' . $id;
            $b = fetch_url($f);
            if ($b !== false && preg_match('#<(rss|feed)[\s>]#i', $b)) {
                return ['kind' => '유튜브', 'feed' => $f];
            }
        }
        return ['kind' => '유튜브', 'feed' => $ids ? ('https://www.youtube.com/feeds/videos.xml?channel_id=' . $ids[0]) : null];
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

/* 유튜브만 안 될 때, 어디서 막히는지 한 번에 판정합니다 */
if ($action === 'ytcheck') {
    $mine = trim($_GET['url'] ?? '');
    $id   = '';
    if (preg_match('#(UC[\w-]{20,24})#', $mine, $m)) $id = $m[1];

    $tests = [
        ['이름' => '1. 유튜브 접속 자체',
         '주소' => 'https://www.youtube.com/',
         '기대' => '되어야 정상'],
        ['이름' => '2. 유튜브 공식 채널 RSS (반드시 되는 주소)',
         '주소' => 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBR8-60-B28hp2BmDPdntcQ',
         '기대' => '되어야 정상'],
    ];
    if ($mine !== '') $tests[] = ['이름' => '3. 넣으신 채널 페이지', '주소' => $mine, '기대' => '되면 좋음'];
    if ($id !== '')   $tests[] = ['이름' => '4. 넣으신 채널의 RSS',
        '주소' => 'https://www.youtube.com/feeds/videos.xml?channel_id=' . $id, '기대' => '되어야 정상'];

    $res = [];
    foreach ($tests as $t) {
        $why = [];
        $b = fetch_url($t['주소'], $why);
        $t['결과'] = $b === false ? '실패' : ('성공 (' . strlen($b) . ' 바이트)');
        if ($b === false) $t['시도내역'] = $why;
        $res[] = $t;
    }

    // 결과를 보고 사람 말로 정리해 줍니다
    $good = function ($r) { return strpos($r['결과'], '성공') === 0; };
    $home = $good($res[0]);
    $ref  = $good($res[1]);
    $mineOk = isset($res[3]) ? $good($res[3]) : null;

    if (!$home && !$ref) {
        $판정 = '유튜브 자체에 못 닿습니다. NAS 가 유튜브로 나가는 길이 막혀 있습니다 '
              . '(공유기·DNS·보안 설정). 네이버 블로그는 되는데 유튜브만 안 되면 이 경우입니다.';
        $할일 = 'DSM → 제어판 → 네트워크 → 일반 에서 DNS 서버를 8.8.8.8 로 바꿔보시고, '
              . '공유기나 회사 방화벽에서 유튜브가 막혀 있는지 확인해 주세요.';
    } elseif (!$ref) {
        $판정 = '유튜브 홈은 열리는데 RSS 주소만 막힙니다. 중간에서 걸러내고 있을 가능성이 큽니다.';
        $할일 = 'DSM 의 Safe Access(안전 접속) 같은 필터나 공유기 광고차단 기능을 꺼보세요.';
    } elseif ($mineOk === false) {
        $판정 = '유튜브는 잘 되는데 이 채널의 RSS 만 없습니다(404). '
              . '채널 주소는 맞지만 채널 ID 가 다른 경우입니다.';
        $할일 = '유튜브 채널 페이지에서 마우스 오른쪽 → 페이지 소스 보기 → Ctrl+F 로 '
              . '"channelId" 를 찾으면 진짜 ID 가 나옵니다. '
              . '또는 채널의 동영상 하나를 열고 채널 이름을 눌러 들어간 주소를 넣어보세요.';
    } elseif ($mineOk === true) {
        $판정 = '지금은 잘 됩니다. 아까는 일시적으로 막혔던 것 같습니다.';
        $할일 = '채널 탭에서 [↻ 전부 새로 받기] 를 눌러보세요.';
    } else {
        $판정 = '유튜브는 잘 됩니다. 채널 주소를 함께 넣어주시면 더 정확히 봅니다.';
        $할일 = '주소 뒤에 &url=채널주소 를 붙여 다시 열어보세요.';
    }

    jout(['ok' => true, 'mode' => 'ytcheck',
          '📋 판정' => $판정, '✅ 해볼 일' => $할일,
          '찾은채널ID' => $id ?: '(없음)', '검사내역' => $res]);
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

/* 대시보드에 등록된 채널 목록을 읽어옵니다 (브랜드 데이터에서) */
function all_channels() {
    $f = __DIR__ . '/data/brand-data.json';
    if (!is_file($f)) return [];
    $d = json_decode((string)@file_get_contents($f), true);
    if (!is_array($d) || empty($d['brands'])) return [];
    $out = [];
    foreach ($d['brands'] as $b) {
        foreach (($b['channels'] ?? []) as $c) {
            if (empty($c['feed'])) continue;
            $out[] = [
                '브랜드'   => (string)($b['name'] ?? ''),
                '브랜드id' => (string)($b['id'] ?? ''),
                '이름'     => (string)($c['name'] ?? ''),
                'kind'     => (string)($c['kind'] ?? '웹사이트'),
                'url'      => (string)($c['url'] ?? ''),
                'feed'     => (string)$c['feed'],
            ];
        }
    }
    return $out;
}

/* 받아둔 것만 보여줍니다. 인터넷에 나가지 않아서 눈 깜짝할 사이에 끝납니다. */
if ($action === 'summary') {
    $rows = [];
    $oldest = null;
    foreach (all_channels() as $c) {
        $cf = $CACHE_DIR . '/' . md5($c['feed']) . '.json';
        $c['items'] = [];
        $c['받은시각'] = null;
        if (is_file($cf)) {
            $j = json_decode((string)@file_get_contents($cf), true);
            if (is_array($j) && !empty($j['items'])) $c['items'] = array_slice($j['items'], 0, 5);
            $c['받은시각'] = date('c', filemtime($cf));
            $oldest = ($oldest === null) ? filemtime($cf) : min($oldest, filemtime($cf));
        }
        $rows[] = $c;
    }
    $lastFile = __DIR__ . '/data/feeds-last.txt';
    $lastAt   = is_file($lastFile) ? (int)filemtime($lastFile) : 0;
    jout([
        'ok'       => true,
        '채널'     => $rows,
        '채널수'   => count($rows),
        '가장오래된확인' => $oldest ? date('c', $oldest) : null,
        '마지막확인'    => $lastAt ? date('c', $lastAt) : null,
        '지난초'        => $lastAt ? (time() - $lastAt) : null,
        '자동확인'      => $lastAt ? date('c', $lastAt) : null,
        '예약작업'      => is_file(__DIR__ . '/data/feeds-cron.txt') ? '등록됨' : '확인안됨',
    ]);
}

/* 등록된 채널을 전부 새로 받아옵니다. 작업 스케줄러(feeds.sh)가 주기적으로 부릅니다. */
if ($action === 'refreshall') {
    @mkdir(__DIR__ . '/data', 0775, true);
    if (!is_dir($CACHE_DIR)) @mkdir($CACHE_DIR, 0775, true);
    $lastFile = __DIR__ . '/data/feeds-last.txt';

    // maxage=1800 처럼 주면, 마지막으로 돌아본 지 그만큼 안 지났을 때는 그냥 넘어갑니다.
    // 대시보드를 여러 명이 열어두어도 NAS 가 같은 일을 여러 번 하지 않게 하려는 것입니다.
    $maxage = isset($_GET['maxage']) ? max(60, (int)$_GET['maxage']) : 0;
    if ($maxage > 0 && is_file($lastFile)) {
        $age = time() - (int)filemtime($lastFile);
        if ($age < $maxage) {
            jout(['ok' => true, 'mode' => 'refreshall', '건너뜀' => true,
                  '이유' => $age . '초 전에 이미 확인했습니다',
                  '마지막확인' => date('c', filemtime($lastFile))]);
        }
    }

    // 두 사람이 동시에 눌러도 한 번만 나가도록 잠급니다.
    $lockPath = __DIR__ . '/data/feeds.lock';
    $lock = @fopen($lockPath, 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        jout(['ok' => true, 'mode' => 'refreshall', '건너뜀' => true,
              '이유' => '지금 다른 곳에서 확인하는 중입니다']);
    }

    if (PHP_SAPI === 'cli' || isset($_GET['cron'])) {
        @file_put_contents(__DIR__ . '/data/feeds-cron.txt', date('c'));
    }
    $ok = 0; $fail = 0; $new = 0; $failed = [];
    foreach (all_channels() as $c) {
        $cf   = $CACHE_DIR . '/' . md5($c['feed']) . '.json';
        $before = '';
        if (is_file($cf)) {
            $j = json_decode((string)@file_get_contents($cf), true);
            $before = $j['items'][0]['link'] ?? '';
        }
        $why  = [];
        $body = fetch_url($c['feed'], $why);
        if ($body === false) {
            $fail++;
            $failed[] = ['채널' => $c['브랜드'] . ' · ' . $c['이름'], '시도내역' => $why];
            continue;
        }
        $p = parse_feed($body, 10);
        if (!$p) {
            $fail++;
            $failed[] = ['채널' => $c['브랜드'] . ' · ' . $c['이름'], '시도내역' => ['RSS 형식이 아닙니다']];
            continue;
        }
        @file_put_contents($cf, json_encode(
            ['ok' => true, 'title' => $p['title'], 'items' => $p['items'],
             '받은시각' => date('c'), '캐시' => '아니오'], JSON_UNESCAPED_UNICODE));
        $ok++;
        if ($before !== '' && ($p['items'][0]['link'] ?? '') !== $before) $new++;
    }
    @file_put_contents($lastFile, date('c'));
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    jout(['ok' => true, 'mode' => 'refreshall', '건너뜀' => false, '확인한채널' => $ok,
          '새글있던채널' => $new, '실패' => $fail, '실패내역' => $failed,
          '시각' => date('c')]);
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
        $tip = '';
        if (strpos($feed, 'youtube.com') !== false) {
            $tip = "\n\n404 는 '그 채널 ID 로는 RSS 가 없다', "
                 . "그 밖의 오류는 '유튜브까지 못 갔다' 는 뜻입니다.\n"
                 . "어느 쪽인지는 [🔧 유튜브 진단] 을 눌러 확인하세요.";
        }
        jout(['ok' => false,
              'error' => "채널을 읽지 못했습니다.\n\n"
                . "NAS 가 이 주소에 닿지 못했습니다:\n" . $feed . "\n\n"
                . "시도한 방법:\n \xc2\xb7 " . implode("\n \xc2\xb7 ", $why) . $tip,
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
