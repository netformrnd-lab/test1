<?php
/**
 * 브랜드 허브 - 자료 파일 업로드 / 다운로드 / 삭제
 *
 * 파일은 NAS의 data/files/ 폴더에 저장됩니다.
 * 저장할 때 원본 이름 대신 임의의 32자리 이름을 쓰기 때문에,
 * 주소를 추측해서 남의 파일을 받아가는 일이 어렵습니다.
 * 원본 파일명은 brand-data.json 에 기록되고, 내려받을 때 다시 붙여줍니다.
 */

/* 로그인한 사람만 통과합니다 (계정을 안 만들었으면 예전처럼 누구나) */
if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';   // 파일이 아직 안 왔으면 예전처럼 동작합니다

$DATA_DIR = __DIR__ . '/data';
/* 올린 파일을 둘 곳.
   data/uploadroot.txt 에 적혀 있으면 그 폴더(= 공유폴더 안)로 보냅니다.
   비어 있으면 예전처럼 data/files 에 둡니다.                          */
$UPROOT_FILE = $DATA_DIR . '/uploadroot.txt';

function upload_root($f) {
    if (!is_file($f)) return null;
    $p = rtrim(trim((string)@file_get_contents($f)), '/');
    if ($p === '' || !is_dir($p) || !is_writable($p)) return null;
    return $p;
}

/* 윈도우에서 보는 주소를 NAS 안의 실제 폴더로 바꿔 찾아봅니다.
     Y:\넷폼알앤디 공유폴더\마케팅…\브랜드 마케팅팀
     \\netformrnd\넷폼알앤디 공유폴더\…
   드라이브 문자만으로는 어느 볼륨인지 알 수 없어서, 뒤쪽 폴더 이름을
   하나씩 줄여가며 실제로 있는 곳을 찾습니다.                            */
/* 어디부터 찾아볼지 — NAS 볼륨과 지금 훑고 있는 공유폴더 */
function nas_bases($scanRoot) {
    $bases = [];
    if ($scanRoot) {
        $r = rtrim($scanRoot, '/');
        $bases[] = $r;
        $bases[] = dirname($r);                            // 공유폴더의 한 단계 위
        $bases[] = dirname(dirname($r));                   // 볼륨
    }
    for ($i = 1; $i <= 8; $i++) $bases[] = '/volume' . $i;
    foreach (['/volumeUSB1/usbshare1', '/volumeUSB2/usbshare2', '/volumeSATA1/satashare1',
              '/var/services/homes/..', '/'] as $x) $bases[] = $x;
    // 실제로 있는 것만, 중복 없이
    $out = [];
    foreach ($bases as $b) {
        $b = rtrim((string)$b, '/');
        if ($b === '' || $b === '.') continue;
        if (!is_dir($b)) continue;
        if (!in_array($b, $out, true)) $out[] = $b;
    }
    return $out;
}

/* 윈도우 주소를 NAS 안의 실제 폴더로 바꿉니다.
   찾지 못하면 무엇을 시도했는지 $tried 에 담아 알려줍니다.               */
function find_nas_dir($input, $scanRoot, &$tried = null) {
    $tried = [];
    $p = str_replace('\\', '/', trim((string)$input));
    if ($p === '') return null;
    if (is_dir($p)) return rtrim($p, '/');                 // 이미 리눅스 경로

    $p = preg_replace('#^//[^/]+/#', '/', $p);             // \\서버\공유
    $p = preg_replace('#^[A-Za-z]:/#', '/', $p);           // Y:\
    $p = preg_replace('#/+#', '/', $p);
    $p = trim($p, '/');
    if ($p === '') return null;

    $bases = nas_bases($scanRoot);
    $parts = explode('/', $p);

    // 앞쪽을 하나씩 떼면서 (드라이브가 어디에 붙었는지 모르므로) 찾아봅니다
    for ($skip = 0; $skip < count($parts); $skip++) {
        $tail = implode('/', array_slice($parts, $skip));
        if ($tail === '') continue;
        foreach ($bases as $b) {
            $try = $b . '/' . $tail;
            if (count($tried) < 40) $tried[] = $try;
            if (is_dir($try)) return rtrim($try, '/');
        }
    }

    // 그래도 못 찾으면, 이름이 조금 다를 수 있으니 한 칸씩 내려가며 비슷한 이름을 찾습니다
    // (띄어쓰기·괄호가 달라서 못 찾는 경우가 많습니다)
    foreach ($bases as $b) {
        $cur = $b; $ok = true;
        foreach ($parts as $want) {
            $hit = null;
            foreach ((array)@scandir($cur) as $e) {
                if ($e === '.' || $e === '..') continue;
                if (!is_dir($cur . '/' . $e)) continue;
                if (norm_name($e) === norm_name($want)) { $hit = $e; break; }
            }
            if ($hit === null) { $ok = false; break; }
            $cur .= '/' . $hit;
        }
        if ($ok && is_dir($cur)) return rtrim($cur, '/');
    }
    return null;
}

/* 띄어쓰기·특수문자를 무시하고 이름을 견줍니다 */
function norm_name($s) {
    $s = (string)$s;
    if (function_exists('mb_strtolower')) $s = mb_strtolower($s, 'UTF-8');
    return preg_replace('/[\s_\-()\[\].]+/u', '', $s);
}

/* 브랜드 폴더 안의 종류 폴더.
   번호를 붙여 탐색기에서 늘 같은 순서로 보이게 합니다.               */
const SUBDIRS = [
    '자료'   => '01_자료',
    '기록부' => '02_브랜드기록부',
    '도구'   => '03_자동화도구',
];
/* 예전에 쓰던 이름 → 지금 이름 (정리할 때 옮깁니다) */
const OLDSUBS = [
    '자료' => '01_자료', '기록부' => '02_브랜드기록부', '자동화도구' => '03_자동화도구',
    '02_기록부' => '02_브랜드기록부',
];

