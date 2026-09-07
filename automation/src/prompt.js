// 키워드 -> 헤이젠 마스터 프롬프트.
// prompt-studio.html 과 같은 규칙을 서버에서 쓰기 위해 옮겨온 것.
import { TRADES, AUDIENCES } from './trades.js';

const SCENE_SEC = 13;   // 장면 하나의 목표 길이

const SCREEN_VAR = [
  '핵심 요소를 화면 가운데 크게',
  '앞 장면에서 한 단계 확대하거나 다른 각도의 소재로 교체',
  '항목을 나열하거나 좌우로 비교',
  '수치나 그래프를 단독으로',
  '실사 B롤 위에 짧은 자막'
];

const PRINCIPLES = [
  '첫 10~20초는 고객이 실제로 겪는 장면이나 확인하고 싶은 한 문장으로 시작한다. 회사 연혁이나 기능 목록부터 나열하지 않는다.',
  '한 화면에는 이미지·수치·제목 중 하나만 주인공으로 둔다.',
  '챕터가 바뀔 때는 전체 화면 타이틀을 넣어 다음 내용을 미리 알린다.',
  'B롤은 말한 내용을 증명하거나 분위기를 전환할 때만 쓴다.',
  '팝업·확대 같은 강조 모션은 핵심어·수치·차트가 등장할 때만 쓰고, 배경의 은은한 움직임은 끊기지 않게 유지한다.',
  '이미지나 영상 위에 글자를 올릴 때는 어두운 오버레이를 깔아 대비를 확보한다.',
  '로고와 안내 문구는 마지막 구간에만 노출한다.'
];

const CAST = [
  '아바타와 화면에 등장하는 모든 인물은 한국인으로 한다. 20~60대 한국인 남녀.',
  'B롤과 스톡 영상에 나오는 인물도 한국인 또는 동아시아인만 쓴다. 서양인·백인·흑인 모델을 쓰지 않는다.',
  '배경은 한국의 아파트 단지, 관리사무소, 단지 회의실, 한국 도시 풍경으로 한다.',
  '화면에 보이는 문서·표지판·앱 화면의 글자는 모두 한국어로 한다.',
  '복장은 한국 사무직과 관리사무소 기준으로 한다.'
];

export const DEFAULTS = {
  company: [
    '아파트스퀘어는 아파트 유지보수공사의 설계감리·시공감리 회사입니다. 시공을 직접 하지 않습니다.',
    '설계 단계: 예산·공사범위 검토, 하자진단, 설계도서 작성, 입찰공고와 시방서 작성, 현장설명회, 개찰 참여',
    '시공 단계: 착공감리(자재 검수), 중간감리(공정률·품질·안전), 준공감리(예비·본준공검사, 감리보고서)',
    '주요 공종: 외벽 재도장, 옥상 방수, 지하주차장 도장·누수, 단지 내 도로·보도',
    '결정은 입주자대표회의가 하고, 아파트스퀘어는 판단 근거를 정리해 제공합니다.'
  ],
  app: [
    '단지 자료를 한곳에서 확인하는 아파트스퀘어 앱',
    '견적 항목을 나란히 놓고 비교',
    '공정 진행률과 현장 사진을 실시간으로',
    '감리 지적사항과 시정 결과를 기록으로',
    '회의에 올릴 자료를 한 화면에 정리'
  ],
  brand: [
    '감리는 결정을 대신 하지 않는다. 단지가 판단할 근거를 정리해 주는 역할로만 서술',
    '전문적인 판단을 쉽게 설명하고, 공정한 결정 과정을 보여준다',
    '자기 찬양형 수식어 대신 실제 산출물과 절차를 보여준다',
    '브랜드 블루를 강조색으로 제한적으로 사용',
    '로고와 안내 문구는 마지막 구간에만 노출'
  ],
  palette: '밝고 읽기 쉬운 정보형 화면을 기본으로, 도입과 결론 구간만 딥 네이비',
  tone: '신뢰감 있고 친근한 데이터 브리핑 어조. 어려운 용어는 한 번 풀어서 설명한다.'
};

