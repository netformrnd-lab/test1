<?php
/*
 * netform-sync.php — NETFORM 의뢰 프로그램 ↔ 브랜드 허브 콘텐츠 제작 동기화
 *
 *  왜 있나
 *    미디어마케팅팀이 "동영상 제작요청(NETFORM)"을 허브의 콘텐츠 제작에서
 *    한눈에 보고, (2단계에서) 진행상태를 바꾸면 NETFORM 에도 반영하기 위함.
 *
 *  동작
 *    - 브랜드 허브(Web Station, 80)에서 돌아가며, NETFORM 컨테이너를
 *      <<내부로 직접>> 호출합니다 (http://127.0.0.1:8765). 역방향 프록시와
 *      무관하므로 다른 팀의 외부 접속에 영향을 주지 않습니다.
 *    - action=list (기본): NETFORM 의뢰(requests)를 정리해 돌려줍니다.
 *    - action=setStatus : (2단계) 허브에서 바꾼 진행상태를 NETFORM 에 씀.
 *
 *  안전
 *    - NETFORM 이 꺼져 있거나 못 닿으면, 마지막으로 받아둔 캐시를 돌려주고
 *      stale=true 로 표시합니다 (화면이 비지 않게).
 *    - 공개 저장소이므로 비밀번호·키를 넣지 않습니다. NETFORM 조회 API 는
 *      인증이 없으므로 그대로 호출합니다.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// NETFORM 컨테이너 주소 후보 — 첫 번째로 응답하는 곳을 씁니다.
// (환경변수 NETFORM_BASE 가 있으면 그것만 사용. 포트/호스트가 바뀌면 여기만 고치면 됨)
$NETFORM_BASES = getenv('NETFORM_BASE')
  ? array(getenv('NETFORM_BASE'))
  : array('http://192.168.0.37:8765', 'http://127.0.0.1:8765', 'http://localhost:8765');
$CACHE = __DIR__ . '/data/netform-cache.json';
$TIMEOUT = 8;

function out($arr){ echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }

/* NETFORM 에 HTTP 요청 (GET 기본). 실패하면 [null, 오류문자열] */
function nf_http($method, $url, $body = null, $headers = array(), $timeout = 8){
  $h = array('Accept: application/json');
  foreach($headers as $k => $v) $h[] = $k . ': ' . $v;
  if(function_exists('curl_init')){
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CUSTOMREQUEST  => $method,
      CURLOPT_HTTPHEADER     => $h,
      CURLOPT_TIMEOUT        => $timeout,
      CURLOPT_CONNECTTIMEOUT => $timeout,
    ));
    if($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if($res === false) return array(null, 'NETFORM 연결 실패: ' . $err, 0);
    return array($res, '', $code);
  }
  // curl 이 없으면 stream 사용
  $opts = array('http' => array(
    'method'  => $method,
    'header'  => implode("\r\n", $h),
    'timeout' => $timeout,
    'ignore_errors' => true,
  ));
  if($body !== null) $opts['http']['content'] = $body;
  $ctx = stream_context_create($opts);
  $res = @file_get_contents($url, false, $ctx);
  if($res === false) return array(null, 'NETFORM 연결 실패 (stream)', 0);
  $code = 0;
  if(isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
  return array($res, '', $code);
}

/* 의뢰(requests) 레코드를 화면용으로 평탄화 */
function flatten_request($r){
  $d = isset($r['data']) && is_array($r['data']) ? $r['data'] : array();
  $o = array(
    'id'          => isset($r['id']) ? $r['id'] : '',
    'number'      => isset($r['number']) ? $r['number'] : '',
    'version'     => isset($r['version']) ? $r['version'] : 0,
    'createdAt'   => isset($r['createdAt']) ? $r['createdAt'] : '',
    'createdBy'   => isset($r['createdBy']) ? $r['createdBy'] : '',
    'createdDept' => isset($r['createdDept']) ? $r['createdDept'] : '',
    'updatedAt'   => isset($r['updatedAt']) ? $r['updatedAt'] : '',
    'updatedBy'   => isset($r['updatedBy']) ? $r['updatedBy'] : '',
  );
  // payload 전체를 같이 실어 보냄 (상세 보기에서 사용). 메타 키와 겹치지 않음.
  foreach($d as $k => $v) if(!isset($o[$k])) $o[$k] = $v;
  return $o;
}

$action = isset($_GET['action']) ? $_GET['action'] : 'list';

