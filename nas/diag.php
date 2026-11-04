<?php
/**
 * 🩺 NAS 진단 — 관리자 전용, 읽기만 (SSH 없이 웹으로 상태 확인)
 *
 *   https://<주소>/brand/diag.php        ← 허브에 '관리자'로 로그인한 상태로 열기
 *
 * 느려짐 원인을 한눈에: 부하(load) · CPU · 메모리 · 디스크 ·
 * 리버스 프록시 감시자가 nginx 를 얼마나 자주 새로고침하는지 · 로그 크기.
 * 아무것도 고치지 않습니다. 읽기만 합니다.
 */
require_once __DIR__ . '/guard.php';
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

if (!function_exists('guard_is_admin') || !guard_is_admin()) {
    http_response_code(200);
    echo "권한 없음 — 브랜드 허브에 '관리자'로 로그인한 뒤 이 주소를 여세요.\n";
    exit;
}

function sh($cmd){
    if (!function_exists('shell_exec')) return '(shell_exec 불가)';
    $out = @shell_exec($cmd . ' 2>&1');
    return $out === null ? '(실행 실패)' : rtrim((string)$out);
}
function sect($t){ echo "\n===== $t =====\n"; }

$BRAND = '/volume1/web/brand';
$WLOG  = $BRAND . '/rp-watchdog.log';

echo "🩺 NAS 진단 — " . date('Y-m-d H:i:s') . "\n";

sect('부하 (load average — 1분·5분·15분)');
echo sh('uptime') . "\n";
echo "※ 숫자가 CPU 코어 수보다 크면 밀리는 중입니다.\n";

sect('CPU 많이 쓰는 것 (상위)');
echo sh("(top -b -n 1 2>/dev/null || top -bn1 2>/dev/null) | head -n 16 | tail -n 10") . "\n";

sect('메모리');
echo sh('free -m 2>/dev/null || free 2>/dev/null') . "\n";

sect('디스크 (/volume1)');
echo sh('df -h /volume1 2>/dev/null || df -h') . "\n";
echo "※ Use% 가 95% 이상이면 디스크가 꽉 차 느려질 수 있습니다.\n";

sect('RAID / 스토리지 작업 돌고 있나 ★I/O 느려짐 1순위★');
echo sh('cat /proc/mdstat 2>/dev/null') . "\n";
echo "※ 'resync' · 'recovery' · 'check' 와 [===>.....] 진행바가 보이면\n";
echo "   RAID 작업(데이터 스크러빙/재동기화)이 디스크를 점유하는 중 = 느려짐 원인.\n";

sect('I/O 압박 지수 (있으면)');
echo sh('cat /proc/pressure/io 2>/dev/null || echo "(이 DSM 엔 없음)"') . "\n";
echo "※ avg 뒤 숫자가 클수록(수십%~) 디스크 기다림이 심한 겁니다.\n";

sect('디스크 I/O 많이 한 프로세스 (누적 읽기/쓰기 상위)');
echo sh('for p in /proc/[0-9]*; do pid=${p#/proc/}; '
      . 'rb=$(grep "^read_bytes" $p/io 2>/dev/null | awk "{print \$2}"); '
      . 'wb=$(grep "^write_bytes" $p/io 2>/dev/null | awk "{print \$2}"); '
      . '[ -n "$rb" ] && echo "$((${rb:-0}+${wb:-0})) $pid $(cat $p/comm 2>/dev/null)"; '
      . 'done 2>/dev/null | sort -rn | head -n 8 | '
      . 'awk "{printf \"%8.0f MB  pid %-7s %s\\n\", \$1/1048576, \$2, \$3}"') . "\n";
echo "※ 위에서 MB가 유난히 큰 프로세스가 디스크를 긁는 범인입니다.\n";

sect('프록시 감시자 돌고 있나');
$proc = sh("(ps -ef 2>/dev/null || ps w 2>/dev/null) | grep rp-watchdog | grep -v grep");
echo ($proc !== '' ? $proc : '(감시자 루프 안 보임 — 안 돌고 있음)') . "\n";

sect('감시자가 nginx 를 얼마나 자주 새로고침했나 ★핵심★');
if (is_file($WLOG)) {
    $all   = (string)@file_get_contents($WLOG);
    $lines = array_values(array_filter(explode("\n", $all),
                 function($l){ return strpos($l, '새로고침') !== false; }));
    echo "총 새로고침 기록: " . count($lines) . " 줄\n";
    if ($lines) {
        echo "가장 오래된: " . $lines[0] . "\n";
        echo "가장 최근:   " . $lines[count($lines) - 1] . "\n";
        echo "\n최근 10줄:\n" . implode("\n", array_slice($lines, -10)) . "\n";
    }
    echo "\n로그 크기: " . round(filesize($WLOG) / 1024, 1) . " KB\n";
    echo "※ 최근 줄들이 '15초 간격'으로 쭉 찍혀 있으면 → 프록시가 계속 틀어져\n";
    echo "   nginx 를 15초마다 새로고침하는 중 = 느려짐의 범인입니다.\n";
} else {
    echo "(rp-watchdog.log 없음 — 감시자가 아직 아무것도 안 했거나 로그 경로가 다름)\n";
}

sect('감시자 로그 파일 크기');
echo sh("ls -lh $BRAND/rp-watchdog*.log $BRAND/rp-watchdog*.out 2>/dev/null") . "\n";
echo "※ .out 이 수백 MB로 커져 있으면 그것도 부담입니다.\n";

sect('PHP 업로드/처리 한도 (저장이 되려면 자료보다 커야 함)');
echo 'post_max_size       = ' . ini_get('post_max_size') . "\n";
echo 'upload_max_filesize = ' . ini_get('upload_max_filesize') . "\n";
echo 'memory_limit        = ' . ini_get('memory_limit') . "\n";
echo 'max_execution_time  = ' . ini_get('max_execution_time') . "\n";
echo "※ 자료 파일(brand-data.php)보다 post_max_size 가 작으면 저장이 실패합니다.\n";
echo "   .user.ini 로 올렸는데도 그대로면, 아직 반영 전(최대 5분)이거나 웹서비스\n";
echo "   재시작이 필요합니다.\n";

sect('자료 파일 크기 (이것보다 post_max_size 가 커야 저장됨)');
echo sh("ls -lh $BRAND/data/brand-data.php 2>/dev/null") . "\n";

sect('NAS 검색 색인 크기');
echo sh("ls -lh $BRAND/data/nasfiles.tsv 2>/dev/null") . "\n";

echo "\n— 끝. 이 화면을 통째로 복사해 붙여 주세요. —\n";
