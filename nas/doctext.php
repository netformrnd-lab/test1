<?php
/**
 * 문서 안의 글자로 찾기
 *
 * 워드·엑셀·파워포인트·PDF·텍스트 파일에서 글자를 뽑아 목록을 만들고,
 * 파일 이름이 아니라 "안에 적힌 내용"으로 찾을 수 있게 합니다.
 *
 *   ?action=sample&dir=...     몇 %나 읽히는지 먼저 재봅니다
 *   ?action=start&dir=...      글자 목록 만들기 시작
 *   ?action=step               조금 더 만들기 (브라우저가 반복해서 부릅니다)
 *   ?action=status             지금 상태
 *   ?action=cancel             중단
 *   ?action=search&q=검색어    내용으로 찾기
 *   ?action=check              목록 상태
 *
 * 원본 파일은 읽기만 하며 고치지 않습니다.
 */

/* 로그인한 사람만 통과합니다 (계정을 안 만들었으면 예전처럼 누구나) */
if (is_file(__DIR__ . '/guard.php')) require_once __DIR__ . '/guard.php';   // 파일이 아직 안 왔으면 예전처럼 동작합니다

header('Content-Type: application/json; charset=utf-8');
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
@set_time_limit(0);
@ini_set('memory_limit', '512M');

ob_start();
register_shutdown_function(function () {
    $e = error_get_last();
    $fatal = $e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
    if (!ob_get_level()) return;
    if ($fatal) {
        ob_end_clean();
        if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '서버 오류: ' . $e['message']
            . ' (' . basename($e['file']) . ' ' . $e['line'] . '줄)'], JSON_UNESCAPED_UNICODE);
    } else {
        ob_end_flush();
    }
});

$DATA     = __DIR__ . '/data';
$LIST     = $DATA . '/nasfiles.tsv';      // scan 이 만든 파일 목록
$ROOTF    = $DATA . '/nasroot.txt';
$OUT      = $DATA . '/doctext.tsv';       // 뽑아낸 글자
$TMP      = $OUT . '.part';
$QUEUE    = $DATA . '/docqueue.txt';
$STATE    = $DATA . '/docstate.json';

$SECONDS_PER_STEP = 3.0;
$MAX_TEXT   = 120000;                     // 문서 하나에서 담아둘 글자 수
$MAX_FILE   = 60 * 1024 * 1024;           // 이보다 큰 파일은 건너뜁니다

/* 글자를 뽑을 수 있는 형식 */
$OFFICE = ['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm'];
$PLAIN  = ['txt', 'csv', 'md', 'log', 'json', 'xml', 'html', 'htm'];
$KNOWN  = array_merge($OFFICE, $PLAIN, ['pdf']);

function jout($a, $code = 200) {
    http_response_code(200);            // 웹 스테이션이 오류 응답 내용을 바꿔치기 하므로 항상 200
    if ($code !== 200 && is_array($a) && !isset($a['status'])) $a['status'] = $code;
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
    exit;
}

function human($b) {
    if ($b < 1024) return $b . ' B';
    if ($b < 1048576) return round($b / 1024) . ' KB';
    if ($b < 1073741824) return round($b / 1048576, 1) . ' MB';
    return round($b / 1073741824, 2) . ' GB';
}

/* ---------- 순수 PHP 압축 풀기 (zlib 도 없는 서버용) ----------
   RFC 1951 (DEFLATE). zlib 이 있으면 이 클래스는 안 씁니다.
   시놀로지 PHP 프로필에서 zlib 이 꺼져 있거나 disable_functions 로
   gzinflate 가 막혀 있어도 워드·엑셀·PPT 를 열 수 있게 하는 마지막 길입니다. */