/* 연도 폴더를 쓸지 (기본: 씁니다) */
$UPOPT_FILE = $DATA_DIR . '/uploadopt.json';
function use_year($f) {
    if (!is_file($f)) return true;                       // 기본값
    $j = json_decode((string)@file_get_contents($f), true);
    return !is_array($j) || !isset($j['year']) ? true : (bool)$j['year'];
}
$USE_YEAR = use_year($UPOPT_FILE);

/* 파일 하나가 들어갈 자리 — <브랜드>/<종류>[/<연도>] */
function dest_dir($root, $brand, $sub, $useYear, $when = null) {
    $d = $root . '/' . $brand . '/' . $sub;
    if ($useYear) $d .= '/' . date('Y', $when ?: time());
    return $d;
}

$FILE_DIR  = upload_root($UPROOT_FILE) ?: ($DATA_DIR . '/files');
/* 예전에 data/files 에 올린 파일도 계속 열려야 합니다 */
$FILE_DIRS = array_values(array_unique(array_filter([$FILE_DIR, $DATA_DIR . '/files'], 'is_dir')));
$MANIFEST = $DATA_DIR . '/brand-data.json';
$MAX_BYTES = 200 * 1024 * 1024;   // 200MB (PHP 설정이 더 낮으면 그쪽이 우선 적용됩니다)