// 7개 챕터를 13초 단위 장면으로 쪼갠다
export function buildScenes(len, app) {
  const plan = [
    { n: '문제 제기', w: .11,
      screen: '현장 이미지 위에 어두운 오버레이를 깔고 질문 한 문장만 크게',
      note: k => `“${k}”와 관련해 시청자가 이미 겪고 있는 막막한 장면을 언어화한다. 회사 소개로 시작하지 않는다.` },
    { n: '질문 제시', w: .07,
      screen: '전체 화면 타이틀 카드. 이번 영상에서 다룰 질문 한 줄',
      note: () => '다음 내용을 계속 봐야 하는 이유를 만든다.' },
    { n: '기준 1', w: .18, screen: '큰 제목 → 짧은 설명 → 시각 근거 하나',
      note: () => '핵심 기준 1을 여기서 설명한다.' },
    { n: '기준 2', w: .18, screen: '큰 제목 → 짧은 설명 → 시각 근거 하나',
      note: () => '핵심 기준 2를 여기서 설명한다.' },
    { n: '기준 3', w: .18, screen: '큰 제목 → 짧은 설명 → 시각 근거 하나',
      note: () => '핵심 기준 3을 여기서 설명한다.' },
    { n: '실제 적용', w: .16,
      screen: '실제 사용 화면과 현장 이미지',
      note: () => '앞의 세 기준이 실제 단지 상황에서 어떻게 쓰이는지 구체적인 장면으로 보여준다.' },
    { n: '정리 · 다음 행동', w: .12,
      screen: '앞부분은 3줄 요약, 뒷부분은 앱 화면을 실제로 보여준다. 로고와 안내 문구는 여기서만',
      note: () => `앞의 기준을 3줄로 요약한 뒤, 아파트스퀘어 앱에서 무엇을 확인할 수 있는지 화면으로 보여준다. ${app.join(' / ')}` }
  ];

  const out = [];
  let t = 0;
  for (const p of plan) {
    const d = Math.round(len * p.w), start = t;
    t += d;
    const end = Math.min(t, len), total = end - start;
    const n = Math.max(1, Math.round(total / SCENE_SEC));
    for (let i = 0; i < n; i++) {
      const a = start + Math.round(total * i / n);
      const c = start + Math.round(total * (i + 1) / n);
      out.push({
        part: p.n,
        name: p.n + (n > 1 ? ` (${i + 1}/${n})` : ''),
        from: a, to: c, dur: c - a,
        screen: p.screen + (n > 1 ? ' — ' + SCREEN_VAR[i % SCREEN_VAR.length] : ''),
        note: p.note
      });
    }
  }
  return out;
}