class NfInflate {
    private $in, $inlen, $incnt = 0, $bitbuf = 0, $bitcnt = 0, $out = '', $max;
    private static $fixL = null, $fixD = null;
    private static $LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,
                             67,83,99,115,131,163,195,227,258];
    private static $LEXT  = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    private static $DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,
                             1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    private static $DEXT  = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    private static $ORD   = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

    private function __construct($in, $max) {
        $this->in = $in; $this->inlen = strlen($in); $this->max = $max;
    }
    /** 풀어서 돌려줍니다. 못 풀면 false. */
    public static function run($in, $max = 16777216) {
        $p = new self($in, $max);
        try { if (!$p->blocks()) return false; } catch (Throwable $e) { return false; }
        return $p->out;
    }

    private function bits($need) {
        if ($need === 0) return 0;
        $val = $this->bitbuf;
        while ($this->bitcnt < $need) {
            if ($this->incnt >= $this->inlen) throw new Exception('짧음');
            $val |= ord($this->in[$this->incnt++]) << $this->bitcnt;
            $this->bitcnt += 8;
        }
        $this->bitbuf = $val >> $need;
        $this->bitcnt -= $need;
        return $val & ((1 << $need) - 1);
    }

    private function blocks() {
        do {
            $last = $this->bits(1);
            $type = $this->bits(2);
            if      ($type === 0) $this->stored();
            else if ($type === 1) $this->codes(self::fixedL(), self::fixedD());
            else if ($type === 2) $this->dynamic();
            else return false;
            if (strlen($this->out) > $this->max) return false;
        } while (!$last);
        return true;
    }

    private function stored() {
        $this->bitbuf = 0; $this->bitcnt = 0;
        if ($this->incnt + 4 > $this->inlen) throw new Exception('짧음');
        $len = ord($this->in[$this->incnt]) | (ord($this->in[$this->incnt + 1]) << 8);
        $this->incnt += 4;
        if ($this->incnt + $len > $this->inlen) throw new Exception('짧음');
        $this->out .= substr($this->in, $this->incnt, $len);
        $this->incnt += $len;
    }

    /* 허프만 표 만들기 — 길이 배열에서 (기준: puff.c) */
    private static function build($lengths, $n) {
        $count = array_fill(0, 16, 0);
        for ($i = 0; $i < $n; $i++) $count[$lengths[$i]]++;
        $offs = array_fill(0, 16, 0);
        for ($len = 1; $len < 15; $len++) $offs[$len + 1] = $offs[$len] + $count[$len];
        $symbol = array_fill(0, $n, 0);
        for ($i = 0; $i < $n; $i++) if ($lengths[$i] !== 0) $symbol[$offs[$lengths[$i]]++] = $i;
        return ['count' => $count, 'symbol' => $symbol];
    }
    private static function fixedL() {
        if (self::$fixL === null) {
            $l = [];
            for ($i = 0;   $i < 144; $i++) $l[$i] = 8;
            for (         ; $i < 256; $i++) $l[$i] = 9;
            for (         ; $i < 280; $i++) $l[$i] = 7;
            for (         ; $i < 288; $i++) $l[$i] = 8;
            self::$fixL = self::build($l, 288);
        }
        return self::$fixL;
    }
    private static function fixedD() {
        if (self::$fixD === null) self::$fixD = self::build(array_fill(0, 30, 5), 30);
        return self::$fixD;
    }

    /* 한 글자(또는 길이) 읽기 — 비트를 여기서 직접 다룹니다 (속도) */
    private function decode($h) {
        $count = $h['count']; $symbol = $h['symbol'];
        $code = 0; $first = 0; $index = 0;
        $buf = $this->bitbuf; $cnt = $this->bitcnt;
        for ($len = 1; $len <= 15; $len++) {
            if ($cnt < 1) {
                if ($this->incnt >= $this->inlen) {
                    $this->bitbuf = $buf; $this->bitcnt = $cnt; throw new Exception('짧음');
                }
                $buf |= ord($this->in[$this->incnt++]) << $cnt;
                $cnt += 8;
            }
            $code |= $buf & 1; $buf >>= 1; $cnt--;
            $c = $count[$len];
            if ($code - $c < $first) {
                $this->bitbuf = $buf; $this->bitcnt = $cnt;
                return $symbol[$index + ($code - $first)];
            }
            $index += $c; $first = ($first + $c) << 1; $code <<= 1;
        }
        $this->bitbuf = $buf; $this->bitcnt = $cnt;
        throw new Exception('코드 오류');
    }

    private function codes($lh, $dh) {
        while (true) {
            $sym = $this->decode($lh);
            if ($sym < 256) { $this->out .= chr($sym); }
            else if ($sym === 256) return;
            else {
                $sym -= 257;
                if ($sym >= 29) throw new Exception('길이 오류');
                $len  = self::$LBASE[$sym] + $this->bits(self::$LEXT[$sym]);
                $s2   = $this->decode($dh);
                if ($s2 >= 30) throw new Exception('거리 오류');
                $dist = self::$DBASE[$s2] + $this->bits(self::$DEXT[$s2]);
                $olen = strlen($this->out);
                if ($dist > $olen) throw new Exception('거리 큼');
                if ($dist >= $len) {
                    $this->out .= substr($this->out, $olen - $dist, $len);
                } else {
                    // 앞 글자를 되풀이해 채웁니다 (겹치는 복사)
                    $chunk = substr($this->out, $olen - $dist);
                    $this->out .= substr(str_repeat($chunk, (int)ceil($len / $dist)), 0, $len);
                }
            }
            if (strlen($this->out) > $this->max) throw new Exception('너무 큼');
        }
    }

    private function dynamic() {
        $nlen  = $this->bits(5) + 257;
        $ndist = $this->bits(5) + 1;
        $ncode = $this->bits(4) + 4;
        if ($nlen > 286 || $ndist > 30) throw new Exception('갯수 오류');
        $lengths = array_fill(0, 320, 0);
        for ($i = 0; $i < $ncode; $i++) $lengths[self::$ORD[$i]] = $this->bits(3);
        for (      ; $i < 19;     $i++) $lengths[self::$ORD[$i]] = 0;
        $lencode = self::build($lengths, 19);
        $index = 0;
        while ($index < $nlen + $ndist) {
            $sym = $this->decode($lencode);
            if ($sym < 16) { $lengths[$index++] = $sym; continue; }
            $len = 0;
            if ($sym === 16) {
                if ($index === 0) throw new Exception('반복 오류');
                $len = $lengths[$index - 1];
                $sym = 3 + $this->bits(2);
            } else if ($sym === 17) $sym = 3  + $this->bits(3);
            else                    $sym = 11 + $this->bits(7);
            if ($index + $sym > $nlen + $ndist) throw new Exception('넘침');
            while ($sym--) $lengths[$index++] = $len;
        }
        $this->codes(self::build(array_slice($lengths, 0, $nlen), $nlen),
                     self::build(array_slice($lengths, $nlen, $ndist), $ndist));
    }
}

/* 눌러 담긴 것을 풉니다 — zlib 이 있으면 그것으로, 없으면 순수 PHP 로 */
function nf_inflate($d) {
    if (function_exists('gzinflate')) { $r = @gzinflate($d); if ($r !== false) return $r; }
    return NfInflate::run($d);
}
function nf_uncompress($d) {                       // zlib 머리(2바이트)가 붙은 것
    if (function_exists('gzuncompress')) { $r = @gzuncompress($d); if ($r !== false) return $r; }
    return NfInflate::run(substr($d, 2));
}

/* ---------- 워드·엑셀·파워포인트 ---------- */
$OFFICE_WHY = '';          // 못 읽었을 때 왜 못 읽었는지 (화면에 그대로 보여줍니다)