function jout($arr, $code = 200) {
    // 웹 스테이션이 200 이 아닌 응답의 내용을 자기 오류 페이지로 바꿔치기 하므로,
    // 항상 200 으로 보내고 실패 여부는 JSON 안의 ok 로만 알립니다.
    http_response_code(200);
    if ($code !== 200 && is_array($arr) && !isset($arr['status'])) $arr['status'] = $code;
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

/** php.ini 의 "8M" 같은 표기를 바이트로 바꿉니다 */
function to_bytes($v) {
    $v = trim((string)$v);
    if ($v === '') return 0;
    $unit = strtolower(substr($v, -1));
    $num = (int)$v;
    if ($unit === 'g') return $num * 1024 * 1024 * 1024;
    if ($unit === 'm') return $num * 1024 * 1024;
    if ($unit === 'k') return $num * 1024;
    return $num;
}

function php_limit_bytes() {
    return min(to_bytes(ini_get('upload_max_filesize')), to_bytes(ini_get('post_max_size')));
}

/** 폴더·파일 이름으로 쓸 수 없는 문자를 걸러냅니다 */
function safe_name($s, $fallback = '기타') {
    $s = str_replace(['\\', '/', "\0"], '_', (string)$s);
    $s = preg_replace('/[\x00-\x1F<>:"|?*]/u', '_', $s);
    $s = trim($s, " .\t");
    if ($s === '') return $fallback;
    if (mb_strlen($s, 'UTF-8') > 120) $s = mb_substr($s, 0, 120, 'UTF-8');
    return $s;
}

/**
 * 같은 이름이 있으면 "이름 (2).pdf" 처럼 번호를 붙입니다.
 *
 * 두 사람이 같은 이름을 같은 순간에 올릴 수도 있어서,
 * "없더라" 를 보고 쓰는 게 아니라 '내가 먼저 만들기'(x 모드)로 자리를 잡습니다.
 * 그래야 한쪽이 다른 쪽 파일을 덮어쓰지 않습니다.
 */
function unique_path($dir, $name) {
    $ext  = pathinfo($name, PATHINFO_EXTENSION);
    $base = pathinfo($name, PATHINFO_FILENAME);
    $try  = $name;
    for ($i = 1; $i < 500; $i++) {
        if ($i > 1) {
            $try = $base . ' (' . $i . ')' . ($ext !== '' ? '.' . $ext : '');
        }
        $h = @fopen($dir . '/' . $try, 'x');      // 이미 있으면 실패합니다
        if ($h) { fclose($h); return $try; }
    }
    return $base . '-' . substr(md5(uniqid('', true)), 0, 6)
         . ($ext !== '' ? '.' . $ext : '');
}

/** brand-data.json 에서 fileId 에 해당하는 자료 항목을 찾습니다 */
function lookup_asset($manifest, $fileId) {
    if (!file_exists($manifest)) return null;
    $json = json_decode(file_get_contents($manifest), true);
    if (!is_array($json) || !isset($json['brands'])) return null;
    foreach ($json['brands'] as $b) {
        // 브랜드 기록부 문서도 같이 찾습니다
        if (isset($b['record']['id']) && $b['record']['id'] === $fileId) {
            $r = $b['record'];
            return ['fileId' => $r['id'], 'fileName' => $r['name'] ?? '',
                    'filePath' => $r['filePath'] ?? ''];
        }
        if (!isset($b['assets']) || !is_array($b['assets'])) continue;
        foreach ($b['assets'] as $a) {
            if (isset($a['fileId']) && $a['fileId'] === $fileId) return $a;
        }
    }
    return null;
}

/** fileId 에 해당하는 실제 파일 경로를 구합니다 (예전 방식도 함께 지원) */
function resolve_path($fileDirs, $manifest, $fileId) {
    if (!is_array($fileDirs)) $fileDirs = [$fileDirs];
    $a = lookup_asset($manifest, $fileId);

    foreach ($fileDirs as $fileDir) {
        if ($a && !empty($a['filePath'])) {
            $real = realpath($fileDir . '/' . $a['filePath']);
            $root = realpath($fileDir);
            // 정해둔 폴더 밖으로 벗어나는 경로는 거부합니다
            if ($real && $root && strpos($real, $root . DIRECTORY_SEPARATOR) === 0) {
                return [$real, $a['fileName'] ?? basename($real)];
            }
        }
        // 예전에 올린 파일 (임의 이름 .bin)
        $old = $fileDir . '/' . $fileId . '.bin';
        if (is_file($old)) return [$old, ($a['fileName'] ?? ($fileId . '.bin'))];
    }

    // 폴더를 정리하면서 자리가 바뀌었을 수 있습니다.
    // 그럴 때는 파일 이름으로 한 번 더 찾아봅니다 (스스로 낫는 장치).
    $want = $a['fileName'] ?? '';
    if ($want !== '') {
        foreach ($fileDirs as $fileDir) {
            $hit = find_by_name($fileDir, $want, 3);
            if ($hit) return [$hit, $want];
        }
    }
    return [null, null];
}

/* 이름이 같은 파일을 몇 단계 아래까지 찾아봅니다 */
function find_by_name($dir, $name, $depth) {
    if ($depth < 0 || !is_dir($dir)) return null;
    $direct = $dir . '/' . $name;
    if (is_file($direct)) return realpath($direct);
    foreach ((array)@scandir($dir) as $e) {
        if ($e === '.' || $e === '..' || $e === '@eaDir') continue;
        $p = $dir . '/' . $e;
        if (is_dir($p)) {
            $hit = find_by_name($p, $name, $depth - 1);
            if ($hit) return $hit;
        }
    }
    return null;
}

/** brand-data.json 에서 fileId 에 해당하는 원본 파일명을 찾습니다 */
function lookup_name($manifest, $fileId) {
    if (!file_exists($manifest)) return null;
    $json = json_decode(file_get_contents($manifest), true);
    if (!is_array($json) || !isset($json['brands'])) return null;
    foreach ($json['brands'] as $b) {
        if (!isset($b['assets']) || !is_array($b['assets'])) continue;
        foreach ($b['assets'] as $a) {
            if (isset($a['fileId']) && $a['fileId'] === $fileId) {
                return $a['fileName'] ?? null;
            }
        }
    }
    return null;
}

$action = $_GET['action'] ?? '';

/* ---------------- 상태 확인 ---------------- */
if ($action === 'check') {
    jout([
        'ok'                => true,
        'php업로드한도'     => ini_get('upload_max_filesize'),
        'php요청한도'       => ini_get('post_max_size'),
        '실제적용한도_바이트' => php_limit_bytes(),
        'files폴더_존재'    => is_dir($FILE_DIR) ? '예' : '아니오',
        'files폴더_쓰기가능' => is_dir($FILE_DIR)
            ? (is_writable($FILE_DIR) ? '예' : '아니오')
            : ((is_dir($DATA_DIR) ? is_writable($DATA_DIR) : is_writable(__DIR__))
                 ? '아직 없지만 만들 수 있음' : '상위 폴더에 쓸 수 없음'),
        '보관파일수'        => is_dir($FILE_DIR)
            ? count(array_filter((array)glob($FILE_DIR . '/*/*'), 'is_file'))
              + count(array_filter((array)glob($FILE_DIR . '/*.bin'), 'is_file'))
            : 0,
    ]);
}

/* ---------------- 업로드 ---------------- */
/* ---------------- 올린 파일을 둘 폴더 ---------------- */
if ($action === 'uploadroot') {
    $set  = upload_root($UPROOT_FILE);
    $raw  = is_file($UPROOT_FILE) ? trim((string)@file_get_contents($UPROOT_FILE)) : '';
    $rootF = $DATA_DIR . '/nasroot.txt';
    // 대시보드 안에 쌓여 있는 파일 수 (옮길 것이 있는지 알려주려고)
    $inside = 0;
    $localDir = $DATA_DIR . '/files';
    if (is_dir($localDir)) {
        $it = @scandir($localDir);
        $cnt = function ($d) use (&$cnt) {
            $n = 0;
            foreach ((array)@scandir($d) as $e) {
                if ($e === '.' || $e === '..') continue;
                $f = $d . '/' . $e;
                if (is_dir($f)) $n += $cnt($f); elseif (is_file($f)) $n++;
                if ($n > 5000) return $n;
            }
            return $n;
        };
        $inside = $cnt($localDir);
    }

    // 정리할 것이 있는지 훑어봅니다 (널려 있는 파일 · 연도 폴더 · 옛 폴더 이름)
    $untidy = 0;
    if ($set !== null && is_dir($FILE_DIR)) {
        $subsNow = array_values(SUBDIRS);
        foreach ((array)@scandir($FILE_DIR) as $brand) {
            if ($brand === '.' || $brand === '..' || $brand === '@eaDir') continue;
            if (substr($brand, 0, 1) === '_' || substr($brand, 0, 1) === '.') continue;
            $bd = $FILE_DIR . '/' . $brand;
            if (!is_dir($bd)) continue;
            foreach ((array)@scandir($bd) as $e) {
                if ($e === '.' || $e === '..' || $e === '@eaDir') continue;
                $p2 = $bd . '/' . $e;
                if (is_file($p2)) { $untidy++; continue; }          // 브랜드 폴더에 널린 파일
                if (isset(OLDSUBS[$e]) && !in_array($e, $subsNow, true)) { $untidy++; continue; }
                if (!in_array($e, $subsNow, true)) continue;
                // 종류 폴더 안이 지금 설정과 다른 모양이면 정리 대상입니다
                foreach ((array)@scandir($p2) as $f) {
                    if ($f === '.' || $f === '..' || $f === '@eaDir') continue;
                    $sp = $p2 . '/' . $f;
                    $isDir  = is_dir($sp);
                    $isYear = $isDir && preg_match('/^\d{4}$/', $f);
                    if ($USE_YEAR && is_file($sp))            { $untidy++; break; }   // 연도 폴더 밖의 파일
                    if ($USE_YEAR && $isDir && !$isYear)      { $untidy++; break; }   // 연도가 아닌 폴더
                    if (!$USE_YEAR && $isDir)                 { $untidy++; break; }   // 남아 있는 연도 폴더
                }
            }
            if ($untidy > 200) break;
        }
    }

    jout([
        'ok'        => true,
        '지금폴더'   => $FILE_DIR,
        '공유폴더로' => $set !== null,
        '안에쌓인수' => $inside,
        '정리필요'   => $untidy,
        '연도폴더'   => $USE_YEAR,
        '적어둔값'   => $raw,
        '문제'      => ($raw !== '' && $set === null)
            ? (is_dir($raw) ? '그 폴더에 쓸 권한이 없습니다 (http 사용자에게 쓰기 권한을 주세요)'
                            : '그 폴더를 찾지 못했습니다')
            : null,
        '훑는폴더'   => is_file($rootF) ? trim((string)@file_get_contents($rootF)) : '',
    ]);
}

/* 폴더를 눈으로 골라 찾을 수 있게, 한 단계씩 보여줍니다 */
if ($action === 'pickdirs') {
    $rootF = $DATA_DIR . '/nasroot.txt';
    $scan  = is_file($rootF) ? rtrim(trim((string)@file_get_contents($rootF)), '/') : '';
    $at    = trim((string)($_GET['at'] ?? ''));

    if ($at === '') {
        // 맨 처음: NAS 안에서 고를 만한 곳들을 보여줍니다
        $rows = [];
        foreach (nas_bases($scan) as $b) {
            if ($b === '/') continue;
            $rows[] = ['경로' => $b, '이름' => basename($b) ?: $b,
                       '쓸수있음' => is_writable($b)];
        }
        jout(['ok' => true, '지금' => '', '위' => null, '폴더' => $rows,
              '훑는폴더' => $scan]);
    }

    $at = rtrim(str_replace('\\', '/', $at), '/');
    if (!is_dir($at)) jout(['ok' => false, 'error' => '그런 폴더가 없습니다: ' . $at], 404);

    $rows = [];
    foreach ((array)@scandir($at) as $e) {
        if ($e === '.' || $e === '..') continue;
        if ($e === '@eaDir' || $e === '#recycle' || $e === '#snapshot') continue;
        if (substr($e, 0, 1) === '.') continue;
        $full = $at . '/' . $e;
        if (!is_dir($full) || is_link($full)) continue;
        $rows[] = ['경로' => $full, '이름' => $e, '쓸수있음' => is_writable($full)];
        if (count($rows) >= 300) break;
    }
    usort($rows, function ($x, $y) { return strnatcasecmp($x['이름'], $y['이름']); });
    jout(['ok' => true, '지금' => $at, '위' => (dirname($at) !== $at ? dirname($at) : null),
          '폴더' => $rows, '여기쓸수있음' => is_writable($at)]);
}

/* 파일 하나가 어느 종류 폴더에 들어가야 하는지 이름으로 짐작합니다.
   (분류 안 된 채 브랜드 폴더에 널려 있던 예전 파일들을 위해서입니다) */
function guess_sub($name) {
    $n = mb_strtolower((string)$name, 'UTF-8');
    if (strpos($n, 'brand_record') !== false || strpos($n, '기록부') !== false
        || strpos($n, 'record') !== false) return SUBDIRS['기록부'];
    foreach (['생성기', '자동화', 'generator', 'gpts', '봇', 'bot', '도구', 'tool'] as $k) {
        if (strpos($n, $k) !== false) return SUBDIRS['도구'];
    }
    return SUBDIRS['자료'];
}

/* 빈 폴더를 치웁니다 (아래부터 위로) */
function drop_empty($dir, $keep) {
    if (!is_dir($dir)) return;
    // 안쪽부터 먼저 치우고, 그 다음에 자기를 봅니다
    foreach ((array)@scandir($dir) as $e) {
        if ($e === '.' || $e === '..') continue;
        if (is_dir($dir . '/' . $e)) drop_empty($dir . '/' . $e, $keep);
    }
    if ($dir === $keep) return;                     // 브랜드 폴더 자체는 남깁니다
    $left = array_diff((array)@scandir($dir), ['.', '..', '@eaDir']);
    if (!count($left)) { @rmdir($dir); clearstatcache(true, $dir); }
}

/* 폴더가 어떻게 생겼는지 적어둡니다 (탐색기에서 열어보는 사람을 위해) */
function write_guide($root, $useYear = true) {
    $tree = $useYear
        ? "  브랜드 이름 (아파트스퀘어, POUR공법 …)\r\n"
        . "    01_자료           카탈로그·제안서·이미지 등 올린 파일\r\n"
        . "      2026            올린 해마다 폴더가 하나씩 생깁니다\r\n"
        . "      2025\r\n"
        . "    02_브랜드기록부   브랜드 기록부 파일\r\n"
        . "      2026\r\n"
        . "    03_자동화도구     블로그·카페 생성기 같은 도구 파일\r\n"
        . "      2026\r\n\r\n"
        : "  브랜드 이름 (아파트스퀘어, POUR공법 …)\r\n"
        . "    01_자료           카탈로그·제안서·이미지 등 올린 파일\r\n"
        . "    02_브랜드기록부   브랜드 기록부 파일\r\n"
        . "    03_자동화도구     블로그·카페 생성기 같은 도구 파일\r\n\r\n";
    $txt = "브랜드 마케팅팀 폴더 안내\r\n"
         . "==========================\r\n\r\n"
         . "이 폴더는 브랜드 대시보드가 자동으로 정리합니다.\r\n\r\n"
         . $tree
         . "파일 이름 앞에 날짜가 붙어 있어(2026-09-04_…),\r\n"
         . "이름순으로 정렬하면 시간 순으로 늘어섭니다.\r\n\r\n"
         . "여기서 파일을 옮기거나 이름을 바꾸면 대시보드에서 찾지 못합니다.\r\n"
         . "대시보드에서 지우면 이 폴더에서도 사라집니다.\r\n\r\n"
         . "마지막 정리: " . date('Y-m-d H:i') . "\r\n";
    @file_put_contents($root . '/_폴더 안내.txt', $txt);
}

/* ---------------- 폴더 예쁘게 정리하기 ----------------
   · 예전 폴더 이름(자료 / 기록부 / 자동화도구)을 지금 이름으로
   · 연도 폴더(2026) 안의 파일을 종류 폴더로 끌어올리기
   · 브랜드 폴더에 그냥 널려 있던 파일을 종류 폴더로
   · 날짜가 없는 파일 이름 앞에 날짜 붙이기
   · 빈 폴더 치우기
   옮긴 자리는 대시보드가 알 수 있게 「옛경로 → 새경로」 로 돌려줍니다.
   ------------------------------------------------------ */
if ($action === 'tidy') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $root = $FILE_DIR;
    if (!is_dir($root)) jout(['ok' => false, 'error' => '저장 폴더가 없습니다'], 404);

    $map = [];          // 옛 상대경로 → 새 상대경로
    $moved = 0; $failed = [];
    $subsNow = array_values(SUBDIRS);
    $deadline = microtime(true) + 25;

    $useYear = $USE_YEAR;
    $place = function ($src, $brandDir, $sub, $rel) use (&$map, &$moved, &$failed, $root, $useYear) {
        $name = basename($src);
        $t = @filemtime($src) ?: time();
        // 날짜가 없으면 파일이 만들어진 날을 앞에 붙입니다
        if (preg_match('/^(\d{4})-\d{2}-\d{2}_/', $name, $m)) {
            $year = $m[1];                                 // 이름에 적힌 해를 씁니다
        } else {
            $name = date('Y-m-d', $t) . '_' . $name;
            $year = date('Y', $t);
        }
        $dstDir = $brandDir . '/' . $sub . ($useYear ? '/' . $year : '');
        if (!is_dir($dstDir) && !@mkdir($dstDir, 0775, true) && !is_dir($dstDir)) {
            $failed[] = $rel . ' (폴더를 만들지 못함)'; return;
        }
        $final = $dstDir . '/' . $name;
        if ($final === $src) return;                       // 이미 제자리
        $name  = unique_path($dstDir, $name);
        $final = $dstDir . '/' . $name;
        if (!@rename($src, $final)) { $failed[] = $rel . ' (옮기지 못함)'; return; }
        @chmod($final, 0664);
        $map[$rel] = substr($final, strlen($root) + 1);
        $moved++;
    };

    foreach ((array)@scandir($root) as $brand) {
        if ($brand === '.' || $brand === '..' || $brand === '@eaDir') continue;
        if (substr($brand, 0, 1) === '_' || substr($brand, 0, 1) === '.') continue;
        $brandDir = $root . '/' . $brand;
        if (!is_dir($brandDir)) continue;
        if (microtime(true) > $deadline) break;

        foreach ((array)@scandir($brandDir) as $e) {
            if ($e === '.' || $e === '..' || $e === '@eaDir') continue;
            if (microtime(true) > $deadline) break;
            $path = $brandDir . '/' . $e;
            $rel  = $brand . '/' . $e;

            // ① 브랜드 폴더에 그냥 있던 파일 → 이름 보고 종류 폴더로
            if (is_file($path)) { $place($path, $brandDir, guess_sub($e), $rel); continue; }
            if (!is_dir($path)) continue;

            // ② 폴더 이름 정리 (자료 → 01_자료 …)
            $sub = in_array($e, $subsNow, true) ? $e : (OLDSUBS[$e] ?? null);
            if ($sub === null) continue;                   // 우리가 만든 폴더가 아니면 그대로 둡니다

            // ③ 그 안의 파일을 (연도 폴더까지 들어가서) 끌어올립니다
            $walk = function ($d, $r) use (&$walk, $place, $brandDir, $sub, $deadline) {
                foreach ((array)@scandir($d) as $f) {
                    if ($f === '.' || $f === '..' || $f === '@eaDir') continue;
                    if (microtime(true) > $deadline) return;
                    $fp = $d . '/' . $f;
                    if (is_dir($fp)) { $walk($fp, $r . '/' . $f); continue; }
                    if (is_file($fp)) $place($fp, $brandDir, $sub, $r . '/' . $f);
                }
            };
            $walk($path, $rel);
        }
        drop_empty($brandDir, $brandDir);
    }

    write_guide($root, $USE_YEAR);

    jout(['ok' => true, '옮긴수' => $moved, '자리바뀜' => $map,
          '못한것' => array_slice($failed, 0, 20),
          '더있음' => microtime(true) > $deadline,
          '안내' => $moved ? ($moved . '개 파일을 제자리로 옮겼습니다')
                          : '이미 잘 정리돼 있습니다']);
}

