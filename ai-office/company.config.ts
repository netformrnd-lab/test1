// ============================================================
//  CRM마케팅팀 AI 오피스 설정 — 여기 한 파일만 고치면 됩니다
// ============================================================
//  회사 이름, 팀 이름, AI 직원 이름·성격·머리색까지 전부 여기 있어요.
//  다른 파일은 건드리지 않아도 됩니다.
//
//  ⚠️ 딱 2가지 규칙
//   1. 부서 id(research, brand, ...)는 절대 바꾸지 마세요. 시뮬레이션 엔진이
//      이 id로 움직입니다. 바꾸면 캐릭터가 길을 잃어요.
//      → 바꿔도 되는 건 name(부서 이름) · icon · short · task · report 입니다.
//   2. 부서는 12개를 유지하세요. 사무실 배치가 4열 3행 = 12칸 고정입니다.
//      안 쓰는 부서는 지우지 말고 이름만 바꿔서 쓰세요.
//
//  직원 수는 자유롭게 늘리고 줄여도 됩니다. 한 팀에 팀장(lead) 1명은 두세요.
//
//  📌 이 화면은 "우리 팀이 어떤 일을 돌리고 있는지" 보여주는 지도입니다.
//     실제로 글을 써주는 자동화는 저장소 맨 위 `시작하기.md` 를 보세요.
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  /** 좌측 상단 헤더에 뜨는 회사 이름 */
  name: "CRM MARKETING TEAM",
  /** 헤더 로고 배지에 들어갈 글자 1개 (이모지도 됩니다) */
  logoLetter: "N",
  /** 화면 상단 큰 제목 (앞부분) */
  titlePrefix: "넷폼알앤디",
  /** 화면 상단 큰 제목 (강조되는 뒷부분) */
  titleAccent: "CRM마케팅팀 AI 오피스",
  /** 브라우저 탭 제목 */
  pageTitle: "CRM마케팅팀 AI 오피스 — 콘텐츠 마케팅 자동화",
  /** 검색·공유될 때 뜨는 설명 */
  description:
    "고객 이해 → 여정 설계 → 메시지 → 콘텐츠 제작 → 검수 → 발행 → 성과까지, CRM마케팅팀의 콘텐츠 마케팅 파이프라인을 12개 AI 팀으로 돌립니다.",
  /** 창 하단 파일명 느낌의 라벨 */
  windowLabel: "crm_marketing_office.exe — 팀장실",
  /** 일일 브리핑 제목에 들어갈 이름 */
  reportName: "CRM마케팅팀",
} as const;

/**
 * 대표(나) — 사무실 대표실에 앉아 있는 캐릭터
 * 👉 name / callsign / role 을 본인 것으로 바꾸세요.
 */
export const CEO_PROFILE = {
  name: "우리팀장", // ← 여기에 본인 이름을 넣으세요
  callsign: "팀장님",
  role: "CRM마케팅팀 · 최종 검수와 발행 결정",
  hair: "#42283a",
  shirt: "#ff8fc0",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "AI는 초안까지, 발행 버튼은 사람이 누른다.",
    "이 콘텐츠는 고객 여정 어느 단계를 위한 거지?",
    "원메시지에서 벗어났으면 다시 쓴다.",
  ],
};

/**
 * 부서 12개 = CRM마케팅팀이 실제로 하는 일의 흐름.
 * 고객 이해 → 여정 설계 → 메시지·원고 → 제작 → 검수 → 발행 → 성과
 *
 * id = 고정(엔진용) / name·short·icon = 자유롭게 변경
 * task = 오늘 하는 일 / report = 팀장 한줄보고
 */