/* 우리가 볼 조각인지 */
function office_wanted($nm) {
    return (bool)preg_match('#^(word/document|word/footnotes|word/endnotes'
        . '|xl/sharedStrings|xl/worksheets/sheet[0-9]+'
        . '|ppt/slides/slide[0-9]+|ppt/notesSlides/notesSlide[0-9]+)#', $nm);
}

/* zip 확장 없이 직접 풀어 읽습니다.
   시놀로지 Web Station 의 PHP 프로필은 zip 확장이 꺼져 있는 경우가 많습니다.
   워드·엑셀·PPT 는 그냥 zip 이라, 목록을 직접 읽고 gzinflate 로 풀면
   서버 설정을 건드리지 않고도 열 수 있습니다. (zlib 은 PHP 기본입니다)   */
function zip_parts_raw($file, $deadline) {
    global $OFFICE_WHY;
    $raw = @file_get_contents($file);
    if ($raw === false) { $OFFICE_WHY = '파일을 읽지 못했습니다.'; return null; }
    $len = strlen($raw);
    if ($len < 22 || substr($raw, 0, 2) !== 'PK') {
        $OFFICE_WHY = '엑셀·워드 파일이 아니거나 깨진 파일입니다.';
        return null;
    }
    // 맨 끝의 「목록 끝 표시」 를 뒤에서부터 찾습니다 (뒤에 주석이 붙어 있어도 되게)
    $eo = -1;
    $from = max(0, $len - 66000);
    for ($q = $len - 22; $q >= $from; $q--) {
        if ($raw[$q] === 'P' && substr($raw, $q, 4) === "PK\x05\x06") { $eo = $q; break; }
    }
    if ($eo < 0) {
        $OFFICE_WHY = '파일 안의 목록을 찾지 못했습니다. 받다가 끊긴 파일일 수 있습니다.';
        return null;
    }
    $cnt   = unpack('v', substr($raw, $eo + 10, 2))[1];
    $cdOff = unpack('V', substr($raw, $eo + 16, 4))[1];
    if ($cdOff <= 0 || $cdOff >= $len) {
        $OFFICE_WHY = '파일이 너무 크거나(4GB 이상) 형식이 달라 목록을 읽지 못했습니다.';
        return null;
    }
    $out = [];
    $p = $cdOff;
    for ($i = 0; $i < $cnt && $i < 3000; $i++) {
        if (microtime(true) > $deadline) break;
        if ($p + 46 > $len || substr($raw, $p, 4) !== "PK\x01\x02") break;
        $method = unpack('v', substr($raw, $p + 10, 2))[1];   // 0 그대로 · 8 눌러 담음
        $csize  = unpack('V', substr($raw, $p + 20, 4))[1];
        $nlen   = unpack('v', substr($raw, $p + 28, 2))[1];
        $elen   = unpack('v', substr($raw, $p + 30, 2))[1];
        $clen   = unpack('v', substr($raw, $p + 32, 2))[1];
        $lofs   = unpack('V', substr($raw, $p + 42, 4))[1];
        $nm     = substr($raw, $p + 46, $nlen);
        $p     += 46 + $nlen + $elen + $clen;
        if (!office_wanted($nm)) continue;
        if ($csize <= 0 || $csize > 64 * 1024 * 1024) continue;
        if ($lofs + 30 > $len || substr($raw, $lofs, 4) !== "PK\x03\x04") continue;
        $lnl  = unpack('v', substr($raw, $lofs + 26, 2))[1];
        $lel  = unpack('v', substr($raw, $lofs + 28, 2))[1];
        $at   = $lofs + 30 + $lnl + $lel;
        if ($at + $csize > $len) continue;
        $data = substr($raw, $at, $csize);
        if ($method === 8) {
            // zlib 이 있으면 그것으로, 없으면 순수 PHP 로 풉니다
            $data = nf_inflate($data);
            if ($data === false) continue;
        }
        else if ($method !== 0) continue;                    // 다른 방식은 건너뜁니다
        $out[] = [$nm, $data];
    }
    if (!$out) $OFFICE_WHY = '파일 안에서 글자가 들어 있는 부분을 찾지 못했습니다.';
    return $out;
}

/* 파일 안에서 볼 조각만 뽑아 옵니다 — zip 확장이 있으면 그것으로, 없으면 직접 */
function office_parts($file, $deadline) {
    global $OFFICE_WHY;
    // 클래스만 있고 알맹이가 없는 경우도 있어서 open 까지 확인합니다
    if (!class_exists('ZipArchive') || !method_exists('ZipArchive', 'open')) {
        return zip_parts_raw($file, $deadline);
    }
    try { $z = new ZipArchive; } catch (Throwable $e) { return zip_parts_raw($file, $deadline); }
    if (@$z->open($file) !== true) {
        // zip 확장이 못 열어도 직접 한 번 더 해 봅니다
        $r = zip_parts_raw($file, $deadline);
        if ($r === null && $OFFICE_WHY === '') {
            $OFFICE_WHY = '파일을 여는 데 실패했습니다. 받다가 끊겼거나 깨진 파일일 수 있습니다.'
                        . "\n" . '다시 올려 보시고, 그래도 안 되면 다른 이름으로 저장해 보세요.';
        }
        return $r;
    }
    $out = [];
    try {
        $cnt = min($z->numFiles, 3000);                    // 칸 수 (예전에는 $n 을 아래에서
        for ($i = 0; $i < $cnt; $i++) {                    //  덮어써서 이 한도가 안 먹었습니다)
            if (microtime(true) > $deadline) break;
            $nm = $z->getNameIndex($i);
            if ($nm === false) break;
            if (!office_wanted($nm)) continue;
            $x = $z->getFromIndex($i);
            if ($x !== false) $out[] = [$nm, $x];
        }
        $z->close();
    } catch (Throwable $e) { return zip_parts_raw($file, $deadline); }
    if (!$out) return zip_parts_raw($file, $deadline);      // 못 찾았으면 직접 한 번 더
    return $out;
}