/* 대시보드 안(data/files)에 쌓여 있던 파일을 공유폴더로 옮깁니다 */
if ($action === 'movefiles') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $from = $DATA_DIR . '/files';
    $to   = upload_root($UPROOT_FILE);
    if ($to === null) {
        jout(['ok' => false, 'error' => '먼저 저장 폴더를 공유폴더로 정해주세요'], 400);
    }
    if (!is_dir($from)) jout(['ok' => true, '옮긴수' => 0, '안내' => '옮길 파일이 없습니다']);

    $moved = []; $failed = []; $n = 0;
    $deadline = microtime(true) + 20;                 // 오래 붙잡지 않습니다
    $walk = function ($dir, $rel) use (&$walk, $from, $to, &$moved, &$failed, &$n, $deadline) {
        foreach ((array)@scandir($dir) as $e) {
            if ($e === '.' || $e === '..') continue;
            if (microtime(true) > $deadline) return;
            $src = $dir . '/' . $e;
            $r   = $rel === '' ? $e : $rel . '/' . $e;
            if (is_dir($src)) { $walk($src, $r); continue; }
            if (!is_file($src)) continue;
            $dstDir = $to . '/' . dirname($r);
            if (!is_dir($dstDir) && !@mkdir($dstDir, 0775, true) && !is_dir($dstDir)) {
                $failed[] = $r . ' (폴더를 만들지 못함)'; continue;
            }
            $name = unique_path($dstDir, basename($r));
            if (@rename($src, $dstDir . '/' . $name)) {
                @chmod($dstDir . '/' . $name, 0664);
                $moved[] = dirname($r) . '/' . $name; $n++;
            } elseif (@copy($src, $dstDir . '/' . $name)) {   // 볼륨이 다르면 복사 후 삭제
                @chmod($dstDir . '/' . $name, 0664);
                @unlink($src);
                $moved[] = dirname($r) . '/' . $name; $n++;
            } else {
                $failed[] = $r . ' (옮기지 못함)';
            }
        }
    };
    $walk($from, '');

    jout(['ok' => true, '옮긴수' => $n, '옮긴것' => array_slice($moved, 0, 200),
          '못옮긴것' => array_slice($failed, 0, 40),
          '더있음' => microtime(true) > $deadline,
          '안내' => $n
            ? ($n . '개 파일을 공유폴더로 옮겼습니다'
               . (count($failed) ? ' (' . count($failed) . '개는 실패)' : ''))
            : '옮길 파일이 없습니다']);
}

