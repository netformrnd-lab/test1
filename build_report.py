# -*- coding: utf-8 -*-
"""
판촉물 검토보고서 HTML 빌더 (자체 완결형)
- 외부 파일(v9 HTML, 제품 이미지) 없이 단독 실행 가능
- 제품 이미지는 나중에 교체 가능한 SVG 플레이스홀더로 처리
- 출력: 판촉물_검토보고서.html
"""
import base64
import html as _html
from pathlib import Path

OUT = Path(__file__).with_name("판촉물_검토보고서.html")


# ---------------------------------------------------------------------------
# 이미지 플레이스홀더 (교체 가능) — 실제 이미지가 준비되면 img src만 바꾸면 됩니다.
# ---------------------------------------------------------------------------
def placeholder(label, dark=False):
    bg = "#1a1a2e" if dark else "#f1f5f9"
    fg = "#90caf9" if dark else "#94a3b8"
    sub = "#5c6b7a" if dark else "#cbd5e1"
    safe = _html.escape(label)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
  <rect width="480" height="300" fill="{bg}"/>
  <g fill="none" stroke="{sub}" stroke-width="3">
    <rect x="180" y="108" width="120" height="84" rx="8"/>
    <circle cx="240" cy="150" r="26"/>
  </g>
  <circle cx="288" cy="122" r="5" fill="{sub}"/>
  <text x="240" y="228" font-family="sans-serif" font-size="20" font-weight="700"
        fill="{fg}" text-anchor="middle">{safe}</text>
  <text x="240" y="256" font-family="sans-serif" font-size="13"
        fill="{sub}" text-anchor="middle">이미지 준비 예정 (교체 가능)</text>
</svg>"""
    b64 = base64.b64encode(svg.encode("utf-8")).decode()
    return f"data:image/svg+xml;base64,{b64}"


# ---------------------------------------------------------------------------
# 카드 생성 헬퍼
# ---------------------------------------------------------------------------
def link_btn(url, text):
    if not url:
        return ""
    return (f'<a href="{url}" target="_blank" rel="noopener" class="link-btn secondary" '
            f'style="margin-left:auto; white-space:nowrap;">{text} →</a>')


def spec_rows(specs):
    out = []
    for th, td in specs:
        out.append(f"      <tr><th>{th}</th><td>{td}</td></tr>")
    return "\n".join(out)


def placeholder_card(number, category):
    return f"""<div class="product-card placeholder">
  <div class="product-card-header">
    <h3>{number} (제품 정보 추가 예정)</h3>
  </div>
  <div class="product-card-body">
    <div class="img-grid">
      <div class="img-box">
        <img src="{placeholder(category + ' — 추가 예정')}" alt="추가 예정">
        <div class="img-label">정보 입력 대기</div>
      </div>
    </div>
    <table class="spec-table">
      <tr><th>제품명</th><td>—</td></tr>
      <tr><th>단가</th><td>—</td></tr>
      <tr><th>비고</th><td>세부 정보 확인 필요</td></tr>
    </table>
  </div>
</div>"""


def card(number, title, specs, img_label, img_dark=False, is_mock=False,
         url=None, url_text="제품 링크"):
    label_cls = "img-label mock" if is_mock else "img-label"
    label_style = ' style="color:#90caf9;"' if (is_mock and img_dark) else ""
    box_style = ' style="background:#1a1a2e;"' if img_dark else ""
    return f"""<div class="product-card">
  <div class="product-card-header">
    <h3>{number} {title}</h3>
    {link_btn(url, url_text)}
  </div>
  <div class="product-card-body">
    <div class="img-grid">
      <div class="img-box"{box_style}>
        <img src="{placeholder(img_label, img_dark)}" alt="{_html.escape(title)}">
        <div class="{label_cls}"{label_style}>{img_label}</div>
      </div>
    </div>
    <table class="spec-table">
{spec_rows(specs)}
    </table>
  </div>
</div>"""


def section(num, title, badge, cards):
    grid = "\n".join(cards)
    badge_html = f'<span class="section-badge">{badge}</span>' if badge else ""
    return f"""<!-- ===== {num}. {title} ===== -->