function office_text($file, $max, $deadline = null) {
    global $OFFICE_WHY;
    $OFFICE_WHY = '';
    if ($deadline === null) $deadline = microtime(true) + 8;
    $parts = office_parts($file, $deadline);
    if ($parts === null) return null;
    $out = '';
    foreach ($parts as $pt) {
        if (microtime(true) > $deadline) break;
        list($nm, $x) = $pt;
        /* 엑셀은 글자를 두 가지로 저장합니다.
             · 공유 문자열표 (xl/sharedStrings.xml)  — 엑셀이 보통 쓰는 방식
             · 시트 안에 그대로 (inlineStr)          — 구글 시트 내려받기 · 일부 도구
           앞의 것만 읽고 있어서, 뒤의 방식으로 저장된 파일은 다 채워져 있어도
           「글자를 뽑지 못했습니다」 가 났습니다. */
        if (strpos($nm, 'xl/worksheets/sheet') === 0) {
            // 시트에서는 칸에 박힌 글자만 꺼냅니다 (서식·수식 찌꺼기를 안 담게)
            if (!preg_match_all('#<t(?:\s[^>]*)?>(.*?)</t>#s', $x, $mm)) continue;
            $x = implode("\n", $mm[1]);
        }
        $r = preg_replace('#<[^>]+>#', ' ', $x);           // 태그를 공백으로 (/u 없이 — 실패 안 하게)
        if ($r !== null) $x = $r;
        $out .= ' ' . html_entity_decode($x, ENT_QUOTES | ENT_XML1, 'UTF-8');
        if (strlen($out) > $max) break;
    }
    return $out;
}

/* ---------- PDF (글자층이 있는 경우) ----------
   예전에는 정규식 하나로 stream…endstream 을 통째로 잡았는데,
   1MB 만 넘어가도 PCRE 되돌이 한계에 걸려 그냥 실패했습니다
   (= 큰 PDF 는 글자가 있어도 전부 "글자없음" 으로 넘어갔습니다).
   지금은 strpos 로 한 번만 훑어서 크기와 상관없이 안전합니다.        */
function pdf_streams($raw, $maxBody, $deadline) {
    $out = ''; $pos = 0; $n = 0; $len = strlen($raw);
    while ($n < 600 && $pos < $len) {
        if (microtime(true) > $deadline) break;
        $s = strpos($raw, 'stream', $pos);
        if ($s === false) break;
        $e = strpos($raw, 'endstream', $s + 6);
        if ($e === false) break;
        $from = $s + 6;
        if (isset($raw[$from]) && $raw[$from] === "\r") $from++;
        if (isset($raw[$from]) && $raw[$from] === "\n") $from++;
        $chunk = substr($raw, $from, $e - $from);
        $pos = $e + 9; $n++;
        if ($chunk === '' || strlen($chunk) > 4 * 1024 * 1024) continue;   // 그림 덩어리는 건너뜁니다
        $d = nf_uncompress($chunk);
        if ($d === false) $d = nf_inflate($chunk);
        if ($d === false) $d = nf_inflate(substr($chunk, 2));
        if ($d === false) $d = $chunk;
        if (strpos($d, 'Tj') === false && strpos($d, 'TJ') === false) continue;
        $out .= $d;
        if (strlen($out) > $maxBody) break;
    }
    return $out;
}

/* PDF 내용에서 ( … ) 안의 글자를 꺼냅니다. 정규식 없이 한 번만 훑습니다. */
function pdf_strings($body, $max) {
    $txt = ''; $len = strlen($body); $i = 0;
    while ($i < $len) {
        $o = strpos($body, '(', $i);
        if ($o === false) break;
        $j = $o + 1; $depth = 1; $buf = '';
        while ($j < $len) {
            $c = $body[$j];
            if ($c === '\\') {
                $nx = $j + 1 < $len ? $body[$j + 1] : '';
                $buf .= ($nx === 'n' || $nx === 'r' || $nx === 't') ? ' ' : $nx;
                $j += 2; continue;
            }
            if ($c === '(') { $depth++; $buf .= $c; $j++; continue; }
            if ($c === ')') { $depth--; if ($depth === 0) { $j++; break; } $buf .= $c; $j++; continue; }
            $buf .= $c; $j++;
        }
        $txt .= $buf . ' ';
        $i = max($j, $o + 1);
        if (strlen($txt) > $max) break;
    }
    return $txt;
}

function pdf_text($file, $max, $deadline = null) {
    if ($deadline === null) $deadline = microtime(true) + 8;
    $raw = @file_get_contents($file, false, null, 0, 12 * 1024 * 1024);
    if ($raw === false) return null;
    $body = pdf_streams($raw, $max * 3, $deadline);
    unset($raw);
    if ($body === '') return '';
    return pdf_strings($body, $max);
}

/* ---------- 형식에 맞게 글자 뽑기 ---------- */
function extract_text($file, $ext, $max, $deadline = null) {
    global $OFFICE, $PLAIN;
    if ($deadline === null) $deadline = microtime(true) + 8;
    if (in_array($ext, $OFFICE, true)) return office_text($file, $max, $deadline);
    if (in_array($ext, $PLAIN, true)) {
        // 한글은 한 글자가 3 byte 라, byte 로 자르면 마지막 글자가 반토막 납니다.
        // 넉넉히 읽은 뒤 글자 경계에서 자릅니다.
        $t = @file_get_contents($file, false, null, 0, $max * 4);
        if ($t === false) return null;
        if (!mb_check_encoding($t, 'UTF-8')) {
            $conv = @mb_convert_encoding($t, 'UTF-8', 'UTF-8,CP949,EUC-KR');
            if ($conv !== false) $t = $conv;
        }
        $t = mb_strcut($t, 0, $max * 3, 'UTF-8');
        if ($ext === 'html' || $ext === 'htm' || $ext === 'xml') {
            $r = preg_replace('#<[^>]+>#u', ' ', $t);
            if ($r !== null) $t = $r;
        }
        return $t;
    }
    if ($ext === 'pdf') return pdf_text($file, $max, $deadline);
    return null;
}