/* 연도 폴더를 쓸지 정합니다 */
if ($action === 'setyear') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $b = json_decode((string)file_get_contents('php://input'), true);
    $on = !empty($b['year']);
    if (@file_put_contents($UPOPT_FILE, json_encode(['year' => $on])) === false) {
        jout(['ok' => false, 'error' => '설정을 저장하지 못했습니다 (data 폴더 권한)'], 500);
    }
    jout(['ok' => true, '연도폴더' => $on,
          '안내' => $on ? '연도 폴더를 씁니다'
                        : '연도 폴더를 쓰지 않습니다']);
}

if ($action === 'setuploadroot') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jout(['ok' => false, 'error' => 'POST 로 보내주세요'], 405);
    $body = json_decode((string)file_get_contents('php://input'), true);
    $want = trim((string)($body['path'] ?? ''));

    if ($want === '') {                              // 비우면 예전 자리로 되돌립니다
        @unlink($UPROOT_FILE);
        jout(['ok' => true, '지금폴더' => $DATA_DIR . '/files', '공유폴더로' => false,
              '안내' => '대시보드 안(data/files)에 저장하도록 되돌렸습니다']);
    }

    $rootF = $DATA_DIR . '/nasroot.txt';
    $scan  = is_file($rootF) ? rtrim(trim((string)@file_get_contents($rootF)), '/') : '';
    $tried = [];
    $found = find_nas_dir($want, $scan, $tried);

    if ($found === null) {
        jout(['ok' => false, 'error' =>
            "그 폴더를 NAS 안에서 찾지 못했습니다.\n\n적어주신 값: " . $want
            . "\n\n[📁 폴더 골라서 정하기] 로 눈으로 찾아 고르시는 게 가장 확실합니다.",
            '찾아본곳' => array_slice($tried, 0, 12),
            '고르기권함' => true], 404);
    }
    if (!is_writable($found)) {
        jout(['ok' => false, 'error' =>
            "폴더는 찾았는데 쓸 권한이 없습니다.\n\n찾은 곳: " . $found
            . "\n\nDSM → 제어판 → 공유 폴더 → 그 폴더 → 권한에서\n"
            . "「http」 사용자에게 읽기/쓰기를 주세요."], 403);
    }
    // 진짜로 쓸 수 있는지 한 번 해봅니다
    $probe = $found . '/.대시보드쓰기시험';
    if (@file_put_contents($probe, 'ok') === false) {
        jout(['ok' => false, 'error' => "폴더에 실제로 쓰지 못했습니다: " . $found], 403);
    }
    @unlink($probe);

    if (@file_put_contents($UPROOT_FILE, $found) === false) {
        jout(['ok' => false, 'error' => 'data 폴더에 설정을 저장하지 못했습니다'], 500);
    }
    jout(['ok' => true, '지금폴더' => $found, '공유폴더로' => true,
          '안내' => '앞으로 올리는 파일은 이 폴더에 저장됩니다']);
}