export const DEPARTMENTS = [
  {
    id: "research",
    name: "시장·경쟁사 조사팀",
    short: "market.research",
    icon: "🔎",
    task: "경쟁사 현황·업계 동향 수집",
    report: "출처를 확인하고 오늘 볼 것만 추려요.",
  },
  {
    id: "brand",
    name: "고객 이해팀",
    short: "voc.persona",
    icon: "🧬",
    task: "VOC 수집·분석, 페르소나 갱신",
    report: "고객이 실제로 쓴 말 그대로 남깁니다.",
  },
  {
    id: "strategy1",
    name: "고객여정 설계팀",
    short: "journey.map",
    icon: "🧭",
    task: "인지→관심→비교→문의→계약→이용→재구매→추천 설계",
    report: "어느 단계에서 고객이 빠지는지부터 봅니다.",
  },
  {
    id: "qa",
    name: "콘텐츠 검수팀",
    short: "qa.check",
    icon: "🛡️",
    task: "톤앤매너·근거·중복·과장표현 검사",
    report: "기준에서 벗어난 원고는 되돌려보내요.",
  },
  {
    id: "strategy2",
    name: "메시지·원고팀",
    short: "message.copy",
    icon: "✍️",
    task: "원메시지 기반 블로그·랜딩 원고 작성",
    report: "확정된 메시지만 글로 옮깁니다.",
  },
  {
    id: "reels",
    name: "영상 기획 브리프팀",
    short: "video.brief",
    icon: "🎬",
    task: "미디어마케팅팀에 넘길 영상 기획 방향 정리",
    report: "촬영은 미디어팀, 우리는 방향만 넘겨요.",
  },
  {
    id: "carousel",
    name: "디자인 제작팀",
    short: "design.studio",
    icon: "🖼️",
    task: "카드뉴스·배너·썸네일 시안",
    report: "브랜드 디자인 기준 안에서만 만듭니다.",
  },
  {
    id: "partner",
    name: "언론홍보·커뮤니티팀",
    short: "pr.press",
    icon: "💌",
    task: "보도자료 초안·커뮤니티 반응 확인",
    report: "초안까지만 씁니다. 배포는 사람이 해요.",
  },
  {
    id: "finance",
    name: "세일즈자료팀",
    short: "sales.docs",
    icon: "🧾",
    task: "제안서·카탈로그·리플렛 문안",
    report: "영업이 바로 쓸 수 있는 말로 정리해요.",
  },
  {
    id: "review",
    name: "검색·성과 분석팀",
    short: "seo.report",
    icon: "📈",
    task: "SEO/GEO/AEO·키워드·포털 1페이지 점검",
    report: "지표 연동 전에는 수치를 지어내지 않아요.",
  },
  {
    id: "ops",
    name: "발행 운영팀",
    short: "publish.ops",
    icon: "⚙️",
    task: "콘텐츠 캘린더·발행 일정·홈페이지 운영",
    report: "발행 전 검수 통과 여부부터 확인합니다.",
  },
  {
    id: "secretary",
    name: "비서실",
    short: "secretary.hq",
    icon: "📋",
    task: "팀 전체 한줄보고·오늘의 결정거리",
    report: "결정할 것만 남기고 나머지는 지워요.",
  },
] as const;

/**
 * AI 직원 명단.
 * dept = 위 부서 id / rank: "lead"(팀장) 또는 "member"(팀원)
 * colors = [머리색, 옷색, 포인트색]
 * thoughts = 자리를 비웠을 때 머리 위에 뜨는 혼잣말
 */