/* 뽑은 글자가 사람이 읽을 만한지 봅니다.
   PDF 는 글꼴 방식에 따라 깨진 기호만 나오기도 해서 걸러냅니다. */
function text_quality($t) {
    $t = trim($t);
    if ($t === '') return 0.0;
    $len = mb_strlen($t, 'UTF-8');
    if ($len < 1) return 0.0;
    preg_match_all('/[가-힣a-zA-Z0-9]/u', $t, $m);
    return count($m[0]) / $len;
}

function tidy_text($t, $max) {
    // 글자를 byte 로 자르면 한글 한 글자가 반토막 나고,
    // 그러면 /u 정규식이 통째로 실패해서(null) 내용이 전부 사라졌습니다.
    // 그래서 먼저 깨진 부분을 걷어내고 시작합니다.
    if (!mb_check_encoding($t, 'UTF-8')) {
        $t = @mb_convert_encoding($t, 'UTF-8', 'UTF-8');
        if ($t === false) $t = '';
    }
    $r = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', ' ', $t);
    if ($r !== null) $t = $r;                      // 그래도 실패하면 원본을 씁니다
    $r = preg_replace('/\s+/u', ' ', $t);
    if ($r !== null) $t = $r;
    $t = trim($t);
    if (mb_strlen($t, 'UTF-8') > $max) $t = mb_substr($t, 0, $max, 'UTF-8');
    return $t;
}

/** 읽은 결과를 한 줄로 정리합니다 */
function read_one($path, $maxText, $maxFile, $perFile = 8.0) {
    $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $size = @filesize($path);
    if ($size === false || !is_file($path)) return ['상태' => '없음', 'text' => '', 'ext' => $ext];
    if ($size > $maxFile) return ['상태' => '너무큼', 'text' => '', 'ext' => $ext];

    // 파일 하나가 오래 붙잡으면 웹 서버가 통째로 끊어버립니다(500).
    // 그래서 파일마다 시간 제한을 두고, 넘으면 그 파일만 건너뜁니다.
    $deadline = microtime(true) + $perFile;
    try {
        $raw = @extract_text($path, $ext, $maxText, $deadline);
    } catch (Throwable $e) {
        return ['상태' => '읽기오류', 'text' => '', 'ext' => $ext];
    }
    if ($raw === null) return ['상태' => '지원안함', 'text' => '', 'ext' => $ext];

    $t = tidy_text($raw, $maxText);
    $q = text_quality($t);
    if (mb_strlen($t, 'UTF-8') < 20 || $q < 0.35) {
        return ['상태' => '글자없음', 'text' => '', 'ext' => $ext, '품질' => round($q, 2)];
    }
    return ['상태' => '읽음', 'text' => $t, 'ext' => $ext, '품질' => round($q, 2)];
}

/** 파일 목록에서 글자를 뽑을 만한 파일들을 골라옵니다 */
function candidates($listFile, $dir, $known) {
    $out = [];
    if (!is_file($listFile)) return $out;
    $fp = fopen($listFile, 'r');
    if (!$fp) return $out;
    $prefix = $dir !== '' ? rtrim($dir, '/') . '/' : '';
    $preLen = strlen($prefix);
    while (($line = fgets($fp)) !== false) {
        $p = explode("\t", rtrim($line, "\r\n"), 3);
        if (count($p) < 3) continue;
        if ($prefix !== '' && strncmp($p[2], $prefix, $preLen) !== 0) continue;
        $ext = strtolower(pathinfo($p[2], PATHINFO_EXTENSION));
        if (!in_array($ext, $known, true)) continue;
        $out[] = $p[2];
    }
    fclose($fp);
    return $out;
}

/* shell_exec 이 막혀 있는 NAS 도 있어서 직접 셉니다 */
function count_lines($f) {
    $n = 0; $fp = @fopen($f, 'r');
    if (!$fp) return 0;
    while (!feof($fp)) { $n += substr_count((string)fread($fp, 1 << 20), "\n"); }
    fclose($fp);
    return $n;
}

function load_state($f) {
    if (!is_file($f)) return null;
    $s = json_decode(file_get_contents($f), true);
    return is_array($s) ? $s : null;
}
function save_state($f, $s) { file_put_contents($f, json_encode($s, JSON_UNESCAPED_UNICODE)); }

function progress($st) {
    return [
        'ok' => true,
        '진행'    => $st['done'] ? '완료' : '진행 중',
        'done'    => (bool)$st['done'],
        '전체'    => $st['total'],
        '살펴본수' => $st['seen'],
        '읽은수'   => $st['read'],
        '못읽은수' => $st['fail'],
        '지금파일' => $st['current'],
        '걸린시간' => round(microtime(true) - $st['started']) . '초',
    ];
}

$action = $_GET['action'] ?? '';

/* ---------------- 문서 한 장의 글자 ----------------
   ?action=one&path=아파트스퀘어/02_브랜드기록부/2026/….pdf
   기획서로 올린 문서에서 글자를 뽑아 돌려줍니다 (연혁 라인 자동 채우기용).
   경로는 「올린 파일 폴더」(uploadroot) 기준입니다. 그 안쪽만 읽습니다.
   원본은 읽기만 하며 고치지 않습니다.
   -------------------------------------------------- */