if ($action === 'upload') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }

    // 파일이 너무 커서 PHP가 아예 받지 못한 경우 $_FILES 가 비어 있습니다
    if (empty($_FILES) && empty($_POST)) {
        jout(['ok' => false, 'error' =>
            '파일이 너무 커서 서버가 받지 못했습니다. 현재 한도: '
            . ini_get('upload_max_filesize') . ' / 요청 ' . ini_get('post_max_size')
            . ' — Web Station의 PHP 프로필에서 한도를 올려주세요'], 413);
    }

    if (!isset($_FILES['file'])) {
        jout(['ok' => false, 'error' => '전달된 파일이 없습니다'], 400);
    }

    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        $msgs = [
            UPLOAD_ERR_INI_SIZE   => '파일이 서버 한도(' . ini_get('upload_max_filesize') . ')보다 큽니다',
            UPLOAD_ERR_FORM_SIZE  => '파일이 허용 크기보다 큽니다',
            UPLOAD_ERR_PARTIAL    => '파일이 일부만 전송되었습니다. 다시 시도해 주세요',
            UPLOAD_ERR_NO_FILE    => '파일이 선택되지 않았습니다',
            UPLOAD_ERR_NO_TMP_DIR => '서버에 임시 폴더가 없습니다',
            UPLOAD_ERR_CANT_WRITE => '서버가 파일을 쓰지 못했습니다 (권한 확인 필요)',
        ];
        jout(['ok' => false, 'error' => $msgs[$f['error']] ?? ('업로드 오류 코드 ' . $f['error'])], 400);
    }

    if ($f['size'] > $MAX_BYTES) {
        jout(['ok' => false, 'error' => '파일이 너무 큽니다 (최대 200MB)'], 413);
    }

    // 브랜드 폴더 > 종류 폴더 > 연도 폴더
    //   아파트스퀘어 / 01_자료 / 2026 / 2026-09-03_카탈로그.pdf
    // 연도 폴더는 [📅 연도 폴더] 로 끄고 켤 수 있습니다.
    $sub = SUBDIRS[trim($_POST['sub'] ?? '')] ?? SUBDIRS['자료'];
    $brandDir = dest_dir($FILE_DIR, safe_name($_POST['brand'] ?? '', '_공통'), $sub, $USE_YEAR);

    if (!is_dir($brandDir) && !@mkdir($brandDir, 0775, true) && !is_dir($brandDir)) {
        jout(['ok' => false, 'error' =>
            "저장 폴더를 만들 수 없습니다: $brandDir / data폴더 쓰기가능="
            . (is_writable($DATA_DIR) ? '예' : '아니오')], 500);
    }

    // 날짜를 앞에 붙여 탐색기에서 시간 순으로 정렬되게 합니다
    $orig = safe_name($f['name'], 'file');
    $stamped = preg_match('/^\d{4}-\d{2}-\d{2}_/', $orig) ? $orig : (date('Y-m-d') . '_' . $orig);
    $fileName = unique_path($brandDir, $stamped);
    $dest = $brandDir . '/' . $fileName;

    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        @unlink($dest);      // 자리만 잡아둔 빈 파일을 치웁니다
        jout(['ok' => false, 'error' =>
            'NAS에 파일을 저장하지 못했습니다 / 폴더 쓰기가능='
            . (is_writable($brandDir) ? '예' : '아니오')], 500);
    }
    @chmod($dest, 0664);

    jout([
        'ok'       => true,
        'fileId'   => bin2hex(random_bytes(16)),
        'fileName' => $fileName,
        'filePath' => substr($brandDir, strlen($FILE_DIR) + 1) . '/' . $fileName,
        '둔곳'     => $brandDir,
        'fileSize' => $f['size'],
        'mime'     => $f['type'] ?: 'application/octet-stream',
    ]);
}