export function buildPrompt(opts) {
  const {
    keyword,
    trade = '없음',
    audience = '입대의',
    len = 180,
    avatarCuts = 2,
    avatarCutSec = 6,
    company = DEFAULTS.company,
    app = DEFAULTS.app,
    brand = DEFAULTS.brand,
    palette = DEFAULTS.palette,
    tone = DEFAULTS.tone,
    figures = []          // 추가로 확인된 수치가 있으면
  } = opts;

  const tr = TRADES[trade] || TRADES['없음'];
  const au = AUDIENCES[audience] || AUDIENCES['입대의'];
  const sc = buildScenes(len, app);

  // 아바타를 어느 장면에 넣을지 (앞뒤 우선)
  const avaIdx = [0, sc.length - 1, Math.floor(sc.length / 2)]
    .slice(0, avatarCuts)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b);

  const b = [];
  b.push('당신은 정보형 브랜드 영상의 연출가입니다. 아래 사양대로 영상을 만들어 주세요.');
  b.push('');
  b.push('# 주제');
  b.push(keyword);
  b.push('');
  b.push('# 스스로 정할 것');
  b.push('- 이 주제에서 시청자가 확인해야 할 판단 기준을 정확히 3개로 정하세요.');
  b.push('- 세 기준이 실제 단지 상황에서 쓰이는 장면을 구체적으로 정하세요. 가상의 회사명이나 실존 업체명은 쓰지 마세요.');
  b.push('- 확정한 내용을 표로 먼저 보여 주고, 승인을 받은 뒤 영상을 생성하세요.');
  b.push('');
  b.push('# 영상 사양');
  b.push(`- 길이: ${len}초 (±5초 허용)`);
  b.push('- 화면비: 16:9');
  b.push('- 자막: 한국어, 전 구간 표시');
  b.push(`- 색: ${palette}`);
  b.push(`- 톤: ${tone}`);
  b.push('- 아래 장면 목록의 개수와 구간을 그대로 지킬 것');
  b.push('- 모든 장면은 화면 전체를 채웁니다. 영상이나 이미지를 화면 일부에만 놓고');
  b.push('  나머지를 단색 배경으로 비우지 마세요. 위아래 여백이 생기면 안 됩니다.');
  b.push('- 제목과 자막은 소재 위에 오버레이로 올립니다.');
  b.push('- 화면을 나눠야 할 때는 좌우 분할까지만. 아래쪽 절반을 빈 배경으로 두지 마세요.');
  b.push('');
  b.push('# 회사와 서비스 (사실. 바꾸거나 덧붙이지 마세요)');
  company.forEach(x => b.push('- ' + x));
  b.push('');
  b.push('# 시청자');
  b.push(`- 대상: ${au.label}`);
  b.push(`- 시청 후 기대 행동: ${au.goal}`);
  b.push(`- 어휘 수준: ${au.vocab}`);
  b.push('');
  b.push('# 등장인물과 배경');
  CAST.forEach(x => b.push('- ' + x));
  b.push('');
  b.push('# 아바타 운용');
  b.push(`- 아바타는 ${avaIdx.length}개 장면에만 ${avatarCutSec}초 내외로 짧게 등장합니다. 나머지 구간은 내레이션과 그래픽으로만 채웁니다.`);
  b.push('- 등장할 때마다 같은 위치·같은 크기로 나와야 합니다.');
  b.push('');
  b.push('# 연출 원칙');
  PRINCIPLES.forEach(x => b.push('- ' + x));
  b.push('');
  b.push(`# 장면 구성 — 아래 ${sc.length}개 장면을 순서대로 하나씩 만들어 주세요`);
  b.push('장면을 합치거나 줄이지 마세요. 한 장면이 20초를 넘으면 안 됩니다.');
  b.push('');
  sc.forEach((s, i) => {
    const on = avaIdx.includes(i) ? '  ← 아바타 등장' : '';
    b.push(`장면 ${i + 1} [${s.from}~${s.to}초] ${s.name}${on}`);
    b.push(`  화면: ${s.screen}`);
    b.push(`  내용: ${s.note(keyword)}`);
  });

  if (tr.grades.length) {
    b.push('');
    b.push('# 등급별 판단 기준 (설계보고 기준. 화면에 표로 써도 됩니다)');
    b.push('상태 / 등급 / 보수 방법');
    tr.grades.forEach(g => b.push(`- ${g[0]} / ${g[1]} / ${g[2]}`));
    b.push('');
    b.push('# 단지가 확인할 항목');
    tr.checks.forEach(c => b.push('- ' + c));
  }

  b.push('');
  b.push('# 화면에 표시할 수치');
  const allFigures = [...tr.figures, ...figures];
  if (allFigures.length) {
    b.push('아래는 확인된 값입니다. 이 범위 안에서만 수치를 쓰세요.');
    allFigures.forEach(f => b.push('- ' + f));
    b.push('- 위에 적힌 값 외에 어떤 숫자나 통계도 새로 만들어 넣지 마세요.');
  } else {
    b.push('- 확인된 수치가 제공되지 않았습니다. 구체적인 숫자나 통계를 화면에 넣지 마세요.');
  }

  b.push('');
  b.push('# 마지막 구간의 앱 소개 (반드시 포함)');
  b.push('마지막 챕터의 뒷부분에서 앱 화면을 실제로 보여 주며 아래 내용을 전달합니다.');
  app.forEach(x => b.push('- ' + x));
  b.push('- 기능을 나열하지 말고, 화면에서 무엇을 확인할 수 있는지 보여 주세요.');
  b.push('');
  b.push('# 마무리 문구');
  b.push(au.cta);
  b.push('');
  b.push('# 브랜드 규칙');
  brand.forEach(x => b.push('- ' + x));
  b.push('');
  b.push('# 금지 사항');
  [
    '근거 없는 수치·통계 생성',
    '내레이션과 자막의 문장이 서로 다른 경우',
    '주제와 무관한 스톡 영상 사용',
    '특정 업체를 실명으로 비교하거나 평가하는 표현',
    '결정을 대신 내려 주는 듯한 표현. 판단 근거를 정리해 주는 역할로만 서술',
    '시공을 직접 하는 회사처럼 서술하는 것',
    '실제 단지명, 세대수, 설계 금액, 계약 금액을 화면이나 내레이션에 노출하는 것',
    '특정 업체의 공법명이나 제품명을 언급하는 것',
    '영상을 여러 편으로 나누려 하는 것. "1부", "2부", "다음 편에서"는 쓰지 않습니다',
    '여러 장면을 하나로 합치는 것. 목록에 적힌 장면 수를 그대로 지킵니다',
    '화면 아래쪽이나 옆을 단색으로 비워 두는 레이아웃',
    '서양인 모델, 영문 간판, 해외 주택 외관이 보이는 영상·이미지'
  ].forEach(x => b.push('- ' + x));

  return { text: b.join('\n'), scenes: sc, sceneCount: sc.length };
}