if($action === 'list'){
  // 후보 주소를 차례로 시도 — 첫 번째로 성공하는 곳을 사용
  $res = null; $err = ''; $code = 0; $usedBase = ''; $tried = array();
  foreach($NETFORM_BASES as $base){
    list($r2, $e2, $c2) = nf_http('GET', $base . '/api/export.json', null, array(), $TIMEOUT);
    $tried[] = $base . ' → ' . ($e2 ?: ('HTTP ' . $c2));
    if($r2 !== null && $c2 >= 200 && $c2 < 300){ $res = $r2; $err = ''; $code = $c2; $usedBase = $base; break; }
    $err = $e2 ?: ('HTTP ' . $c2); $code = $c2;
  }
  if($res !== null && $code >= 200 && $code < 300){
    $j = json_decode($res, true);
    if(is_array($j) && isset($j['records']) && is_array($j['records'])){
      $reqs = array();
      foreach($j['records'] as $r){
        if(isset($r['kind']) && $r['kind'] === 'requests' && empty($r['deletedAt']))
          $reqs[] = flatten_request($r);
      }
      $payload = array(
        'ok'         => true,
        'stale'      => false,
        'source'     => 'netform',
        'base'       => $usedBase,
        'serverTime' => isset($j['serverTime']) ? $j['serverTime'] : '',
        'seq'        => isset($j['seq']) ? $j['seq'] : 0,
        'syncedAt'   => date('c'),
        'count'      => count($reqs),
        'requests'   => $reqs,
      );
      // 캐시 저장 (NETFORM 이 나중에 꺼져도 마지막 자료를 보여주기 위함)
      @file_put_contents($CACHE, json_encode($payload, JSON_UNESCAPED_UNICODE), LOCK_EX);
      out($payload);
    }
    $err = 'NETFORM 응답 형식이 올바르지 않습니다.';
  }
  // 실패 → 캐시로 대체
  if(is_file($CACHE)){
    $cached = json_decode(@file_get_contents($CACHE), true);
    if(is_array($cached)){
      $cached['ok'] = true;
      $cached['stale'] = true;
      $cached['staleReason'] = $err ?: ('HTTP ' . $code);
      out($cached);
    }
  }
  out(array('ok' => false, 'stale' => false, 'error' => ($err ?: ('HTTP ' . $code)),
            'tried' => $tried,
            'hint' => 'NETFORM 컨테이너(8765)가 켜져 있는지 확인하세요 (Container Manager → netform-shared).',
            'requests' => array()));
}

if($action === 'setStatus'){
  // 허브에서 바꾼 진행상태를 NETFORM 에 되씀 (상태만 — 나머지 필드는 서버가 기존 레코드에서 병합)
  $in = json_decode(file_get_contents('php://input'), true);
  if(!is_array($in)) $in = $_POST;
  $id = isset($in['id']) ? (string)$in['id'] : '';
  $expectedVersion = array_key_exists('expectedVersion', $in) ? intval($in['expectedVersion']) : null;
  $actorName = trim(isset($in['actorName']) ? $in['actorName'] : '');
  if($actorName === '') $actorName = '브랜드허브';
  $actorDept = trim(isset($in['actorDept']) ? $in['actorDept'] : '');
  if($actorDept === '') $actorDept = '미디어마케팅팀';
  // 바꿀 필드 모으기 — 진행상태(status) · 담당자(assignee). 둘 다 선택, 하나 이상 필요.
  $ALLOWED = array('의뢰 접수','내용 확인 중','일정 조율 중','제작 진행 중','검토 및 수정 중','완료','보류','취소','작성 중');
  $data = array();
  if(isset($in['status']) && $in['status'] !== ''){
    if(!in_array((string)$in['status'], $ALLOWED, true))
      out(array('ok' => false, 'error' => '허용되지 않는 진행상태입니다.'));
    $data['status'] = (string)$in['status'];
  }
  if(array_key_exists('assignee', $in)){            // '' 이면 담당 해제
    $asg = trim((string)$in['assignee']);
    if(mb_strlen($asg) > 60) out(array('ok' => false, 'error' => '담당자 이름이 너무 깁니다.'));
    $data['assignee'] = $asg;
  }
  if($id === '' || !$data)
    out(array('ok' => false, 'error' => '바꿀 내용이 없습니다 (상태 또는 담당자).'));
  $status = isset($data['status']) ? $data['status'] : '';   // 응답용

  // 작동하는 base 찾기
  $base = '';
  foreach($NETFORM_BASES as $b){
    list($r, $e, $c) = nf_http('GET', $b . '/api/health', null, array(), $TIMEOUT);
    if($r !== null && $c >= 200 && $c < 300){ $base = $b; break; }
  }
  if($base === '') out(array('ok' => false, 'error' => 'NETFORM 에 연결할 수 없습니다 (컨테이너 확인).'));

  $hdr = array('X-Netform-Client' => 'web', 'Content-Type' => 'application/json');

  // 1) 작성자 등록/재사용 → actorId (같은 부서·이름이면 항상 같은 id)
  list($wr, $we, $wc) = nf_http('POST', $base . '/api/writer',
    json_encode(array('name' => $actorName, 'department' => $actorDept), JSON_UNESCAPED_UNICODE), $hdr, $TIMEOUT);
  $wj = $wr !== null ? json_decode($wr, true) : null;
  if(!is_array($wj) || empty($wj['actorId']))
    out(array('ok' => false, 'error' => '작성자 등록 실패: ' . ($we ?: ('HTTP ' . $wc))));
  $actorId = $wj['actorId'];

  // 2) 진행상태만 저장 (버전 검사로 충돌 방지, Idempotency-Key 로 중복 방지)
  $ph = $hdr;
  $ph['Idempotency-Key'] = 'hub-' . bin2hex(random_bytes(8));
  $putBody = json_encode(array(
    'data'            => $data,
    'expectedVersion' => $expectedVersion,
    'actorId'         => $actorId,
  ), JSON_UNESCAPED_UNICODE);
  list($pr, $pe, $pc) = nf_http('PUT', $base . '/api/records/requests/' . rawurlencode($id), $putBody, $ph, $TIMEOUT);
  $pj = $pr !== null ? json_decode($pr, true) : null;
  if($pr !== null && $pc >= 200 && $pc < 300)
    out(array('ok' => true, 'status' => $status, 'record' => (is_array($pj) ? $pj : null)));
  // 실패 — NETFORM 오류 메시지를 그대로 전달 (예: 완료는 결과물 경로 필요, 409 충돌 등)
  $msg = (is_array($pj) && isset($pj['error'])) ? $pj['error'] : ($pe ?: ('HTTP ' . $pc));
  out(array('ok' => false, 'conflict' => ($pc === 409), 'error' => $msg, 'code' => $pc));
}

out(array('ok' => false, 'error' => '알 수 없는 action: ' . $action));