/* ---------------- 다운로드 ---------------- */
/* ---------------- NAS 공유폴더로 옮기기 ----------------
   대시보드에 올린 파일을 실제 공유폴더 안으로 옮깁니다.
   훑은 폴더(nasroot.txt) 안쪽으로만 옮길 수 있고, 덮어쓰지 않습니다.
   ------------------------------------------------------ */
if ($action === 'movetonas') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }
    $in   = json_decode(file_get_contents('php://input'), true) ?: [];
    $rel  = str_replace('\\', '/', trim($in['path'] ?? ''));
    $dest = rtrim(str_replace('\\', '/', trim($in['dest'] ?? '')), '/');
    if ($rel === '' || $dest === '') jout(['ok' => false, 'error' => '옮길 파일과 폴더를 지정해 주세요'], 400);

    // 1) 원본은 반드시 data/files 안에 있어야 합니다
    $src  = realpath($FILE_DIR . '/' . $rel);
    $root = realpath($FILE_DIR);
    if (!$src || !$root || strpos($src, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($src)) {
        jout(['ok' => false, 'error' => '옮길 파일을 찾지 못했습니다: ' . $rel], 404);
    }

    // 2) 목적지는 반드시 훑은 공유폴더 안이어야 합니다
    $rootFile = $DATA_DIR . '/nasroot.txt';
    if (!is_file($rootFile)) {
        jout(['ok' => false, 'error' =>
            '먼저 NAS 자료에서 [🔎 지금 파일 목록 만들기] 를 한 번 해주세요. '
            . '어느 공유폴더를 쓰는지 알아야 옮길 수 있습니다.'], 400);
    }
    $nasRoot = realpath(rtrim(trim(file_get_contents($rootFile)), '/'));
    $destReal = realpath($dest);
    if (!$nasRoot || !$destReal || !is_dir($destReal)
        || ($destReal !== $nasRoot && strpos($destReal, $nasRoot . DIRECTORY_SEPARATOR) !== 0)) {
        jout(['ok' => false, 'error' => '그 폴더로는 옮길 수 없습니다. '
            . '목록을 만든 공유폴더 안쪽만 됩니다.', '옮기려던곳' => $dest], 403);
    }

    // 3) 쓰기 권한 확인
    if (!is_writable($destReal)) {
        $who = 'http';
        if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
            $u = @posix_getpwuid(@posix_geteuid());
            if (!empty($u['name'])) $who = $u['name'];
        }
        jout(['ok' => false, 'error' =>
            "이 폴더에 파일을 넣을 권한이 없습니다:\n" . $destReal . "\n\n"
            . "웹 서버는 \"" . $who . "\" 계정으로 돌아갑니다. 지금은 읽기만 되고 쓰기가 안 됩니다.\n\n"
            . "DSM → 제어판 → 공유 폴더 → 그 폴더 → [편집] → [권한] 탭\n"
            . "  1. 위 드롭다운을 \"시스템 내부 사용자\" 로 바꿉니다\n"
            . "  2. " . $who . " 를 찾아 \"읽기/쓰기\" 에 체크합니다\n"
            . "  3. 저장"], 403);
    }

    // 4) 같은 이름이 있으면 번호를 붙입니다 (덮어쓰지 않습니다)
    $name   = unique_path($destReal, basename($src));
    $target = $destReal . '/' . $name;

    if (!@rename($src, $target)) {                 // 볼륨이 다르면 rename 이 안 됩니다
        if (!@copy($src, $target)) {
            @unlink($target);   // 자리만 잡아둔 빈 파일을 치웁니다
            jout(['ok' => false, 'error' => '파일을 옮기지 못했습니다 (복사 실패)'], 500);
        }
        @unlink($src);
    }
    @chmod($target, 0664);

    jout(['ok' => true, '옮긴곳' => $target, '파일이름' => $name,
          '다음' => '다음번 목록 만들기 때 NAS 폴더 목록에도 나타납니다']);
}