if ($action === 'one') {
    $upF  = $DATA . '/uploadroot.txt';
    $base = is_file($upF) ? rtrim(trim((string)@file_get_contents($upF)), '/') : '';
    if ($base === '' || !is_dir($base)) {
        jout(['ok' => false, 'error' => '올린 파일 폴더를 아직 정하지 않았습니다.'], 400);
    }
    $rel = str_replace('\\', '/', trim((string)($_GET['path'] ?? '')));
    if ($rel === '' || strpos($rel, '..') !== false) {
        jout(['ok' => false, 'error' => '파일 경로가 올바르지 않습니다.'], 400);
    }
    $file = @realpath($base . '/' . ltrim($rel, '/'));
    $root = @realpath($base);
    if (!$file || !$root || strpos($file, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) {
        jout(['ok' => false, 'error' => '그런 파일이 없습니다: ' . $rel], 404);
    }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if (!in_array($ext, $KNOWN, true)) {
        jout(['ok' => false, 'error' =>
            '.' . $ext . ' 은 글자를 뽑을 수 없는 형식입니다.' . "\n\n"
            . '읽을 수 있는 것: ' . implode(' · ', $KNOWN) . "\n"
            . '한글(.hwp)은 아직 못 읽습니다 — PDF 로 내보내 올려주세요.'], 415);
    }
    $t = extract_text($file, $ext, $MAX_TEXT, microtime(true) + 20);
    if ($t === null) {
        $why = (string)($GLOBALS['OFFICE_WHY'] ?? '');
        jout(['ok' => false, 'error' => '이 파일에서 글자를 뽑지 못했습니다.'
              . ($why !== '' ? "\n\n" . $why : '')], 422);
    }
    $t = tidy_text($t, $MAX_TEXT);
    $q = text_quality($t);
    if (trim($t) === '' || $q < 0.25) {
        jout(['ok' => false, 'error' =>
            '글자가 거의 안 읽힙니다 (읽힌 정도 ' . round($q * 100) . '%).' . "\n\n"
            . ($ext === 'xlsx' || $ext === 'xlsm'
                ? '엑셀인데 칸이 전부 비어 있거나, 글자가 그림으로 들어가 있습니다. '
                  . '칸에 글자로 적힌 파일로 다시 올려주세요.'
                : '그림으로 스캔한 PDF 이거나 글꼴이 특수한 문서일 수 있습니다. '
                  . '글자로 된 문서로 다시 올려주세요.')], 422);
    }
    jout(['ok' => true, '글자' => $t, '글자수' => mb_strlen($t, 'UTF-8'),
          '읽힌정도' => round($q, 3), '파일' => basename($file)]);
}

/* ---------------- 목록 상태 ---------------- */
if ($action === 'check') {
    jout([
        'ok'       => is_file($OUT),
        '글자목록'  => is_file($OUT) ? '있음' : '없음 — 먼저 만들어 주세요',
        '문서수'    => is_file($OUT) ? count_lines($OUT) : 0,
        '목록크기'  => is_file($OUT) ? human(filesize($OUT)) : '-',
        '만든시각'  => is_file($OUT) ? date('c', filemtime($OUT)) : null,
        '만드는중'  => is_file($STATE) ? '예' : '아니오',
        'zip기능'   => (class_exists('ZipArchive') && method_exists('ZipArchive','open')) ? '있음' : '없음 — 직접 풀어 읽습니다 (워드·엑셀·PPT 다 됩니다)',
        'zlib기능'  => function_exists('gzinflate') ? '있음' : '없음 — 순수 PHP 로 풉니다 (느리지만 됩니다)',
    ]);
}

/* ---------------- 이 NAS 가 뭘 할 수 있는지 (문제 생겼을 때 확인용) ---------------- */
if ($action === 'selftest') {
    $t0  = microtime(true);
    $all = candidates($LIST, '', $KNOWN);

    // 형식마다 하나씩만 실제로 읽어봅니다 (3초 안에)
    $byExt = [];
    foreach ($all as $p) {
        $e = strtolower(pathinfo($p, PATHINFO_EXTENSION));
        if (!isset($byExt[$e])) $byExt[$e] = $p;
    }
    $tried = [];
    $deadline = microtime(true) + 3;
    foreach ($byExt as $e => $p) {
        if (microtime(true) > $deadline) break;
        $s0 = microtime(true);
        $r  = read_one($p, 2000, 16 * 1024 * 1024, 1.5);
        $tried[] = ['형식' => $e, '상태' => $r['상태'],
                    '걸린시간' => round(microtime(true) - $s0, 2) . '초',
                    '파일' => basename($p)];
    }

    jout([
        'ok' => true,
        'PHP'          => PHP_VERSION,
        'zip기능'      => (class_exists('ZipArchive') && method_exists('ZipArchive','open')) ? '있음' : '없음 — 직접 풀어 읽습니다 (워드·엑셀·PPT 다 됩니다)',
        'zlib'         => function_exists('gzinflate') ? '있음' : '없음 — 순수 PHP 로 풉니다 (느리지만 됩니다)',
        'mbstring'     => function_exists('mb_strcut') ? '있음' : '없음 (한글이 깨집니다)',
        'shell_exec'   => function_exists('shell_exec') && !in_array('shell_exec',
                            array_map('trim', explode(',', (string)ini_get('disable_functions'))), true)
                            ? '됨' : '막힘 (없어도 괜찮습니다)',
        '메모리한도'    => ini_get('memory_limit'),
        'PCRE되돌이한도' => ini_get('pcre.backtrack_limit'),
        '실행시간한도'   => ini_get('max_execution_time') . '초 (웹서버 쪽 한도는 따로입니다)',
        '파일목록'      => is_file($LIST) ? '있음 (' . human(filesize($LIST)) . ')'
                                          : '없음 — 먼저 [🔎 목록 다시 만들기]',
        '문서후보수'    => count($all),
        '글자목록'      => is_file($OUT) ? '있음 (' . human(filesize($OUT)) . ', '
                                          . count_lines($OUT) . '개)' : '없음',
        '형식별시험'    => $tried,
        '걸린시간'      => round(microtime(true) - $t0, 2) . '초',
    ]);
}

/* ---------------- 얼마나 읽히는지 재보기 ---------------- */
if ($action === 'sample') {
    $dir = rtrim(trim($_GET['dir'] ?? ''), '/');
    $n   = min(max((int)($_GET['n'] ?? 30), 5), 100);

    $all = candidates($LIST, $dir, $KNOWN);
    if (!count($all)) {
        jout(['ok' => false, 'error' =>
            '글자를 뽑을 만한 문서를 찾지 못했습니다. 먼저 [🔎 목록 다시 만들기] 를 해주세요.'], 404);
    }

    // 형식별로 고르게 뽑습니다.
    // 한 형식이 압도적으로 많으면 그것만 뽑혀서 결과가 왜곡되기 때문입니다.
    $byExtAll = [];
    foreach ($all as $p) {
        $e = strtolower(pathinfo($p, PATHINFO_EXTENSION));
        $byExtAll[$e][] = $p;
    }
    $kinds = count($byExtAll);
    $per   = max(3, (int)ceil($n / max(1, $kinds)));
    $pick  = [];
    foreach ($byExtAll as $e => $list) {
        shuffle($list);
        foreach (array_slice($list, 0, $per) as $p) $pick[] = $p;
    }
    shuffle($pick);
    if (count($pick) > $n) $pick = array_slice($pick, 0, $n);

    // 맛보기는 반드시 몇 초 안에 끝나야 합니다.
    // 시간이 없으면 웹 서버가 통째로 끊어버리고 500 이 뜹니다.
    $budget   = min(max((float)($_GET['sec'] ?? 6), 2), 20);
    $deadline = microtime(true) + $budget;
    $SAMPLE_MAX_FILE = 16 * 1024 * 1024;      // 맛보기는 큰 파일까지 안 봅니다

    $byExt = [];
    $rows  = [];
    $stopped = false;
    foreach ($pick as $p) {
        if (microtime(true) > $deadline) { $stopped = true; break; }
        $r = read_one($p, 4000, $SAMPLE_MAX_FILE, 2.5);
        $e = $r['ext'];
        if (!isset($byExt[$e])) $byExt[$e] = ['전체' => 0, '읽음' => 0];
        $byExt[$e]['전체']++;
        if ($r['상태'] === '읽음') $byExt[$e]['읽음']++;
        $rows[] = [
            '이름'   => basename($p),
            '형식'   => $e,
            '상태'   => $r['상태'],
            '맛보기' => $r['상태'] === '읽음' ? mb_substr($r['text'], 0, 90, 'UTF-8') : '',
        ];
    }
    $read = count(array_filter($rows, function ($r) { return $r['상태'] === '읽음'; }));

    $extList = [];
    foreach ($byExt as $e => $v) {
        $extList[] = ['형식' => $e, '전체' => $v['전체'], '읽음' => $v['읽음'],
                      '비율' => $v['전체'] ? round($v['읽음'] / $v['전체'] * 100) : 0,
                      '전체문서수' => count($byExtAll[$e] ?? [])];
    }
    usort($extList, function ($a, $b) { return $b['전체'] - $a['전체']; });

    jout([
        'ok' => true,
        '대상문서수' => count($all),
        '뽑아본수'   => count($rows),
        '읽힌수'     => $read,
        '읽힌비율'   => count($rows) ? round($read / count($rows) * 100) : 0,
        '형식별'     => $extList,
        '표본'       => $rows,
        '시간초과'   => $stopped,
        '안내'       => $stopped
            ? '시간이 다 돼서 ' . count($rows) . '개만 봤습니다. 결과는 그만큼의 비율입니다.'
            : null,
    ]);
}

/* ---------------- 만들기 시작 ---------------- */
if ($action === 'start') {
    $dir = rtrim(trim($_GET['dir'] ?? ''), '/');
    $all = candidates($LIST, $dir, $KNOWN);
    if (!count($all)) {
        jout(['ok' => false, 'error' =>
            '글자를 뽑을 만한 문서가 없습니다. 먼저 [🔎 목록 다시 만들기] 를 해주세요.'], 404);
    }
    if (!is_dir($DATA) && !@mkdir($DATA, 0775, true)) {
        jout(['ok' => false, 'error' => 'data 폴더를 만들 수 없습니다'], 500);
    }
    if (@file_put_contents($TMP, '') === false) {
        jout(['ok' => false, 'error' => 'data 폴더에 쓸 수 없습니다 (권한 확인)'], 500);
    }
    file_put_contents($QUEUE, implode("\n", $all) . "\n");

    $st = ['dir' => $dir, 'qpos' => 0, 'total' => count($all), 'seen' => 0,
           'read' => 0, 'fail' => 0, 'current' => '', 'started' => microtime(true), 'done' => false];
    save_state($STATE, $st);
    jout(progress($st));
}

/* ---------------- 조금 더 만들기 ---------------- */
if ($action === 'step') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => false, 'error' => '시작하지 않았습니다'], 409);
    if ($st['done']) jout(progress($st));

    $out = @fopen($TMP, 'a');
    $qr  = @fopen($QUEUE, 'r');
    if (!$out || !$qr) jout(['ok' => false, 'error' => '작업 파일을 열지 못했습니다'], 500);
    fseek($qr, $st['qpos']);

    $deadline = microtime(true) + $SECONDS_PER_STEP;
    $finished = false;

    while (microtime(true) < $deadline) {
        $line = fgets($qr);
        if ($line === false) { $finished = true; break; }
        $st['qpos'] = ftell($qr);

        $path = rtrim($line, "\r\n");
        if ($path === '') continue;
        $st['seen']++;
        $st['current'] = basename($path);

        // 남은 시간보다 오래 걸릴 만한 파일은 짧게 끊습니다
        $left = max(1.0, $deadline - microtime(true));
        $r = read_one($path, $MAX_TEXT, $MAX_FILE, min(6.0, $left + 2.0));
        if ($r['상태'] === '읽음') {
            $st['read']++;
            fwrite($out, str_replace("\t", ' ', $path) . "\t" . $r['text'] . "\n");
        } else {
            $st['fail']++;
            // 못 읽은 파일도 남겨둡니다 (나중에 OCR 대상이 됩니다)
            fwrite($out, str_replace("\t", ' ', $path) . "\t\x01" . $r['상태'] . "\n");
        }
    }
    fclose($out); fclose($qr);

    if ($finished) {
        if (!@rename($TMP, $OUT)) jout(['ok' => false, 'error' => '목록을 저장하지 못했습니다'], 500);
        @unlink($QUEUE);
        $st['done'] = true;
        save_state($STATE, $st);
        $p = progress($st);
        $p['다음'] = '이제 문서 내용으로 찾을 수 있습니다.';
        jout($p);
    }
    save_state($STATE, $st);
    jout(progress($st));
}