<section class="report-section">
  <div class="section-header">
    <div class="section-num">{num}</div>
    <div class="section-title">{title}</div>
    {badge_html}
  </div>
  <div class="product-grid">
{grid}
  </div>
</section>
"""


# ---------------------------------------------------------------------------
# 섹션별 콘텐츠 정의
# ---------------------------------------------------------------------------
pen_cards = [
    card("①", "에어슬림 볼펜 (흰/네이비/검정 3색)",
         [("타입", "클릭형 슬림 볼펜"),
          ("색상", "화이트, 네이비, 블랙 3색"),
          ("인쇄 방식", "실크 인쇄")],
         "목업 — 3색 슬림 클릭형", is_mock=True),
    card("②", "노블 무광 볼펜 (흰/검정 2색)",
         [("타입", "트위스트형 무광 볼펜"),
          ("색상", "화이트, 블랙 2색"),
          ("분위기", "프리미엄 무광 메탈 질감")],
         "목업 — 트위스트형 무광 고급", img_dark=True, is_mock=True),
    placeholder_card("③", "볼펜"),
    placeholder_card("④", "볼펜"),
]

flash_cards = [
    card("①", "벤딕트 BEAM-LX800 — 충전식 LED 손전등",
         [("밝기", "1,000루멘"),
          ("조사 거리", "800m"),
          ("특징", "자석 내장, COB 조명, USB 충전"),
          ("리뷰", "2,180건"),
          ("단가", "<strong>39,900원</strong> (42% 할인)")],
         "제품 이미지",
         url="https://brand.naver.com/vendict/products/11458530519",
         url_text="네이버 링크"),
    card("②", "Shadowhawk SH1476 — 초강력 LED 손전등",
         [("밝기", "2,000루멘"),
          ("방수", "IP67"),
          ("배터리", "5,000mAh, 12시간 사용"),
          ("리뷰", "214건"),
          ("단가", "<strong>29,700원</strong> (40% 할인)")],
         "제품 이미지",
         url="https://www.coupang.com/vp/products/9217364344?itemId=27233625678",
         url_text="쿠팡 링크"),
    placeholder_card("③", "손전등"),
    placeholder_card("④", "손전등"),
]

moist_cards = [
    card("①", "MT68 콘크리트 함수율측정기 (비파괴)",
         [("측정 방식", "비파괴 유도방식 (핀 불필요)"),
          ("대상", "콘크리트, 벽돌, 석고보드 등"),
          ("단가", "<strong>139,260원</strong>")],
         "제품 이미지",
         url="https://www.coupang.com/vp/products/9575236206?itemId=28580819389",
         url_text="쿠팡 링크"),
    card("②", "CT-7822S 건축용 수분계 (전자파 방식)",
         [("측정 방식", "전자파 방식 (비파괴)"),
          ("대상", "건축 자재 전반"),
          ("단가", "<strong>153,200원</strong>")],
         "제품 이미지",
         url="https://www.coupang.com/vp/products/8906011099?itemId=26203505510",
         url_text="쿠팡 링크"),
    placeholder_card("③", "함수율 측정기"),
    placeholder_card("④", "함수율 측정기"),
]

tooth_cards = [
    card("①", "제이웨이기프트 — 굿즈 골드넬 여행용 칫솔치약세트",
         [("구성", "칫솔 + 치약(50g) + PP케이스 + 슬리브 종이케이스"),
          ("규격", "198×46×27mm"),
          ("기본 수량", "100개 이상"),
          ("단가", "100개 기준 3,798원 / 5,000개 기준 3,235원 (부가세 별도)"),
          ("인쇄", "전화 확인 필요")],
         "목업 — 아파트스퀘어 로고 적용", is_mock=True,
         url="https://www.jwaygift.com/product_w/product_view_d.asp?p_idx=495992",
         url_text="제품 링크"),
    card("②", "홍보물닷컴 — 링칫솔 페리오치약(5g) 투명케이스세트",
         [("구성", "링칫솔 + 페리오치약(5g) + 투명 링케이스"),
          ("인쇄", "실크인쇄 (기본 수량 이상 무료)"),
          ("단가", "300개 기준 669원 / 10,000개 기준 572원 (부가세 별도)"),
          ("제작 기간", "3~4일")],
         "목업 — 아파트스퀘어 로고 적용", is_mock=True,
         url="https://www.hongbomool.com/new/shop/detail.php?start=&code=1913062&cid=448",
         url_text="제품 링크"),
    placeholder_card("③", "칫솔 세트"),
    placeholder_card("④", "칫솔 세트"),
]

bino_cards = [
    placeholder_card("①", "쌍안경"),
    placeholder_card("②", "쌍안경"),
]

bag_cards = [
    card("①", "장비가방 GM085 — 가방공장코리아",
         [("업체", "가방공장코리아 (02-971-2155)"),
          ("단가", "전화 견적 문의"),
          ("인쇄", "전화 확인 필요")],
         "제품 이미지",
         url="https://5297834.co.kr/product/%EC%9E%A5%EB%B9%84%EA%B0%80%EB%B0%A9-gm085/4564/category/57/display/1/",
         url_text="제품 페이지"),
    card("②", "장비가방 GM103 — 가방클럽",
         [("업체", "가방클럽 (1577-9006)"),
          ("최소 수량", "100개 이상"),
          ("단가", "전화 견적 문의"),
          ("인쇄", "전화 확인 필요")],
         "제품 이미지",
         url="https://www.gabangclub.com/product/%EC%9E%A5%EB%B9%84%EA%B0%80%EB%B0%A9-gm103/9880/category/149/display/1/",
         url_text="제품 페이지"),
    card("③", "K25600 — 가방1번지",
         [("업체", "가방1번지 (02-932-5674)"),
          ("최소 수량", "1개 이상"),
          ("소비자가", "117,000원"),
          ("인쇄", "전화 확인 필요")],
         "제품 이미지",
         url="https://www.gabang1bungi.com/product/k25600/5041/category/27/display/1/",
         url_text="제품 페이지"),
]

thermal_cards = [
    card("①", "힛뷰(HEATVIEW) 열화상카메라",
         [("특징", "고해상도, 한국어 지원, 적외선 누수 탐지"),
          ("상품평", "68개 / 97% 긍정"),
          ("단가", "<strong>171,000원</strong> (50% 할인)")],
         "제품 이미지",
         url="https://www.coupang.com/vp/products/9233256592?itemId=27295282745",
         url_text="쿠팡 링크"),
    card("②", "테릭스(THERIX) 고해상도 열화상카메라",
         [("해상도", "<strong>240×240</strong>"),
          ("특징", "동영상 촬영 가능, 한국어 지원, USB 충전식"),
          ("상품평", "39개 / 95% 긍정"),
          ("단가", "<strong>179,500원</strong> (53% 할인)")],
         "제품 이미지",
         url="https://www.coupang.com/vp/products/9072448537?itemId=26645324312",
         url_text="쿠팡 링크"),
]

sections_html = "".join([
    section("1", "볼펜", "4종 검토", pen_cards),
    section("2", "손전등", "4종 비교", flash_cards),
    section("3", "함수율 측정기", "4종 비교", moist_cards),
    section("4", "칫솔 세트", "4종 비교", tooth_cards),
    section("5", "장비가방", "3종 비교 — 가격 전화 견적 필수", bag_cards),
    section("6", "열화상 카메라", "2종 비교", thermal_cards),
    section("7", "쌍안경", "2종 비교", bino_cards),
])

# ---------------------------------------------------------------------------
# 요약 지표
# ---------------------------------------------------------------------------
summary_cards = [
    ("7", "검토 카테고리"),
    ("23", "검토 제품 수"),
    ("13", "정보 확보"),
    ("10", "추가 예정"),
]
summary_html = "\n".join(
    f'      <div class="stat-card"><div class="stat-num">{n}</div>'
    f'<div class="stat-label">{l}</div></div>'
    for n, l in summary_cards
)

TODAY = "2026-07-30"

# ---------------------------------------------------------------------------
# 최종 HTML
# ---------------------------------------------------------------------------
DOC = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>판촉물 검토보고서</title>
<link href="https://cdnjs.cloudflare.com/ajax/libs/pretendard/1.3.9/static/pretendard.min.css" rel="stylesheet">
<style>
  :root {{
    --bg: #f4f6fb;
    --card: #ffffff;
    --ink: #1e293b;
    --muted: #64748b;
    --line: #e2e8f0;
    --brand: #2563eb;
    --brand-dark: #1d4ed8;
    --accent: #0ea5e9;
    --shadow: 0 2px 8px rgba(15,23,42,.06);
    --shadow-lg: 0 8px 28px rgba(15,23,42,.10);
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--ink);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }}
  .content {{ max-width: 1440px; margin: 0 auto; padding: 0 24px 80px; }}

  /* ===== 커버 ===== */
  .cover {{
    background: linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%);
    color: #fff;
    padding: 72px 24px 60px;
    text-align: center;
    margin-bottom: 40px;
  }}
  .cover .eyebrow {{
    font-size: 14px; letter-spacing: 4px; text-transform: uppercase;
    opacity: .85; margin-bottom: 16px; font-weight: 600;
  }}
  .cover h1 {{ font-size: 40px; font-weight: 800; letter-spacing: -1px; }}
  .cover .sub {{ margin-top: 14px; font-size: 17px; opacity: .9; }}
  .cover .meta {{
    margin-top: 28px; display: inline-flex; gap: 10px; flex-wrap: wrap;
    justify-content: center;
  }}
  .cover .chip {{
    background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.28);
    padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 500;
  }}

  /* ===== 요약 지표 ===== */
  .stat-grid {{
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
    margin: -76px auto 44px; max-width: 1392px; position: relative; z-index: 2;
    padding: 0 24px;
  }}
  .stat-card {{
    background: var(--card); border-radius: 14px; padding: 22px 18px;
    text-align: center; box-shadow: var(--shadow-lg); border: 1px solid var(--line);
  }}
  .stat-num {{ font-size: 34px; font-weight: 800; color: var(--brand); line-height: 1; }}
  .stat-label {{ margin-top: 8px; font-size: 13px; color: var(--muted); font-weight: 500; }}

  /* ===== 섹션 헤더 ===== */
  .report-section {{ margin-bottom: 44px; }}
  .section-header {{
    display: flex; align-items: center; gap: 14px; margin-bottom: 22px;
    padding-bottom: 14px; border-bottom: 2px solid var(--line);
  }}
  .section-num {{
    width: 40px; height: 40px; flex: none; border-radius: 11px;
    background: linear-gradient(135deg, var(--brand), var(--accent));
    color: #fff; font-weight: 800; font-size: 18px;
    display: flex; align-items: center; justify-content: center;
  }}
  .section-title {{ font-size: 24px; font-weight: 800; letter-spacing: -.5px; }}
  .section-badge {{
    margin-left: auto; background: #eff6ff; color: var(--brand-dark);
    border: 1px solid #bfdbfe; padding: 5px 14px; border-radius: 999px;
    font-size: 13px; font-weight: 600;
  }}

  /* ===== 제품 카드 그리드 ===== */
  /* 한 줄에 4개 고정 배치 */
  .product-grid {{
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 16px; align-items: start;
  }}
  .product-card {{
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    overflow: hidden; box-shadow: var(--shadow); transition: transform .15s, box-shadow .15s;
  }}
  .product-card:hover {{ transform: translateY(-3px); box-shadow: var(--shadow-lg); }}
  .product-card.placeholder {{ border-style: dashed; background: #fafcff; }}
  .product-card.placeholder .product-card-header {{ background: #f1f5f9; }}
  .product-card.placeholder h3 {{ color: var(--muted); }}
  .product-card-header {{
    display: flex; align-items: center; gap: 8px;
    padding: 14px 15px; background: #f8fafc; border-bottom: 1px solid var(--line);
    min-height: 58px;
  }}
  .product-card-header h3 {{ font-size: 14.5px; font-weight: 700; line-height: 1.4; }}
  .product-card-body {{ padding: 15px; }}

  .img-grid {{ display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 16px; }}
  .img-box {{
    background: #f1f5f9; border-radius: 12px; overflow: hidden; text-align: center;
    border: 1px solid var(--line);
  }}
  .img-box img {{ width: 100%; max-height: 220px; object-fit: contain; display: block; }}
  .img-label {{
    font-size: 12px; color: var(--muted); padding: 8px; font-weight: 500;
    background: rgba(255,255,255,.6);
  }}
  .img-label.mock {{ color: #b45309; background: #fffbeb; }}

  /* ===== 스펙 테이블 ===== */
  .spec-table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  .spec-table tr {{ border-bottom: 1px solid var(--line); }}
  .spec-table tr:last-child {{ border-bottom: none; }}
  .spec-table th {{
    text-align: left; padding: 9px 12px 9px 0; color: var(--muted);
    font-weight: 600; white-space: nowrap; vertical-align: top; width: 90px;
  }}
  .spec-table td {{ padding: 9px 0; vertical-align: top; }}
  .spec-table strong {{ color: var(--brand-dark); }}

  /* ===== 링크 버튼 ===== */
  .link-btn {{
    display: inline-block; padding: 6px 12px; border-radius: 8px;
    font-size: 12px; font-weight: 600; text-decoration: none;
    background: var(--brand); color: #fff;
  }}
  .link-btn.secondary {{ background: #e0f2fe; color: var(--brand-dark); border: 1px solid #bae6fd; }}
  .link-btn.secondary:hover {{ background: #bae6fd; }}

  /* ===== 푸터 ===== */
  .report-footer {{
    margin-top: 48px; padding: 24px; background: var(--card);
    border: 1px solid var(--line); border-radius: 14px;
    font-size: 13px; color: var(--muted); line-height: 1.8;
  }}
  .report-footer strong {{ color: var(--ink); }}

  @media (max-width: 1200px) {{
    .product-grid {{ grid-template-columns: repeat(2, 1fr); }}
  }}
  @media (max-width: 720px) {{
    .product-grid {{ grid-template-columns: 1fr; }}
    .stat-grid {{ grid-template-columns: repeat(2, 1fr); margin-top: -60px; }}
    .cover h1 {{ font-size: 30px; }}
    .section-badge {{ display: none; }}
  }}
  @media print {{
    body {{ background: #fff; }}
    .product-card {{ break-inside: avoid; box-shadow: none; }}
    .cover {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  }}
</style>
</head>
<body>

<header class="cover">
  <div class="eyebrow">Promotional Goods Review</div>
  <h1>판촉물 검토보고서</h1>
  <div class="sub">볼펜 · 손전등 · 함수율 측정기 · 칫솔 세트 · 장비가방 · 열화상 카메라</div>
  <div class="meta">
    <span class="chip">작성일 {TODAY}</span>
    <span class="chip">총 7개 카테고리</span>
    <span class="chip">23개 제품 검토</span>
  </div>
</header>

<div class="stat-grid">
{summary_html}
</div>

<main class="content">
{sections_html}
  <div class="report-footer">
    <strong>안내</strong><br>
    · 제품 이미지는 플레이스홀더이며, 실제 이미지 확보 시 각 카드의 <code>img src</code>만 교체하면 됩니다.<br>
    · 「목업」 표시 항목은 아파트스퀘어/자사 로고 적용 시안입니다.<br>
    · 단가는 조사 시점 기준이며, 판촉 인쇄·수량에 따라 변동될 수 있어 발주 전 업체 확인이 필요합니다.<br>
    · 장비가방은 전 품목 전화 견적이 필요합니다.
  </div>
</main>

</body>
</html>"""

OUT.write_text(DOC, encoding="utf-8")
print(f"저장 완료: {OUT}  ({len(DOC):,} bytes)")
