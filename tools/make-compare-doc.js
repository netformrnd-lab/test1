// 대시보드(관리자 콘솔) 디자인 변경 전·후 비교 자료 생성
// 사용법: node tools/make-compare-doc.js <before폴더> <after폴더> <출력폴더>
//   예)   node tools/make-compare-doc.js docs/screenshots/2026-11-05-인수시점 docs/screenshots/2026-11-05-현재 docs/compare
// 결과: <출력폴더>/대시보드-변경-전후비교.html (이미지 내장, 단독 파일) + 같은 이름 .pdf (섹션마다 한 페이지)
const fs = require('fs'); const path = require('path')
const { chromium } = require('playwright')
const [BEFORE, AFTER, OUT] = [2, 3, 4].map(i => path.resolve(process.argv[i] || ''))
if (!process.argv[4]) { console.error('사용법: node tools/make-compare-doc.js <before> <after> <out>'); process.exit(1) }
const DATE = process.argv[5] || new Date().toISOString().slice(0, 10)

// 화면별 설명. before:null 이면 "이전에 없던 화면(신규)"로 표시
const SCREENS = [
  { file: '01-관제센터.png', title: '관제센터 (첫 화면)', sub: '매일 아침 확인 순서대로 보이게 재구성',
    changes: [
      '상단에 <b>오늘 확인 순서 4단계</b> 카드 (① 아파트스퀘어 이메일 → ② 캘린더 미배정 현장 → ③ 진행중 현장 → ④ 준공 현장). 각 카드에 바로 가기 + "확인 완료" 체크, 진행 막대. 체크는 날짜별로 저장되어 다음 날 초기화',
      '<b>확인할 현장</b> 목록(전체 / 배치 필요 / 진행중 / 준공 탭). 행마다 왜 봐야 하는지(배치 필요·새 감리일지·준공)와 처리 버튼(바로 배치 · 일지 확인 · 현장 열기)',
      '기존 알림 박스(담당 미배정·정체 딜·승인 대기)와 5개 타일은 오른쪽 <b>그 밖의 알림</b>으로 압축. "원본에만 있는 항목"은 정리 창(단지 등록 / 무시)으로 분리',
      '진행중 현장 타일 → 클릭 시 어떤 현장이 세어졌는지 팝업 (10-15). 배치 필요한 현장 → 그 자리에서 <b>바로 배치 창</b>(담당·주기·요일) (10-15)',
      '확인할 현장 탭: <b>담당 미배정</b>(공사중인데 담당 감리원이 없는 현장) / <b>일정 없음</b>(담당은 있는데 캘린더에 앞날 방문 일정이 없는 현장 → "일정 추가"로 바로 등록). 요일 기반 자동 방문은 쓰지 않아 "요일 미지정"은 더 이상 세지 않음 (11-06)',
      '새로 올라온 감리일지는 제목 대신 <b>한 줄 요약</b>(예: "공사 마무리 점검")으로 표시. 매출 목표·고객사 등급·최근 히스토리 카드는 유지',
      '공통: 흰 배경·파란 포인트의 새 색상, 상단바(통합 현장 검색 <kbd>/</kbd> · 팀 공유 중 · 전체 데이터 엑셀), 왼쪽 메뉴 업무/도구/앱 관리/기타로 재배치, 이모지 제거'
    ] },
  { file: '02-공사관리-리스트.png', title: '공사관리 — 리스트형', sub: '열 구성과 필터를 실무 기준으로 정리',
    changes: [
      '단계 칩(전체/계약/착공/공사중/준공처리/준공 + 건수) 유지, 아래에 <b>지역 · 담당 감리원 · 공종 드롭다운 + 정렬(이름/최근 일지/다음 방문/단계) + 초기화</b> 추가. 검색은 담당 감리원 이름까지',
      '열 정리: 현장/지역(세대수) · <b>단계</b>(누르면 단계 이동 버튼 펼침) · <b>공정</b>(공종마다 한 줄: 진행 바 + % + 현재 공정명) · 담당 감리원(이름만) · <b>다음 방문</b>(배치표 기준 날짜·요일·담당) · <b>최근 감리일지</b>(날짜·회차·NEW·한 줄 요약, 누르면 일지 열림) · <b>상태</b>(정상/주의/지연) · 상세/설정',
      '상태 기준: 공사중 현장의 최근 일지가 10일 이내 정상 · 21일 이내 주의 · 그 이상/없음 지연',
      '감리일지에서 공정 자동 감지 → <b>"일지 10-27: 그래픽 작업 · 반영 · ✕"</b> 제안. 반영을 누르면 그 공정으로 저장, ✕는 그 일지 기준으로 숨김',
      '한 현장에 공법 여러 개(다공종) 설정 가능 → 공종별 진행 바가 각각 표시 (예: 재도장 67% / 옥상방수 29%)',
      '감리비·미수금 열은 기본 숨김 → <b>일괄 작업 ▾</b> 메뉴(일괄배정 · 전체 공개 · PDF 없음 공개 회수 · 금액 열 보기)로 이동. 보기 전환 리스트 / 카드 / 칸반, "미배정"은 빨강',
      '<b>계약 건 단위</b>(11-06): 한 현장에 계약이 여러 건(동시 추가공사 · 준공 뒤 재계약)이면 건마다 한 줄. 현장명 아래 "공종 · n차"와 <b>재계약</b> 배지, 준공 건은 준공일. 단계 칩은 건수와 현장 수를 같이 표시해 준공 탭에 옛 건이 그대로 남음',
      '<b>다음 방문</b> = 캘린더에서 그 현장의 가장 가까운 앞날 일정(감리원이 앱에서 직접 등록한 일정 포함), 없으면 "미정" (11-06)',
      '<b>공사 현황 엑셀</b> 버튼: 공사중 / 준공예정 / 준공(준공일순) / 계약·착공 / 전체 건 시트, 연도 필터 (11-06)'
    ] },
  { file: '05-공사관리-카드.png', title: '공사관리 — 카드형 (신규)', sub: '현장 하나를 카드 한 장으로', before: null,
    changes: [
      '새 보기. 카드마다 단계·NEW·상태 배지, 공종별 진행 현황, 담당, 다음 방문·최근 감리일지, 단계 이동 버튼, 설정',
      '현장 사진 자리는 운영 부담을 고려해 넣지 않음 (10-30 결정)',
      '리스트형과 같은 필터·정렬·검색을 그대로 사용'
    ] },
  { file: '04-공사관리-칸반.png', title: '공사관리 — 칸반', sub: '기능은 그대로, 색상·카드 모양만 새 디자인',
    changes: [
      '단계별 칸(계약 → 착공 → 공사중 → 준공처리 → 준공)과 카드 이동 동작은 변경 없음',
      '카드 색·테두리·글자를 새 색상 토큰으로 통일, 이모지 제거'
    ] },
  { file: '06-단지상세.png', title: '현장(단지) 상세', sub: '2단 → 3단. 왼쪽 할 일, 가운데 일지, 오른쪽 현장 정보',
    changes: [
      '<b>왼쪽: 단계별 준비 체크리스트 14항목</b> (계약 3 · 착공서류 7 · 기성금 1 · 준공 3). 그룹별 n/m, 다음 할 일에 "지금" 표시. 체크한 사람·시간이 단지별로 저장되어 <b>팀 전체가 같이 봄</b> (apartments.checklist, 콘솔 전용)',
      '<b>가운데: 지금 할 일</b> 카드(완료 체크, 착공서류 단계면 "시공사 요청 메일 문구" 바로가기) + 탭(감리일지 · 작업사진 · 현장개요 · 히스토리). 기본 탭이 현장개요 → <b>감리일지</b>로',
      '감리일지의 "공개하기" 버튼 → <b>입주자앱 공개 스위치</b> + 상태 글(공개중 · 작업사진 n장 반영됨 / PDF 없음 → 준비중 / 비공개)',
      '<b>오른쪽: 현장 정보</b>(수정 창: 현장명·주소·공사명·계약금액·대표/담당 감리원, 빈 값은 "비어 있음"), <b>공사 단계</b>(바로 누르면 변경 · 앱에도 반영), <b>공법·공정</b>(체크 즉시 저장, 첫 체크가 대표 공법), <b>계약·수금</b>',
      '계약서 PDF를 올리면 <b>계약금액을 자동으로 읽어</b> 확인창 → 저장. 계약금·잔금 50% 자동 계산. 못 읽으면 직접 입력',
      '단지 설정 창에서 단계·공법·공정 칸 제거 (상세 카드와 같은 값이라 한 곳에서만 저장)',
      '<b>계약 건</b>(11-06): 제목 아래 "1차 재도장 · 준공 / 2차 옥상방수 · 공사중" 칩. 건을 고르면 단계 · 공법·공정 · 체크리스트 · 계약·수금이 그 건 기준. 오른쪽 계약 건 카드(공사명 · 차수 · 재계약 배지 · 계약일/착공일/준공일 · 수정/추가/삭제), 계약 여러 건이면 현장 합계. 앱이 읽는 현장 값은 진행 중인 대표 건 기준으로 자동 기록',
      '체크리스트: 착공서류에 <b>"시공사에 착공계 서류 요청" 묶음</b>(한 번에 체크/해제, 서류별 개별 체크 유지) + 공사도급계약서 검토, 기성금에 잔금 청구서 검토 → 16항목 (11-06)',
      '<b>내부 메모</b> 카드(체크리스트 아래, 운영자만 · 앱에는 안 나감). <b>지급 비율</b>(기본 50/50, 중도금 포함 프리셋/직접 입력), 감리비 = 계약금액, <b>미수금 = 계약금액 − 수금액</b> 자동 계산 (11-06)',
      '시방서 · 현설자료 카드(다른 작업자 #89): 업로드하면 감리앱에서 바로 열람'
    ] },
  { file: '06b-단지상세-작업사진.png', title: '현장 상세 — 작업사진 탭', sub: '같은 3단 안에서 탭만 전환',
    changes: [
      '작업사진(현장기록) 카드/달력 보기, 현장기록 추가 기능은 그대로',
      '감리일지 공개 시 사진이 작업사진으로 자동 복사되던 연결은 해제(#90): 감리일지 사진은 일지에만, 작업사진은 시공사 사진을 현장기록으로 직접 올림',
      '탭을 바꿔도 왼쪽 체크리스트·오른쪽 현장 정보는 그대로 보임'
    ] },
  { file: '07-캘린더.png', title: '캘린더 · 방문 배치표', sub: '배치표를 3탭으로 — 관제센터 "진행중 현장"과 같은 기준',
    changes: [
      '방문 배치표 탭: <b>감리 진행</b>(공사중·준공처리, 기본) / <b>착공 전</b>(계약·착공·상태 미설정) / <b>준공완료</b>(이력, 읽기 전용). 단계가 바뀌면 자동으로 탭 이동, 담당·주기·요일 설정은 따라감',
      '표에 <b>단계 열</b>(색 배지, 클릭 시 현장 상세) + 표 위에 단계별 현장 수 요약',
      '준공완료 탭: 담당했던 감리원 · 주기·요일 · 다녀온 정기 방문 횟수와 마지막 방문일 · 준공 처리일',
      '상태값이 빈 현장은 "상태 미설정" 배지로 착공 전 탭 맨 위에 표시',
      '월간/주간 캘린더, 엑셀·주간 사진 저장 등 기존 기능과 앱 연동은 변경 없음. 주간 보기는 아스퀘 일정만 표시',
      '방문 일정은 감리원이 앱에서 직접 등록하는 방식으로 운영(요일 자동 생성은 사용 안 함). 등록이 빠진 현장은 관제센터 "일정 없음"에서 확인'
    ] },
  { file: '12-안내문구.png', title: '안내문구(이메일) (신규 메뉴)', sub: '시공사에 보내는 메일 문구를 현장 정보로 자동 채움', before: null,
    changes: [
      '현장을 고르면 {현장명} {공사명} {시공사} {대표감리원} {계약금액} {계약금} {잔금} {오늘날짜} {보내는사람} 이 자동으로 채워짐. 값이 없으면 <b>[항목명]</b>으로 남기고 안내',
      '분류 탭(계약 · 착공서류 · 기성금 · 준공 · 기타), 문구 등록·수정·삭제, 빈칸 버튼으로 변수 삽입',
      '<b>메일용 복사(제목+본문)</b> · 제목만 복사 · 네이버 메일 열기. 이 화면에서 직접 보내지는 않음',
      '기본 문구 4개 제공 (계약금 청구 · 착공서류 요청 · 중도금 청구서 날인 요청 · 준공완료보고서 발송). 저장 테이블(message_templates)은 콘솔 전용',
      '{계약금}{중도금}{잔금}은 선택한 계약 건의 지급 비율을 따름 (11-06)'
    ] }
]
const COMMON = [ // 디자인만 바뀐 화면 (작게)
  { file: '08-회원.png', title: '회원' }, { file: '09-영업.png', title: '영업 (칸반 단계를 구글시트가 되돌리지 않음 · 성사 시 같은 이름 현장에 연결)' },
  { file: '10-고객관리.png', title: '고객정보 (← 고객관리)' }, { file: '11-활동기록.png', title: '활동기록' }
]
const b64 = f => fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const img = (src, alt) => src ? `<img src="${src}" alt="${esc(alt)}">` : `<div class="none">이전에는 없던 화면<br><small>(이번 개편에서 새로 추가)</small></div>`