export type StaffEntry = {
  dept: string;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // ① 시장·경쟁사 조사팀
  { dept: "research", rank: "lead", name: "김서연", role: "리서치 팀장", callsign: "김리서",
    colors: ["#6b3d34", "#fff3b0", "#ff8fc0"],
    thoughts: ["출처 없는 수치는 안 씁니다.", "경쟁사 랜딩이 이번 달에 바뀌었네.", "원문부터 다시 본다."] },
  { dept: "research", rank: "member", name: "오태윤", role: "경쟁사 모니터링",
    colors: ["#2f2a3d", "#c9b8ff", "#b8f0dd"],
    thoughts: ["경쟁사 블로그 이번 주 3건 올라왔어요.", "우리가 안 다룬 각도가 하나 보입니다."] },
  { dept: "research", rank: "member", name: "하은채", role: "포털 1페이지 점검",
    colors: ["#8a4a3c", "#b8f0dd", "#ff8fc0"],
    thoughts: ["네이버 1페이지에서 우리 글이 밀렸어요.", "다음은 아직 유지 중입니다."] },

  // ② 고객 이해팀
  { dept: "brand", rank: "lead", name: "박보라", role: "고객 이해 팀장", callsign: "박보이스",
    colors: ["#372b4a", "#c9b8ff", "#c9b8ff"],
    thoughts: ["고객이 쓴 말을 우리 말로 바꾸지 마세요.", "이 불만은 벌써 세 번째예요.", "페르소나 업데이트할 때가 됐다."] },
  { dept: "brand", rank: "member", name: "신재원", role: "VOC 수집·분류",
    colors: ["#3c3a4f", "#ffe6f2", "#c9b8ff"],
    thoughts: ["문의 게시판에서 같은 질문이 반복돼요.", "가격보다 시공 후 관리가 걱정이래요."] },
  { dept: "brand", rank: "member", name: "임다혜", role: "Pain Point 정리",
    colors: ["#5a3450", "#fff3b0", "#ff8fc0"],
    thoughts: ["진짜 고민은 '비교할 기준이 없다'예요.", "인터뷰 원문 링크 붙여둘게요."] },

  // ③ 고객여정 설계팀
  { dept: "strategy1", rank: "lead", name: "최아름", role: "여정 설계 팀장", callsign: "최퍼널",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"],
    thoughts: ["이 콘텐츠는 어느 단계용인가요?", "비교 단계가 통째로 비어 있어요.", "이탈 지점부터 막습니다."] },
  { dept: "strategy1", rank: "member", name: "정유진", role: "단계별 콘텐츠 정의",
    colors: ["#7b4a2f", "#b8f0dd", "#ff8fc0"],
    thoughts: ["문의 직전에 볼 자료가 없네요.", "재구매 단계는 아직 손도 못 댔어요."] },
  { dept: "strategy1", rank: "member", name: "배시현", role: "채널 매칭",
    colors: ["#2c2638", "#fff3b0", "#c9b8ff"],
    thoughts: ["이 단계 고객은 검색으로 옵니다.", "SNS로 계약까지 끌고 가긴 어려워요."] },

  // ④ 콘텐츠 검수팀
  { dept: "qa", rank: "lead", name: "윤규아", role: "검수 팀장", callsign: "윤큐아",
    colors: ["#2d4b46", "#b8f0dd", "#b8f0dd"],
    thoughts: ["근거 없는 '최고·1위'는 바로 반려입니다.", "톤앤매너 기준 다시 봅니다."] },
  { dept: "qa", rank: "member", name: "강태오", role: "근거·중복 검사",
    colors: ["#463227", "#ffe6f2", "#b8f0dd"],
    thoughts: ["지난달 글이랑 40% 겹쳐요.", "인증·수상 표기는 원문 확인이 필요합니다."] },
  { dept: "qa", rank: "member", name: "문세라", role: "톤 검수",
    colors: ["#6c3a55", "#c9b8ff", "#fff3b0"],
    thoughts: ["말투가 브랜드마다 달라지고 있어요.", "전문용어는 한 번은 풀어줍시다."] },

  // ⑤ 메시지·원고팀
  { dept: "strategy2", rank: "lead", name: "한도빈", role: "원고 팀장", callsign: "한원고",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"],
    thoughts: ["확정된 원메시지 안에서만 씁니다.", "결론은 하나로 닫아야 해요."] },
  { dept: "strategy2", rank: "member", name: "조민서", role: "블로그 원고",
    colors: ["#33304a", "#ff8fc0", "#b8f0dd"],
    thoughts: ["첫 문단에서 답을 먼저 줍니다.", "검색해서 온 사람은 오래 안 기다려요."] },
  { dept: "strategy2", rank: "member", name: "백가온", role: "랜딩·이메일 카피",
    colors: ["#5d3a2c", "#b8f0dd", "#c9b8ff"],
    thoughts: ["CTA가 두 개면 하나도 안 눌러요.", "약속은 지킬 수 있는 것만 씁니다."] },

  // ⑥ 영상 기획 브리프팀
  { dept: "reels", rank: "lead", name: "송리원", role: "영상 브리프 팀장", callsign: "송브리프",
    colors: ["#2c2638", "#ff8fc0", "#ff8fc0"],
    thoughts: ["촬영은 미디어팀 몫, 우리는 방향만.", "메시지 한 줄로 못 줄이면 영상도 안 됩니다."] },
  { dept: "reels", rank: "member", name: "권지호", role: "레퍼런스 정리",
    colors: ["#4a3a2a", "#fff3b0", "#b8f0dd"],
    thoughts: ["레퍼런스 3개만 붙여서 넘길게요.", "현장 촬영 필요 여부를 먼저 적습니다."] },

  // ⑦ 디자인 제작팀
  { dept: "carousel", rank: "lead", name: "이가림", role: "디자인 팀장", callsign: "이디자",
    colors: ["#d88d68", "#c9b8ff", "#c9b8ff"],
    thoughts: ["브랜드 색·서체 기준부터 확인합니다.", "필요한 장수만 만들어요."] },
  { dept: "carousel", rank: "member", name: "남주하", role: "카드뉴스·배너",
    colors: ["#3a2f4d", "#ffe6f2", "#ff8fc0"],
    thoughts: ["표지에서 한 문장으로 끝나야 해요.", "글자 밀도 맞추는 중."] },
  { dept: "carousel", rank: "member", name: "표하늘", role: "썸네일·상세 이미지",
    colors: ["#274a44", "#fff3b0", "#b8f0dd"],
    thoughts: ["마지막 장 CTA 빠지면 반려예요.", "원본 템플릿은 복제만 합니다."] },

  // ⑧ 언론홍보·커뮤니티팀
  { dept: "partner", rank: "lead", name: "정파랑", role: "홍보 팀장", callsign: "정피알",
    colors: ["#563a32", "#b8f0dd", "#b8f0dd"],
    thoughts: ["보도자료는 사실만, 형용사는 뺍니다.", "배포는 사람이 최종 확인 후에."] },
  { dept: "partner", rank: "member", name: "구예성", role: "커뮤니티 모니터링",
    colors: ["#452d3f", "#c9b8ff", "#fff3b0"],
    thoughts: ["카페에 우리 브랜드 질문이 올라왔어요.", "댓글 초안까지만 준비해둘게요."] },

  // ⑨ 세일즈자료팀
  { dept: "finance", rank: "lead", name: "오재민", role: "세일즈자료 팀장", callsign: "오세일",
    colors: ["#313b56", "#fff3b0", "#fff3b0"],
    thoughts: ["영업이 그대로 읽을 수 있게 씁니다.", "고객이 묻는 순서대로 배치해요."] },
  { dept: "finance", rank: "member", name: "심우진", role: "제안서·카탈로그",
    colors: ["#4b3b2c", "#b8f0dd", "#c9b8ff"],
    thoughts: ["경쟁사 비교표는 근거가 있어야 해요.", "가격 표기는 확인 전엔 비워둡니다."] },

  // ⑩ 검색·성과 분석팀
  { dept: "review", rank: "lead", name: "강성아", role: "검색·성과 팀장", callsign: "강성과",
    colors: ["#9c5c72", "#ff8fc0", "#ff8fc0"],
    thoughts: ["잘된 이유를 패턴으로 남겨야 해요.", "노출은 늘었는데 문의는 그대로네요."] },
  { dept: "review", rank: "member", name: "마지훈", role: "키워드 관리",
    colors: ["#2e3a4a", "#ffe6f2", "#b8f0dd"],
    thoughts: ["이 키워드는 경쟁이 너무 셉니다.", "롱테일부터 먹고 올라가죠."] },
  { dept: "review", rank: "member", name: "여름", role: "콘텐츠 성과 기록",
    colors: ["#6b4a2f", "#c9b8ff", "#fff3b0"],
    thoughts: ["반복할 패턴 1개, 중단할 패턴 1개.", "AI 답변에 우리 글이 인용됐는지 확인 중."] },

  // ⑪ 발행 운영팀
  { dept: "ops", rank: "lead", name: "안도현", role: "발행 운영 팀장", callsign: "안발행",
    colors: ["#3b3b49", "#b8f0dd", "#b8f0dd"],
    thoughts: ["검수 통과 안 된 건 캘린더에 안 올립니다.", "이번 주 발행 예정 4건이에요."] },
  { dept: "ops", rank: "member", name: "천유나", role: "홈페이지 콘텐츠 운영",
    colors: ["#573049", "#fff3b0", "#ff8fc0"],
    thoughts: ["연결 안 된 서비스를 연결됐다고 안 씁니다.", "랜딩 링크 깨진 거 하나 발견했어요."] },

  // ⑫ 비서실
  { dept: "secretary", rank: "lead", name: "김세리", role: "비서실장", callsign: "김비서",
    colors: ["#7a453c", "#c9b8ff", "#c9b8ff"],
    thoughts: ["팀장이 결정할 것만 추립니다.", "중복 설명은 다 지워요."] },
  { dept: "secretary", rank: "member", name: "홍보람", role: "브리핑 정리",
    colors: ["#334a3a", "#ffe6f2", "#fff3b0"],
    thoughts: ["상태별로 묶어서 올릴게요.", "막힌 건 먼저 보고해요."] },
];

/**
 * 외부 연동을 아직 안 붙인 팀 → 화면에 "연동 대기"로 표시됩니다.
 * 실제로 연결한 게 생기면 그 줄을 지우세요. 전부 초록불로 보고 싶으면 {} 로 두면 됩니다.
 */
export const PENDING_INTEGRATIONS: Record<string, string> = {
  brand: "VOC 데이터 연동",
  review: "검색 순위·성과 지표 연동",
  ops: "홈페이지 지표 연동",
};

/**
 * 결과 보관함 링크 (Notion 등). 비워두면 화면에서 링크 버튼이 숨겨집니다.
 * 예: "https://www.notion.so/우리팀-콘텐츠보관함"
 */
export const STORAGE_LINK = "";
