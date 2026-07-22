// 공법별 시공 순서 (POUR 공법 자료 ver08 기준)
// progress_current = "끝낸 단계 수" (0 = 시작 전, stages.length = 공사 완료)
window.STAGE_SETS = {
  repaint: {
    label: '외벽 재도장 (균열보수)',
    stages: ['외벽 고압세척', '균열보수', '바인더 작업', '페인트 도장', '그래픽 작업', '공사 마무리']
  },
  metalroof: {
    label: '금속지붕·칼라강판 방수',
    stages: ['HOOKER 보강작업', '구조물 압축강화시트', '표면강화 함침액 도포', '압축강화시트 부착', '방수액 함침(중도1차)', '코트재Ⅱ 도포(중도2차)', '상도코트재 도포', '시공 완료']
  },
  shingle: {
    label: '아스팔트슁글 방수',
    stages: ['HOOKER 보강작업', '이음부 압축강화시트', '바탕정리·코트재Ⅰ 도포', '슈퍼복합압축시트 부착', '방수콘크리트 함침(1차)', '방수액 2차함침(중도1차)', '코트재Ⅱ 도포(중도2차)', '상도코트재 도포']
  },
  epoxy: {
    label: '지하주차장 에폭시',
    stages: ['바탕면 연마·청소', '균열·단면 보수', '프라이머(하도)', '에폭시 중도 도포', '논슬립·상도 마감', '시공 완료']
  }
};
window.methodStages = function (m) { return (window.STAGE_SETS[m] || {}).stages || null; };
window.methodLabel = function (m) { return (window.STAGE_SETS[m] || {}).label || ''; };
