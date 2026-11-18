<?php
/**
 * 🧾 백업 점검 — 관리자 전용, 읽기만
 *
 *   https://<주소>/brand/bkcheck.php          ← 자료 파일 + 백업마다 할 일·프로젝트 수
 *   https://<주소>/brand/bkcheck.php?f=이름    ← 그 파일 하나를 자세히 (무엇이 큰지, 사람별 할 일 수)
 *
 * 파일 크기만으로는 「할 일이 사라졌는지」 알 수 없어서 만들었습니다.
 * 아무것도 고치지 않습니다. 되돌리기는 사람이 File Station 에서 합니다.
 */
require_once __DIR__ . '/guard.php';
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(180);
@ini_set('memory_limit', '512M');

if (!function_exists('guard_is_admin') || !guard_is_admin()) {
    echo "권한 없음 — 브랜드 허브에 '관리자'로 로그인한 뒤 이 주소를 여세요.\n";
    exit;
}

$DIR = __DIR__ . '/data';

function bk_load($path) {
    $raw = function_exists('bh_read_raw') ? bh_read_raw($path) : (string)@file_get_contents($path);
    if (!function_exists('bh_read_raw')) {
        $raw = preg_replace('/^<\?php.*?\?>\s*/s', '', $raw);
    }
    $d = json_decode($raw, true);
    return is_array($d) ? $d : null;
}
function bk_mb($n) { return number_format($n / 1048576, 1) . 'MB'; }
function bk_stat($d) {
    $o = ['rev' => $d['_rev'] ?? '-', 'brands' => 0, 'tasks' => 0, 'proj' => 0, 'open' => 0,
          'rout' => count((array)($d['routines'] ?? [])), 'who' => []];
    foreach ((array)($d['brands'] ?? []) as $b) {
        if (!is_array($b)) continue;
        $o['brands']++;
        foreach ((array)($b['tasks'] ?? []) as $t) {
            if (!is_array($t)) continue;
            $o['tasks']++;
            if (($t['kind'] ?? '') === '프로젝트') $o['proj']++;
            if (($t['status'] ?? '') !== '완료') $o['open']++;
            $w = trim((string)($t['owner'] ?? '')); if ($w === '') $w = trim((string)($t['uid'] ?? ''));
            if ($w === '') $w = '(담당 없음)';
            $o['who'][$w] = ($o['who'][$w] ?? 0) + 1;
        }
    }
    return $o;
}

/* ── 파일 하나 자세히 ── */
if (isset($_GET['f'])) {
    $name = basename((string)$_GET['f']);
    if (!preg_match('/^(brand-data|backup[-A-Za-z0-9_]*)\.php$/', $name) || !is_file("$DIR/$name")) {
        echo "그런 파일이 없습니다: $name\n"; exit;
    }
    $d = bk_load("$DIR/$name");
    if (!$d) { echo "읽지 못했습니다 (JSON 아님): $name\n"; exit; }
    $s = bk_stat($d);
    echo "🧾 $name — " . bk_mb(filesize("$DIR/$name")) . " · " . date('Y-m-d H:i', filemtime("$DIR/$name")) . "\n";
    echo "판번호 {$s['rev']} · 브랜드 {$s['brands']} · 할일 {$s['tasks']} (프로젝트 {$s['proj']}, 안 끝남 {$s['open']}) · 루틴 {$s['rout']}\n";
    echo "\n===== 무엇이 큰가 (맨 위 칸별 크기) =====\n";
    $sz = [];
    foreach ($d as $k => $v) $sz[$k] = strlen(json_encode($v, JSON_UNESCAPED_UNICODE));
    arsort($sz);
    foreach ($sz as $k => $n) printf("  %-24s %s\n", $k, bk_mb($n));
    echo "\n===== 브랜드별 =====\n";
    foreach ((array)($d['brands'] ?? []) as $b) {
        if (!is_array($b)) continue;
        printf("  %-20s 할일 %4d  · 크기 %s\n", (string)($b['name'] ?? '?'),
            count((array)($b['tasks'] ?? [])), bk_mb(strlen(json_encode($b, JSON_UNESCAPED_UNICODE))));
    }
    echo "\n===== 담당자별 할 일 수 =====\n";
    arsort($s['who']);
    foreach ($s['who'] as $w => $n) printf("  %-20s %d\n", $w, $n);
    exit;
}

/* ── 전체 목록 ── */
$files = [];
if (is_file("$DIR/brand-data.php")) $files[] = "$DIR/brand-data.php";
$bk = (array)@glob("$DIR/backup*.php");
usort($bk, function ($a, $b) { return filemtime($b) - filemtime($a); });
$files = array_merge($files, array_slice($bk, 0, 45));

echo "🧾 백업 점검 — " . date('Y-m-d H:i:s') . "\n";
echo "※ 할일 수가 갑자기 줄어든 지점이 「사라진 때」 입니다. 그 바로 앞 백업이 되돌릴 후보입니다.\n";
echo "※ 자세히: 주소 끝에 ?f=파일이름  (예: bkcheck.php?f=backup-2026-11-17.php)\n\n";
printf("%-34s %8s  %-16s %6s %5s %6s %5s %5s %5s\n", '파일', '크기', '수정', '판번호', '브랜드', '할일', '프로젝트', '안끝남', '루틴');
foreach ($files as $p) {
    $d = bk_load($p);
    $n = basename($p);
    if (!$d) { printf("%-34s %8s  %-16s  (읽지 못함)\n", $n, bk_mb(filesize($p)), date('m-d H:i', filemtime($p))); continue; }
    $s = bk_stat($d);
    unset($d);
    printf("%-34s %8s  %-16s %6s %5d %6d %5d %5d %5d\n", $n, bk_mb(filesize($p)), date('Y-m-d H:i', filemtime($p)),
        $s['rev'], $s['brands'], $s['tasks'], $s['proj'], $s['open'], $s['rout']);
}
echo "\n— 끝. 이 화면을 통째로 복사해 붙여 주세요. —\n";