if ($action === 'status') {
    $st = load_state($STATE);
    if (!$st) jout(['ok' => true, '진행' => '없음', 'done' => false, 'running' => false]);
    jout(progress($st) + ['running' => true]);
}

if ($action === 'cancel') {
    @unlink($STATE); @unlink($QUEUE); @unlink($TMP);
    jout(['ok' => true, '진행' => '중단했습니다']);
}

if ($action === 'clear') { @unlink($STATE); jout(['ok' => true]); }

/* ---------------- 내용으로 찾기 ---------------- */
if ($action === 'search') {
    if (!is_file($OUT)) {
        jout(['ok' => false, 'error' => '글자 목록이 아직 없습니다. 먼저 만들어 주세요.'], 404);
    }
    $q = trim($_GET['q'] ?? '');
    if ($q === '') jout(['ok' => false, 'error' => '찾을 말을 입력해 주세요'], 400);

    $terms = array_values(array_filter(preg_split('/\s+/u', mb_strtolower($q, 'UTF-8'))));
    $limit = min(max((int)($_GET['limit'] ?? 60), 1), 200);

    $fp = fopen($OUT, 'r');
    if (!$fp) jout(['ok' => false, 'error' => '목록을 열지 못했습니다'], 500);

    $hits = [];
    $matched = 0;
    $deadline = microtime(true) + 10;
    $stopped  = false;
    $seen = 0;
    while (($line = fgets($fp)) !== false) {
        if ((++$seen % 200) === 0 && microtime(true) > $deadline) { $stopped = true; break; }
        $tab = strpos($line, "\t");
        if ($tab === false) continue;
        $path = substr($line, 0, $tab);
        $text = rtrim(substr($line, $tab + 1), "\r\n");
        if ($text === '' || $text[0] === "\x01") continue;      // 못 읽은 문서

        $low = mb_strtolower($text, 'UTF-8');
        $ok = true;
        foreach ($terms as $t) { if (mb_strpos($low, $t, 0, 'UTF-8') === false) { $ok = false; break; } }
        if (!$ok) continue;

        $matched++;
        if (count($hits) >= $limit) continue;

        // 첫 검색어 주변을 잘라 보여줍니다
        $pos = mb_strpos($low, $terms[0], 0, 'UTF-8');
        $from = max(0, $pos - 60);
        $snip = mb_substr($text, $from, 220, 'UTF-8');
        $hits[] = [
            'name' => basename($path),
            'dir'  => dirname($path),
            'path' => $path,
            'ext'  => strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            'snip' => ($from > 0 ? '…' : '') . $snip . '…',
        ];
    }
    fclose($fp);

    jout(['ok' => true, 'matched' => $matched, 'shown' => count($hits), 'results' => $hits,
          '시간초과' => $stopped,
          '안내' => $stopped ? '문서가 많아 앞쪽 ' . $seen . '개까지만 찾았습니다.' : null]);
}