/* ---------------- 자동화 도구 실행하기 ----------------
   생성기처럼 스크립트가 살아 있어야 동작하는 HTML 도구를 그대로 띄웁니다.
   (읽기 전용 문서는 아래 view 를 씁니다 — 그쪽은 스크립트를 막습니다)
   ---------------------------------------------------- */
if ($action === 'run') {
    $rel = trim($_GET['path'] ?? '');
    if ($rel === '') jout(['ok' => false, 'error' => '도구 경로가 없습니다'], 400);

    $rel  = str_replace('\\', '/', $rel);
    $real = realpath($FILE_DIR . '/' . $rel);
    $root = realpath($FILE_DIR);
    if (!$real || !$root || strpos($real, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
        jout(['ok' => false, 'error' => '그런 도구가 없습니다: ' . $rel], 404);
    }
    $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
    if ($ext !== 'html' && $ext !== 'htm') {
        jout(['ok' => false, 'error' => 'HTML 도구만 실행할 수 있습니다 (' . $ext . ')'], 400);
    }

    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($real));
    header('Cache-Control: private, max-age=0');
    while (ob_get_level()) ob_end_flush();
    readfile($real);
    exit;
}

/* ---------------- 문서 그대로 보여주기 (내려받지 않고) ----------------
   브랜드 기록부 같은 문서를 대시보드 안에서 바로 읽기 위한 것입니다.
   스크립트는 실행되지 않도록 막습니다.
   ------------------------------------------------------------------- */
if ($action === 'view') {
    $path = null;
    $name = null;

    // 1) 파일 경로를 직접 받은 경우 (저장이 끝나기 전에도 바로 볼 수 있습니다)
    $rel = trim($_GET['path'] ?? '');
    if ($rel !== '') {
        $rel  = str_replace('\\', '/', $rel);
        $try  = $FILE_DIR . '/' . $rel;
        $real = realpath($try);
        $root = realpath($FILE_DIR);
        // files 폴더 밖으로 벗어나는 경로는 거부합니다
        if ($real && $root && strpos($real, $root . DIRECTORY_SEPARATOR) === 0 && is_file($real)) {
            $path = $real;
            $name = basename($real);
        } else {
            jout(['ok' => false, 'error' => '그런 문서가 없습니다: ' . $rel], 404);
        }
    } else {
        // 2) 예전 방식 — 저장된 목록에서 찾습니다
        $id = $_GET['id'] ?? '';
        if (!preg_match('/^[0-9a-f]{32}$/', $id)) {
            jout(['ok' => false, 'error' => '잘못된 파일 주소입니다'], 400);
        }
        [$path, $name] = resolve_path($FILE_DIRS, $MANIFEST, $id);
        if (!$path) jout(['ok' => false, 'error' =>
            '아직 저장되지 않은 문서입니다. 잠시 뒤 새로고침해 주세요.'], 404);
    }

    $ext = strtolower(pathinfo($name ?: $path, PATHINFO_EXTENSION));
    $types = [
        'html' => 'text/html; charset=utf-8',
        'htm'  => 'text/html; charset=utf-8',
        'txt'  => 'text/plain; charset=utf-8',
        'md'   => 'text/plain; charset=utf-8',
    ];
    if (!isset($types[$ext])) {
        jout(['ok' => false, 'error' =>
            '이 형식은 화면에서 바로 볼 수 없습니다 (' . $ext . '). 내려받아 주세요.'], 400);
    }

    // 문서 안의 스크립트는 실행되지 않게 막습니다. 글꼴과 그림은 허용합니다.
    header('Content-Type: ' . $types[$ext]);
    header("Content-Security-Policy: script-src 'none'; object-src 'none'; base-uri 'none'");
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=0');
    while (ob_get_level()) ob_end_flush();
    readfile($path);
    exit;
}

if ($action === 'download') {
    $id = $_GET['id'] ?? '';
    if (!preg_match('/^[0-9a-f]{32}$/', $id)) {
        jout(['ok' => false, 'error' => '잘못된 파일 주소입니다'], 400);
    }

    [$path, $name] = resolve_path($FILE_DIRS, $MANIFEST, $id);
    if (!$path) {
        jout(['ok' => false, 'error' =>
            '파일을 찾을 수 없습니다. 삭제되었거나 탐색기에서 이름이 바뀌었을 수 있습니다'], 404);
    }
    $name = $name ?: basename($path);
    $name = str_replace(["\r", "\n", '"', '\\'], '', $name);   // 헤더 조작 방지

    // 한글 등 비ASCII 파일명을 위해 두 가지 형식을 함께 보냅니다.
    //  filename   : 옛 브라우저용 ASCII 대체 이름
    //  filename*  : UTF-8 원본 이름 (요즘 브라우저가 이쪽을 씁니다)
    $ascii = preg_replace('/[^\x20-\x7E]/', '_', $name);
    if (trim($ascii, '_ ') === '') $ascii = 'download';

    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $ascii . '"; '
         . "filename*=UTF-8''" . rawurlencode($name));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=0');

    readfile($path);
    exit;
}

/* ---------------- 삭제 ---------------- */
if ($action === 'delete') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jout(['ok' => false, 'error' => 'POST 요청만 허용됩니다'], 405);
    }

    $body = json_decode(file_get_contents('php://input'), true);
    $id = $body['fileId'] ?? '';
    if (!preg_match('/^[0-9a-f]{32}$/', $id)) {
        jout(['ok' => false, 'error' => '잘못된 파일 주소입니다'], 400);
    }

    [$path, ] = resolve_path($FILE_DIRS, $MANIFEST, $id);
    if ($path && is_file($path) && !@unlink($path)) {
        jout(['ok' => false, 'error' => '파일을 삭제하지 못했습니다 (권한 확인 필요)'], 500);
    }
    jout(['ok' => true]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다'], 400);