const sections = SCREENS.map((s, i) => {
  const bf = s.before === null ? null : b64(path.join(BEFORE, s.file)); const af = b64(path.join(AFTER, s.file))
  return `<section class="shot">
  <header><div class="num">${i + 1}</div><div><h2>${esc(s.title)}</h2><p>${esc(s.sub)}</p></div></header>
  <div class="cols">
    <div class="col before"><div class="lbl">이전 (인수 시점)</div>${img(bf, s.title + ' 이전')}</div>
    <div class="col after"><div class="lbl">변경 후 (현재)</div>${img(af, s.title + ' 변경 후')}</div>
  </div>
  <div class="changes"><h3>추가·변경된 사항</h3><ul>${s.changes.map(c => `<li>${c}</li>`).join('')}</ul></div>
</section>`
}).join('\n')
const common = `<section class="shot common">
  <header><div class="num">${SCREENS.length + 1}</div><div><h2>그 밖의 화면 — 공통 디자인만 변경</h2><p>회원 · 영업 · 고객정보 · 활동기록은 기능 변경 없이 색상·상단바·메뉴만 새 디자인</p></div></header>
  <div class="grid4">${COMMON.map(c => `<div class="pair"><div class="t">${esc(c.title)}</div><div class="cols small"><div class="col before"><div class="lbl">이전</div>${img(b64(path.join(BEFORE, c.file)), c.title + ' 이전')}</div><div class="col after"><div class="lbl">변경 후</div>${img(b64(path.join(AFTER, c.file)), c.title + ' 변경 후')}</div></div></div>`).join('')}</div>
  <div class="changes"><h3>공통 변경</h3><ul>
    <li>남색 사이드바 → <b>흰 배경 + 파란 포인트</b>. 글자 #1B1F29 / 보조 #5B6272 / 선 #E6E8EE / 파랑 #2F6BF6, 카드 모서리 12px, 버튼 36px(파랑은 주요 동작만)</li>
    <li>상단바 신설: NETFORM · 아파트스퀘어 관리자 · <b>통합 현장 검색</b>(<kbd>/</kbd> 키) · 팀 공유 중 · 전체 데이터 엑셀</li>
    <li>왼쪽 메뉴 순서: <b>업무</b>(관제센터·캘린더·영업·공사관리) / <b>도구</b>(안내문구) / <b>앱 관리</b>(고객정보·회원·입주민소통/NPS·사용통계·홍보·자료) / <b>기타</b>(활동기록·데이터 도구·업무 로드맵·자료실·휴지통). 메뉴·버튼의 이모지 제거</li>
    <li>앱(감리원·입주민)과 연동되는 저장·조회 코드, 함수 이름, 공유 테이블은 변경하지 않음. 추가된 DB(체크리스트·공사명·안내문구·계약 건)는 콘솔만 사용</li>
    <li>영업: 구글시트 자동 동기화가 칸반에서 옮긴 단계를 뒤로 되돌리지 않음(앞으로만). 성사 딜은 같은 이름의 현장이 있으면 새 현장을 만들지 않고 연결(전부 준공이면 재계약 건으로)</li>
  </ul></div>
</section>`

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>아파트스퀘어 관리자 콘솔 — 변경 전·후 비교 (${DATE})</title>
<style>
:root{--ink:#1B1F29;--mut:#5B6272;--line:#E6E8EE;--soft:#F8F9FB;--blue:#2F6BF6;--blue-soft:#EEF3FE;--red:#B42318;--green:#15803D}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:14px/1.6 -apple-system,"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif}
.wrap{max-width:1600px;margin:0 auto;padding:28px 24px}
.cover{padding:36px 0 24px;border-bottom:1px solid var(--line);margin-bottom:8px}
.cover h1{font-size:28px;margin:0 0 6px}.cover p{margin:4px 0;color:var(--mut)}
.cover .meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:13px}.cover .meta span b{color:var(--ink)}
.toc{margin:16px 0 0;padding:14px 18px;background:var(--soft);border-radius:12px}.toc ol{margin:6px 0 0;padding-left:22px;columns:2}.toc li{margin:2px 0}
.shot{padding:26px 0;border-bottom:1px solid var(--line);page-break-before:always;break-before:page}
.shot header{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}.num{width:34px;height:34px;border-radius:50%;background:var(--blue);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.shot h2{margin:0;font-size:20px}.shot header p{margin:2px 0 0;color:var(--mut)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.col{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--soft)}
.col .lbl{font-weight:700;font-size:13px;padding:8px 12px;border-bottom:1px solid var(--line);background:#fff}
.col.before .lbl{color:var(--mut)}.col.after .lbl{color:var(--blue);background:var(--blue-soft)}
.col img{display:block;width:100%;height:auto}
.none{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:260px;color:var(--mut);font-size:16px;text-align:center;background:repeating-linear-gradient(45deg,#fff,#fff 10px,#F3F4F7 10px,#F3F4F7 20px)}
.none small{font-size:13px;margin-top:4px}
.changes{margin-top:16px;padding:14px 18px;border:1px solid var(--line);border-left:4px solid var(--blue);border-radius:10px;background:#fff}
.changes h3{margin:0 0 6px;font-size:15px}.changes ul{margin:0;padding-left:20px}.changes li{margin:4px 0}
kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:12px;background:var(--soft)}
.grid4{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair .t{font-weight:700;margin-bottom:6px}.cols.small{gap:8px}
.foot{padding:20px 0;color:var(--mut);font-size:12px}
@media print{.wrap{padding:0}.shot{padding:16px 0}.col img{max-height:none}}
@media (max-width:900px){.cols,.grid4,.toc ol{grid-template-columns:1fr;columns:1}}
</style></head><body><div class="wrap">
<div class="cover">
  <h1>아파트스퀘어 관리자 콘솔 — 변경 전·후 비교</h1>
  <p>인수 시점(2026-10-15 이전)의 화면과 ${DATE} 현재 화면을 같은 목(가짜) 데이터로 캡처해 나란히 놓았습니다. 괄호의 날짜(11-06 등)는 그날 추가된 변경입니다. 왼쪽이 이전, 오른쪽이 변경 후이고 아래에 추가·변경된 사항을 적었습니다.</p>
  <div class="meta"><span>기준일 <b>${DATE}</b></span><span>해상도 <b>1440px 폭</b></span><span>데이터 <b>목 데이터(실제 DB 아님)</b></span><span>앱 연동 코드 <b>변경 없음</b></span></div>
  <div class="toc"><b>차례</b><ol>${SCREENS.map(s => `<li>${esc(s.title)}</li>`).join('')}<li>그 밖의 화면 — 공통 디자인만 변경</li></ol></div>
</div>
${sections}
${common}
<div class="foot">생성: tools/make-compare-doc.js · 스크린샷: tools/console-screenshots.js (목 데이터) · 상세 변경 이력은 docs/변경기록.md</div>
</div></body></html>`
fs.mkdirSync(OUT, { recursive: true })
const htmlPath = path.join(OUT, '대시보드-변경-전후비교.html'); fs.writeFileSync(htmlPath, html)
console.log('✓ HTML', htmlPath, Math.round(fs.statSync(htmlPath).size / 1024) + 'KB')

;(async () => { // PDF: 섹션마다 한 페이지(높이는 내용에 맞춤) → pdfunite 로 합침
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await pg.goto('file://' + htmlPath, { waitUntil: 'load' }); await pg.emulateMedia({ media: 'screen' })
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
  const n = await pg.evaluate(() => document.querySelectorAll('.cover,.shot').length)
  const parts = []
  for (let i = 0; i < n; i++) {
    const h = await pg.evaluate(i => { const els = document.querySelectorAll('.cover,.shot'); els.forEach((e, j) => e.style.display = j === i ? '' : 'none'); document.querySelector('.foot').style.display = i === els.length - 1 ? '' : 'none'; window.scrollTo(0, 0); return document.querySelector('.wrap').getBoundingClientRect().height }, i)
    const p = path.join(OUT, `_part${String(i).padStart(2, '0')}.pdf`)
    await pg.pdf({ path: p, width: '1600px', height: (h + 2) + 'px', printBackground: true, pageRanges: '1', margin: { top: 0, bottom: 0, left: 0, right: 0 } })
    parts.push(p)
  }
  await b.close()
  const pdfPath = path.join(OUT, '대시보드-변경-전후비교.pdf')
  require('child_process').execFileSync('pdfunite', [...parts, pdfPath]); parts.forEach(p => fs.unlinkSync(p))
  console.log('✓ PDF', pdfPath, Math.round(fs.statSync(pdfPath).size / 1024) + 'KB')
})().catch(e => { console.error('PDF 실패:', e.message) })