/* ---------------- 못 읽은 문서 목록 (나중에 OCR 대상) ---------------- */
if ($action === 'unread') {
    if (!is_file($OUT)) jout(['ok' => false, 'error' => '글자 목록이 아직 없습니다'], 404);
    $limit = min(max((int)($_GET['limit'] ?? 200), 1), 1000);
    $fp = fopen($OUT, 'r');
    $rows = []; $n = 0; $byExt = [];
    while (($line = fgets($fp)) !== false) {
        $tab = strpos($line, "\t");
        if ($tab === false) continue;
        $text = rtrim(substr($line, $tab + 1), "\r\n");
        if ($text === '' || $text[0] !== "\x01") continue;
        $n++;
        $path = substr($line, 0, $tab);
        $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $byExt[$ext] = ($byExt[$ext] ?? 0) + 1;
        if (count($rows) < $limit) {
            $rows[] = ['name' => basename($path), 'dir' => dirname($path),
                       'path' => $path, 'ext' => $ext, '이유' => substr($text, 1)];
        }
    }
    fclose($fp);
    arsort($byExt);
    jout(['ok' => true, '못읽은수' => $n, '형식별' => $byExt, 'results' => $rows]);
}

jout(['ok' => false, 'error' => '알 수 없는 요청입니다: ' . $action], 400);
