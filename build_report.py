# -*- coding: utf-8 -*-
"""
판촉물 검토보고서 HTML 빌더 (자체 완결형)
- images/ 폴더의 실제 제품 이미지를 웹 최적화(리사이즈+JPEG)하여 base64로 임베드
- 단독 실행 가능한 단일 HTML 파일 생성
- 출력: 판촉물_검토보고서.html
"""
import base64
import html as _html
from io import BytesIO
from pathlib import Path
from PIL import Image

BASE = Path(__file__).parent
IMGDIR = BASE / "images"
ORIGDIR = IMGDIR / "originals"
OUT = BASE / "판촉물_검토보고서.html"
OUT_SHORT = BASE / "판촉물_검토보고서_제작물제외.html"


def raw_b64(path):
    return base64.b64encode(Path(path).read_bytes()).decode()


# ---------------------------------------------------------------------------
# 이미지: 실제 파일이 있으면 웹 최적화 후 임베드, 없으면 SVG 플레이스홀더
# ---------------------------------------------------------------------------
def optimize_b64(path, max_side, quality=82):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > max_side:
        r = max_side / max(w, h)
        im = im.resize((round(w * r), round(h * r)), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def placeholder(label, dark=False):
    bg = "#1a1a2e" if dark else "#f1f5f9"
    fg = "#90caf9" if dark else "#94a3b8"
    sub = "#5c6b7a" if dark else "#cbd5e1"
    safe = _html.escape(label)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
  <rect width="480" height="300" fill="{bg}"/>
  <g fill="none" stroke="{sub}" stroke-width="3">
    <rect x="180" y="108" width="120" height="84" rx="8"/><circle cx="240" cy="150" r="26"/></g>
  <circle cx="288" cy="122" r="5" fill="{sub}"/>
  <text x="240" y="228" font-family="sans-serif" font-size="20" font-weight="700"
        fill="{fg}" text-anchor="middle">{safe}</text>
  <text x="240" y="256" font-family="sans-serif" font-size="13"
        fill="{sub}" text-anchor="middle">이미지 준비 예정</text>
</svg>"""
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def img_src(entry, thumb=False):
    path = entry.get("path")
    if path and (IMGDIR / path).exists():
        if thumb:
            ms, q = 460, 82
        elif entry.get("hifi"):          # 디자인 시안: 실제 PDF에 가깝게 고해상도
            ms, q = 1480, 92
        else:
            ms, q = 1000, 82
        return optimize_b64(IMGDIR / path, max_side=ms, quality=q)
    return placeholder(entry["label"], entry.get("dark", False))


# ---------------------------------------------------------------------------
# 카드 렌더링
# ---------------------------------------------------------------------------
def link_btn(url, text):
    if not url:
        return ""
    return (f'<a href="{url}" target="_blank" rel="noopener" class="link-btn secondary" '
            f'style="margin-left:auto; white-space:nowrap;">{text} →</a>')


def spec_rows(specs):
    return "\n".join(f"      <tr><th>{th}</th><td>{td}</td></tr>" for th, td in specs)


def _img_box(entry, alt, thumb=False):
    label = entry["label"]
    dark = entry.get("dark", False)
    mock = entry.get("mock", False)
    file_attr = f' data-file="{entry["file"]}"' if entry.get("file") else ""
    label_cls = "img-label mock" if mock else "img-label"
    box_style = ' style="background:#1a1a2e;"' if dark else ""
    cls = "img-box thumb" if thumb else "img-box"
    inner = f'<img src="{img_src(entry, thumb)}" alt="{_html.escape(alt)}"{file_attr}>'
    if not thumb:
        inner += f'\n        <div class="{label_cls}">{label}</div>'
    return f'<div class="{cls}"{box_style}>{inner}</div>'


def images_block(imgs, alt, cols=1, stack=False):
    if not imgs:
        return ""
    if stack or len(imgs) == 1:
        style = f' style="grid-template-columns:repeat({cols},1fr);"' if cols > 1 else ""
        boxes = "\n      ".join(_img_box(e, alt) for e in imgs)
        return f'<div class="img-grid"{style}>\n      {boxes}\n    </div>'
    primary = _img_box(imgs[0], alt)
    thumbs = "\n        ".join(_img_box(e, alt, thumb=True) for e in imgs[1:])
    return (f'<div class="img-grid">\n      {primary}\n'
            f'      <div class="thumb-row">\n        {thumbs}\n      </div>\n    </div>')


def card(number, title, specs, imgs, url=None, url_text="제품 링크", pending=False,
         stack=False, cols=1, span=False, badge=None, decided=None):
    badge_text = badge or ("정보 확인 예정" if pending else None)
    badge = f'<span class="pend-badge">{badge_text}</span>' if badge_text else ""
    is_pending = pending or bool(badge_text)
    cls = "product-card" + (" pending" if is_pending else "") + (" fullspan" if span else "") + (" decided" if decided else "")
    dec_html = f'<span class="decided-badge">✅ {decided}</span>' if decided else ""
    return f"""<div class="{cls}">
  <div class="product-card-header">
    <h3>{number} {title}</h3>
    {dec_html}{link_btn(url, url_text)}
  </div>
  <div class="product-card-body">
    {images_block(imgs, title, cols=cols, stack=stack)}
    {badge}
    <table class="spec-table">
{spec_rows(specs)}
    </table>
  </div>
</div>"""


def section(num, title, badge, cards, decision=None):
    grid = "\n".join(cards)
    badge_html = f'<span class="section-badge">{badge}</span>' if badge else ""
    dec_html = (f'<span class="decided-badge">✅ 3차 회의 결정 · {decision}</span>'
                if decision else "")
    return f"""<!-- ===== {num}. {title} ===== -->
<section class="report-section">
  <div class="section-header">
    <div class="section-num">{num}</div>
    <div class="section-title">{title}</div>
    {badge_html}{dec_html}
  </div>
  <div class="product-grid">
{grid}
  </div>
</section>
"""


# ===========================================================================
# 제품 정의  (제품명·순서·링크: 확정 리스트 기준)
# ===========================================================================

# ----- 1. 볼펜 / 젤펜 -----
pen_cards = [
    card("①", "대한기프트 — 클릭형 볼펜 (흑/백 2컬러)",
         [("모델", "피오나 흑백 라바노크펜0.5 (K663053)"),
          ("색상", "블랙 / 화이트 2컬러"),
          ("심", "0.5mm 독일잉크 저점도 니들심"),
          ("인쇄", "패드/UV 풀컬러 인쇄 (인쇄비 무료)"),
          ("포장", "종이케이스 (가로 18 × 세로 154mm)"),
          ("기본수량", "1,000개 (최소주문 1개)"),
          ("단가", "1,000개 <strong>338원</strong> ~ 50,000개 288원 (VAT 별도)")],
         [{"path": "01_볼펜_검정_목업.png", "label": "목업 — 블랙", "mock": True},
          {"path": "02_볼펜_흰색_목업.png", "label": "목업 — 화이트"},
          {"path": "볼펜_종이케이스.png", "label": "종이케이스 포장 (18×154mm)"}],
         url="https://daehangift-gyeonggi.com/shop/view.php?index_no=726254"),
    card("②", "에어슬림 볼펜 (흰/네이비/검정 3색)",
         [("모델", "B8459"),
          ("타입", "클릭형 슬림 볼펜 (골드 포인트)"),
          ("색상", "화이트, 네이비, 블랙 3색"),
          ("인쇄", "실크 인쇄 (인쇄비 무료)"),
          ("케이스 옵션", "고급 하드케이스 추가 가능 (175 × 43 × 22mm)"),
          ("단가", "200개 <strong>1,330원</strong> ~ 10,000개 1,170원 (VAT 별도)"),
          ("제작기간", "영업일 3~5일")],
         [{"path": "05_에어슬림_볼펜.png", "label": "목업 — 3색 (골드 포인트)", "mock": True},
          {"path": "볼펜_하드케이스.png", "label": "고급 하드케이스 (추가 옵션 · 175×43×22mm)"}],
         url="https://koreagift.com/ez/mall.php?cat=001002000&query=view&no=198014"),
]

# ----- 2. 손전등 / 랜턴 -----
flash_cards = [
    card("①", "브리사 LED 후레쉬 손전등 (가나기프트)",
         [("상품번호", "183505 (가나기프트)"),
          ("규격 / 색상", "136~156 × 34 × 26mm · 검정"),
          ("인쇄 / 포장", "스티커인쇄 (옵션 레이저인쇄) · 개별케이스"),
          ("제작 / 생산", "3~4일 · 중국"),
          ("단가", "100개 <strong>6,450원</strong> ~ 5,000개 4,780원 (VAT 별도)")],
         [{"path": "손전등_브리사_목업.png", "label": "목업 — 아파트스퀘어 로고 · 클릭 시 크게 보기", "mock": True, "hifi": True},
          {"path": "손전등_브리사.png", "label": "제품 이미지"}],
         url="https://www.ganagift.co.kr/new/shop/detail.php?start=&code=183505&cid=194&price1=&price2=",
         url_text="제품 페이지"),
    card("②", "줌-인 비상등 후레쉬 (가나기프트)",
         [("상품번호", "131088 (가나기프트)"),
          ("규격 / 재질", "110×35mm · 알루미늄"),
          ("구성", "30W 줌-인 비상등 · 나침반 케이스 + 건전지 포함"),
          ("인쇄 / 포장", "레이저인쇄 · 종이케이스"),
          ("단가", "100개 <strong>9,170원</strong> ~ 5,000개 7,790원 (VAT 별도)")],
         [{"path": "손전등_줌인_목업.png", "label": "목업 — 아파트스퀘어 로고 · 클릭 시 크게 보기", "mock": True, "hifi": True},
          {"path": "손전등_줌인.png", "label": "제품 이미지"}],
         url="https://www.ganagift.co.kr/new/shop/detail.php?start=&code=131088&cid=194&price1=&price2=",
         url_text="제품 페이지"),
    card("③", "벤딕트 BEAM-LX800 — 충전식 LED 손전등",
         [("모델", "벤딕트 BEAM-LX800 (네이버)"),
          ("밝기 / 조사거리", "1,000루멘 · 800m"),
          ("특징", "자석 내장 · COB 조명 · USB 충전"),
          ("상품평", "2,180건"),
          ("단가", "<strong>39,900원</strong> (42% 할인)")],
         [{"path": "11_벤딕트_BEAM-LX800.jpg", "label": "제품 이미지"}],
         url="https://brand.naver.com/vendict/products/11458530519", url_text="네이버 링크"),
    card("④", "Shadowhawk SH1476 — 초강력 LED 손전등",
         [("모델", "Shadowhawk SH1476 (쿠팡)"),
          ("밝기 / 방수", "2,000루멘 · IP67"),
          ("배터리", "5,000mAh · 최대 12시간 사용"),
          ("상품평", "214건"),
          ("단가", "<strong>29,700원</strong> (40% 할인)")],
         [{"path": "12_Shadowhawk_SH1476.jpg", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9217364344?itemId=27233625678", url_text="쿠팡 링크"),
]

# ----- 3. 함수율 측정기 -----
moist_cards = [
    card("①", "MT68 구형 감지 수분 측정기 (R&D)",
         [("브랜드 / 모델", "R&D · MT68 구형 감지 수분 측정기"),
          ("측정 범위 / 정확도", "00.0~100.0 · ±2.5% (25°C 상온)"),
          ("탐침 / 측정 깊이", "탐침 58mm · 측정 깊이 5~40mm"),
          ("표시 / 경보", "2.4인치 컬러 LCD · 표시등+버저 경보 · 30분 자동전원차단"),
          ("전원 / 규격", "AAA 3개 · 202×55×26mm · 약 165g(건전지 포함)"),
          ("단가", "<strong>139,260원</strong>")],
         [{"path": "13_MT68_함수율측정기.jpg", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9575236206?itemId=28580819389", url_text="쿠팡 링크"),
    card("②", "CT-7822S 건축 자재 수분 측정기 (4단계)",
         [("품명 / 표시", "건축 자재 수분 측정기 · 3자리 17mm LCD"),
          ("측정 범위 / 오차", "1%~40% · ±(1%Rh+1) · 분해능 1%"),
          ("측정 단계", "1 대리석·타일 / 2 콘크리트·시멘트·석고 / 3 벽돌·점토 / 4 시멘트·모르타르"),
          ("작동 / 규격", "-10~60°C · 습도 0~70% · 165×58mm · 본체 90g (측정 두께 50mm↑)"),
          ("단가", "<strong>153,200원</strong>")],
         [{"path": "14_CT-7822S_수분계.jpg", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/8906011099?itemId=26203505510", url_text="쿠팡 링크"),
    card("③", "다솔 — 멀티 함수율 측정기 (GM605)",
         [("브랜드 / 모델", "BENETECH GM605 (판매자 다솔)"),
          ("수분 측정", "2~24% 등 재질별 · 오차 ±2% · 최소단위 0.10%"),
          ("습도 / 사용온도", "20~90%RH · 0~40°C"),
          ("기능 / 전원", "자동온도보상 · 데이터 기억 · 1.5V AAA 2개(별도)"),
          ("규격", "135.6×55×29.4mm · 166g"),
          ("상품평", "13개"),
          ("단가", "<strong>27,000원</strong> (22% 할인, 정가 35,000원) · 배송 2,500원")],
         [{"path": "함수율5_GM605.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/7324088438?itemId=18790807866",
         url_text="쿠팡 링크"),
]


# ----- 5. 드론 조종기 -----
dji_cards = [
    card("①", "DJI RC Pro 2 조종기",
         [("종류", "드론 조종기 (고휘도 디스플레이 내장)"),
          ("디스플레이", "Mini-LED · 2,000nit · HDR · 10bit"),
          ("명암 / 색역", "1,000,000:1 · 98% DCI-P3"),
          ("단가", "<strong>1,220,000원</strong>")],
         [{"path": "21_DJI_RC_Pro_2_제품_이미지.jpg", "label": "제품 이미지"}],
         url="https://www.dji.com/rc-pro-2", url_text="DJI 공식"),
]

# ----- 6. 장비가방 -----
bag_cards = [
    card("①", "장비가방 GM085 — 가방공장코리아",
         [("업체", "가방공장코리아 (02-971-2155)"),
          ("단가", "전화 견적 문의"), ("인쇄", "전화 확인 필요")],
         [{"path": "23_장비가방_GM085.jpg", "label": "제품 이미지"}],
         url="https://5297834.co.kr/product/%EC%9E%A5%EB%B9%84%EA%B0%80%EB%B0%A9-gm085/4564/category/57/display/1/",
         url_text="제품 페이지"),
    card("②", "장비가방 GM103 — 가방클럽",
         [("업체", "가방클럽 (1577-9006)"), ("최소 수량", "100개 이상"),
          ("단가", "전화 견적 문의"), ("인쇄", "전화 확인 필요")],
         [{"path": "24_장비가방_GM103.jpg", "label": "제품 이미지"}],
         url="https://www.gabangclub.com/product/%EC%9E%A5%EB%B9%84%EA%B0%80%EB%B0%A9-gm103/9880/category/149/display/1/",
         url_text="제품 페이지"),
    card("③", "K25600 — 가방1번지",
         [("업체", "가방1번지 (02-932-5674)"), ("최소 수량", "1개 이상"),
          ("소비자가", "117,000원"), ("인쇄", "자사 로고 인쇄 적용")],
         [{"path": "25_K25600_장비가방.jpg", "label": "제품 이미지"}],
         url="https://www.gabang1bungi.com/product/k25600/5041/category/27/display/1/",
         url_text="제품 페이지"),
]

# ----- 7. 열화상 카메라 -----
thermal_cards = [
    card("①", "힛뷰(HEATVIEW) 열화상카메라",
         [("해상도", "적외선 <strong>96×96</strong> · AI 실시간 초해상도 240×240"),
          ("측정 범위", "-20°C ~ 550°C"),
          ("특징", "무초점(포커스프리) · 시야각 50°×50° · 2000mAh 충전식"),
          ("상품평", "68개 / 97% 긍정"),
          ("단가", "<strong>171,000원</strong> (50% 할인)")],
         [{"path": "26_힛뷰_열화상카메라.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9233256592?itemId=27295282745", url_text="쿠팡 링크"),
    card("②", "GOYOJO GW192A 스마트폰 열화상 카메라 (ED-148)",
         [("타입", "스마트폰 USB 연결형 (열감지 열화상)"),
          ("모델", "GW192A / ED-148"),
          ("배송", "무료배송 (CJ대한통운)"),
          ("판매자 평가", "82% (363)"),
          ("판매가", "<strong>149,900원</strong>")],
         [{"path": "열화상2_GOYOJO.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9771964987?itemId=29250440403", url_text="쿠팡 링크"),
]

# ----- 8. 쌍안경 -----
bino_cards = [
    card("①", "라라캠프 콤팩트 쌍안경 (럭슨 LUXUN)",
         [("모델", "럭슨(LUXUN) 콘서트글라스 (이지포커스)"),
          ("사양", "10배율 / 구경 25mm / 시야각 7.8° · 럭슨 광학렌즈코팅"),
          ("특징", "이지포커스(1초 미만 초점) · 문화관람용 콤팩트"),
          ("상품평", "2,329건 / 평점 4.82"),
          ("판매가", "<strong>36,800원</strong> (20% 할인, 정가 46,000원) · 배송 3,000원")],
         [{"path": "29_라라캠프_콤팩트_쌍안경.jpg", "label": "제품 이미지"}],
         url="https://smartstore.naver.com/lalacamp/products/7484467111",
         url_text="스마트스토어"),
    card("②", "프로딘 클리어뷰 10×25 FMC코팅 쌍안경 (그린)",
         [("모델", "프로딘(PRODEAN) 클리어뷰 10×25 (상품번호 832204)"),
          ("사양", "10배율 / 대물렌즈 25mm / FMC 멀티코팅"),
          ("컬러", "밀리터리 그린"),
          ("판매가", "<strong>26,000원</strong>")],
         [{"path": "쌍안경3_프로딘.png", "label": "제품 이미지"}],
         url="https://www.cscamera.com/shop/shopdetail.html?branduid=832204&xcode=048&mcode=018&scode=005",
         url_text="제품 링크"),
]

# ----- 9. 겨울 유니폼 -----
uniform_cards = [
    card("①", "윌비 CT-703 인퀼팅 하프코트 (겨울 롱패딩 · 블랙)",
         [("품번", "CT-703 인퀼팅 하프코트 (브랜드 윌비 WILLBE)"),
          ("종류", "겨울 패딩 하프코트(롱) · 탈착식 후드"),
          ("소재", "나일론 100%"),
          ("사이즈 / 색상", "85–120 · 블랙"),
          ("디테일", "CORDURA 포켓 라벨 · 세로형 가슴 로고 + 등판 로고·슬로건"),
          ("배송", "3,300원 (150,000원 이상 무료)"),
          ("판매가", "<strong>125,400원</strong> (VAT 포함)")],
         [{"path": "겨울패딩_앞.png", "label": "목업 — 앞면(가슴 로고) · 클릭 시 크게 보기", "mock": True, "hifi": True}],
         url="https://dyuniform.com/product/ct-703-%EC%9D%B8%ED%80%BC%ED%8C%85-%ED%95%98%ED%94%84-%EC%BD%94%ED%8A%B8/6107/category/179/display/1/",
         url_text="제품 페이지"),
    card("②", "지벤 ZB-J2357 캐주얼 포켓 패딩 점퍼 (동복 · 블랙)",
         [("품번", "ZB-J2357 (브랜드 지벤 ZIBEN)"),
          ("종류", "겨울 패딩 점퍼(숏패딩) · 탈착식 후드 · 등판 폴라플리스 패치"),
          ("소재", "나일론 100% / 폴리에스터 100%(배색) · LOW DENIA 패딩 충전재"),
          ("사이즈 / 색상", "M · L · XL · 2XL · 3XL · 4XL / 블랙"),
          ("디테일", "가슴 지퍼포켓 · 팔 암포켓 · 뒤 암홀 후레쉬 · 세로형 가슴 로고"),
          ("원산지 / 시즌", "인도네시아 · 가을·겨울"),
          ("판매가", "<strong>76,700원</strong> (VAT 포함)")],
         [{"path": "겨울패딩2_ZBJ2357.png", "label": "목업 — 앞면(가슴 로고) · 클릭 시 크게 보기", "mock": True, "hifi": True}],
         url="https://dyuniform.com/product/%EC%A7%80%EB%B2%A4-zb-j2357-%EC%BA%90%EC%A3%BC%EC%96%BC-%ED%8F%AC%EC%BC%93-%ED%8C%A8%EB%94%A9-%EC%A0%90%ED%8D%BC-%EB%8F%99%EB%B3%B5%ED%8C%A8%EB%94%A9/7219/category/44/display/1/",
         url_text="제품 페이지"),
]


# ----- 11. 하드커버 (양장) — 표지 + 내부 -----
hardcover_cards = [
    card("📕", "아파트스퀘어 하드커버 (양장)",
         [("표지", "앞: 로고·슬로건·4아이콘 / 뒤: 로고·연락처"),
          ("내부", "공동주택 유지보수의 전문감리기관 카피"),
          ("구성", "앞표지 + 책등 + 뒤표지 (220+15+220mm)")],
         [{"path": "하드커버_목업.png", "label": "실물 목업 (펼침) · 클릭 시 원본 PDF", "mock": True, "file": "hardcover", "hifi": True},
          {"path": "하드커버_B.png", "label": "표지 (뒤·책등·앞)", "file": "hardcover"},
          {"path": "하드커버_A.png", "label": "내부 (좌·우)", "file": "hardcover"}]),
]

# ----- A4 리플릿 (4p 완성본) -----
leaflet_cards = [
    card("📄", "아파트스퀘어 리플릿 (A4 · 4p)",
         [("구성", "표지 · SERVICE(감리 프로세스 5단계) · 앱·기록 · 클로징"),
          ("형식", "A4 · 4페이지 (양면 2장)"),
          ("원본", "이미지 클릭 시 리플릿 PDF 새 탭 열림")],
         [{"path": "리플릿_p1.png", "label": "표지 · 클릭 시 원본 PDF", "mock": True, "file": "leaflet", "hifi": True},
          {"path": "리플릿_p2.png", "label": "SERVICE", "file": "leaflet"},
          {"path": "리플릿_p3.png", "label": "SERVICE 이어서", "file": "leaflet"},
          {"path": "리플릿_p4.png", "label": "클로징", "file": "leaflet"}]),
]

# ----- 제안서 -----
proposal_cards = [
    card("📑", "공동주택 유지보수 감리 제안서",
         [("구성", "표지 · 회사소개 · 서비스 · 감리 프로세스 · 품질/안전 · 사례 등"),
          ("형식", "스크롤형 PDF (세로 연결)"),
          ("원본", "표지 이미지 클릭 시 제안서 PDF 새 탭 열림")],
         [{"path": "제안서_표지.png", "label": "표지 · 클릭 시 제안서 PDF 전체", "mock": True, "file": "proposal", "hifi": True}]),
]

# ----- 감리 사원증 (ID카드) -----
idcard_cards = [
    card("🪪", "아파트스퀘어 감리 사원증 (ID카드)",
         [("앞면", "로고 · '감리' · 성명(김지원 / Kim Ji Won)"),
          ("뒷면", "이용 안내 4항 · 회사 정보(건축·설계감리 컨설팅)"),
          ("용도", "현장 감리 착용 ID카드 (세로형)")],
         [{"path": "사원증.png", "label": "앞면 · 뒷면 · 클릭 시 크게 보기", "mock": True, "hifi": True}]),
    card("🪪", "사원증 디자인 A — 단색 블루",
         [("앞면", "로고 · '감리원' 대형 타이포"),
          ("뒷면", "회사 소개 (아파트 유지보수 전문 감리) · aptsquare.net"),
          ("스타일", "플랫 블루 · 심볼 패턴")],
         [{"path": "사원증_디자인A.png", "label": "앞면 · 뒷면 시안 · 클릭 시 크게 보기", "mock": True, "hifi": True}]),
    card("🪪", "사원증 디자인 B — 아파트 그래픽",
         [("앞면", "로고 · '감리원' · 아파트 일러스트"),
          ("뒷면", "회사 소개 · 아파트 라인 그래픽 · aptsquare.net"),
          ("스타일", "네이비 그라데이션 · 건물 배경")],
         [{"path": "사원증_디자인B.png", "label": "앞면 · 뒷면 시안 · 클릭 시 크게 보기", "mock": True, "hifi": True}]),
    card("🪪", "실물 목업 — 박도윤 (현장관리 매니저)",
         [("성명", "박도윤 · 현장관리 매니저"),
          ("사번", "EMPLOYEE ID  AS-24028"),
          ("스타일", "네이비 홀더 · 도면 그리드 배경")],
         [{"path": "사원증_목업1.png", "label": "실물 목업 · 클릭 시 크게 보기", "mock": True, "hifi": True}]),
    card("🪪", "실물 목업 — 김하늘 (프로젝트 매니저)",
         [("성명", "김하늘 · 프로젝트 매니저"),
          ("사번", "EMPLOYEE ID  AS-24017"),
          ("스타일", "투명 홀더 · 블루 웨이브")],
         [{"path": "사원증_목업2.png", "label": "실물 목업 · 클릭 시 크게 보기", "mock": True, "hifi": True}]),
]

# ----- 사원증 목걸이 (넥스트랩) -----
lanyard_cards = [
    card("🎗️", "사원증 목걸이 (넥스트랩 · ID 홀더용)",
         [("용도", "감리 사원증(ID카드) 착용용 종이 목걸이 명찰 (명찰 결합 출고)"),
          ("구성", "일반형(중) 명찰 102×122mm · 250g 상장용지(FSC인증) + 목걸이줄"),
          ("단가", "<strong>2,500원</strong> (37% 할인, 정가 4,000원) · 배송 5,000원(15만↑무료)"),
          ("옵션", "목걸이줄 A타입(폭 16mm) / B타입(폭 4mm) · 길이 860mm · 종이재질")],
         [{"path": "목걸이_디자인A.png", "label": "실물 목업 — 넥스트랩 + 감리원 명찰 · 클릭 시 크게 보기", "mock": True, "hifi": True},
          {"path": "명찰_페어패스.png", "label": "제품 이미지 (샘플)"}],
         url="https://smartstore.naver.com/bluemoon_livestudio/products/7176417330",
         url_text="스마트스토어 링크"),
    card("②", "온판장 — 행사용 고급 목걸이 명찰 (인쇄 제작)",
         [("용도", "행사·전시·세미나용 목걸이 명찰 (디자인+인쇄 올인원)"),
          ("구성", "고급 목걸이 명찰 + 목걸이 스트랩 (디자인 인쇄 포함)"),
          ("단가", "<strong>2,500원</strong> (소비자가 5,700원 · 56% 할인) · 국내배송 무료"),
          ("옵션", "50개 묶음 125,000원 · 신규 디자인 제작 +17,500원")],
         [{"path": "명찰_아파트스퀘어.png", "label": "실물 목업 — 감리원/현장감리 명찰 · 클릭 시 크게 보기", "mock": True, "hifi": True},
          {"path": "명찰_목업2.png", "label": "온판장 제품 샘플"}],
         url="https://onpanjang.co.kr/product/%ED%96%89%EC%82%AC%EC%9A%A9-%EA%B3%A0%EA%B8%89-%EB%AA%A9%EA%B1%B8%EC%9D%B4-%EB%AA%85%EC%B0%B0-%EC%9D%B8%EC%87%84-%EC%A0%9C%EC%9E%91/27/category/1/display/2/",
         url_text="온판장 링크"),
]

# ----- 온습도계 -----
ondo_cards = [
    card("①", "윈텍트 WT83 디지털 온습도계 (산업 전문가용)",
         [("모델", "Wintact WT83 (센서 일체형 · 데이터 홀드)"),
          ("기능", "온도·습도 측정 · MIN/MAX · HOLD"),
          ("상품평", "15개 / 평점 4.5"),
          ("배송", "무료배송 (판매자로켓 · 내일 도착)"),
          ("단가", "<strong>20,000원</strong>")],
         [{"path": "온습도계1_WT83.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/6307872315?itemId=26926439459",
         url_text="쿠팡 링크"),
    card("②", "CAS T801 체감온도계 (산업현장 휴대용)",
         [("모델", "CAS T801 (체감온도 · 온습도 · 블랙)"),
          ("기능", "체감온도 4단계(관심·주의·경고·위험) · 온도/습도 · 시계"),
          ("상품평", "44개 / 평점 4.5"),
          ("배송", "무료배송"),
          ("단가", "<strong>30,000원</strong> (1개 · 최저 단위가)")],
         [{"path": "온습도계2_CAST801.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9507244790?itemId=28329080429",
         url_text="쿠팡 링크"),
]

# 섹션 정의: (id, 제목, 배지, 카드들, 결정문구)
#   id "design" = 디자인 제작물(리플릿·하드커버·제안서·사원증) — 축약본에서 제외
SECTIONS = [
    ("product", "볼펜 / 젤펜", "2종 검토", pen_cards, None),
    ("product", "손전등 / 랜턴", "4종 비교", flash_cards, None),
    ("product", "함수율 측정기", "3종 비교", moist_cards, None),
    ("product", "드론 조종기", "현장 운용 장비", dji_cards, None),
    ("product", "장비가방", "3종 비교", bag_cards, None),
    ("product", "열화상 카메라", "2종 비교", thermal_cards, None),
    ("product", "온습도계", "2종 비교", ondo_cards, None),
    ("product", "쌍안경", "2종 비교", bino_cards, None),
    ("product", "겨울 유니폼", "겨울 패딩 2종 (롱·숏)", uniform_cards, None),
    ("design", "A4 리플릿", "4p 완성본 · 클릭 시 원본 PDF", leaflet_cards, None),
    ("design", "하드커버 (양장)", "클릭 시 원본 PDF", hardcover_cards, None),
    ("design", "제안서", "클릭 시 원본 PDF", proposal_cards, None),
    ("design", "감리 사원증 (ID카드)", "앞/뒤 · 클릭 시 크게 보기", idcard_cards, None),
    ("product", "사원증 목걸이 / 명찰", "넥스트랩 + 목걸이 명찰 2종", lanyard_cards, None),
]


def render_sections(specs):
    return "".join(
        section(str(i + 1), title, badge, cards, decision=dec)
        for i, (_sid, title, badge, cards, dec) in enumerate(specs))


def summary_block(cards):
    return "\n".join(
        f'      <div class="stat-card"><div class="stat-num">{n}</div>'
        f'<div class="stat-label">{l}</div></div>' for n, l in cards)

TODAY = "2026-10-26"

# 원본 파일(클릭 시 새 탭에서 열람) 임베드
ORIGINALS = {
    "hardcover": {"mime": "application/pdf", "name": "아파트스퀘어_하드커버.pdf",
                  "b64": raw_b64(ORIGDIR / "하드커버_원본.pdf")},
    "leaflet": {"mime": "application/pdf", "name": "아파트스퀘어_리플릿_4p.pdf",
                "b64": raw_b64(ORIGDIR / "리플릿_원본.pdf")},
    "proposal": {"mime": "application/pdf", "name": "공동주택_유지보수_감리_제안서.pdf",
                 "b64": raw_b64(ORIGDIR / "제안서_원본.pdf")},
}
def originals_block(keys):
    return ",\n".join(
        f'  "{k}": {{mime:"{ORIGINALS[k]["mime"]}", name:"{ORIGINALS[k]["name"]}", b64:"{ORIGINALS[k]["b64"]}"}}'
        for k in keys)

# ---------------------------------------------------------------------------
# 최종 HTML
# ---------------------------------------------------------------------------
def render(sections_html, summary_html, originals_js, cover_sub, chip_cat, chip_item):
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>판촉물 검토보고서</title>
<link href="https://cdnjs.cloudflare.com/ajax/libs/pretendard/1.3.9/static/pretendard.min.css" rel="stylesheet">
<style>
  :root {{
    --bg:#f4f6fb; --card:#fff; --ink:#1e293b; --muted:#64748b; --line:#e2e8f0;
    --brand:#2563eb; --brand-dark:#1d4ed8; --accent:#0ea5e9;
    --shadow:0 2px 8px rgba(15,23,42,.06); --shadow-lg:0 8px 28px rgba(15,23,42,.10);
  }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:var(--bg); color:var(--ink); line-height:1.6; -webkit-font-smoothing:antialiased; }}
  .content {{ max-width:1440px; margin:0 auto; padding:0 24px 80px; }}

  .cover {{ background:linear-gradient(135deg,#1d4ed8 0%,#0ea5e9 100%); color:#fff;
    padding:72px 24px 60px; text-align:center; margin-bottom:40px; }}
  .cover .eyebrow {{ font-size:14px; letter-spacing:4px; text-transform:uppercase;
    opacity:.85; margin-bottom:16px; font-weight:600; }}
  .cover h1 {{ font-size:40px; font-weight:800; letter-spacing:-1px; }}
  .cover .sub {{ margin-top:14px; font-size:17px; opacity:.9; }}
  .cover .meta {{ margin-top:28px; display:inline-flex; gap:10px; flex-wrap:wrap; justify-content:center; }}
  .cover .chip {{ background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.28);
    padding:6px 16px; border-radius:999px; font-size:13px; font-weight:500; }}

  .stat-grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px;
    margin:-76px auto 44px; max-width:1392px; position:relative; z-index:2; padding:0 24px; }}
  .stat-card {{ background:var(--card); border-radius:14px; padding:22px 18px; text-align:center;
    box-shadow:var(--shadow-lg); border:1px solid var(--line); }}
  .stat-num {{ font-size:34px; font-weight:800; color:var(--brand); line-height:1; }}
  .stat-label {{ margin-top:8px; font-size:13px; color:var(--muted); font-weight:500; }}

  .report-section {{ margin-bottom:44px; }}
  .section-header {{ display:flex; align-items:center; gap:14px; margin-bottom:22px;
    padding-bottom:14px; border-bottom:2px solid var(--line); }}
  .section-num {{ width:40px; height:40px; flex:none; border-radius:11px;
    background:linear-gradient(135deg,var(--brand),var(--accent)); color:#fff;
    font-weight:800; font-size:18px; display:flex; align-items:center; justify-content:center; }}
  .section-title {{ font-size:24px; font-weight:800; letter-spacing:-.5px; }}
  .section-badge {{ margin-left:auto; background:#eff6ff; color:var(--brand-dark);
    border:1px solid #bfdbfe; padding:5px 14px; border-radius:999px; font-size:13px; font-weight:600; }}

  /* 한 줄에 4개 고정 */
  .product-grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; align-items:start; }}
  .product-card {{ background:var(--card); border:1px solid var(--line); border-radius:14px;
    overflow:hidden; box-shadow:var(--shadow); transition:transform .15s, box-shadow .15s; }}
  .product-card:hover {{ transform:translateY(-3px); box-shadow:var(--shadow-lg); }}
  .product-card.pending {{ border-color:#fcd9a8; }}
  .product-card.fullspan {{ grid-column:1 / -1; }}
  .product-card.fullspan .img-box img {{ max-height:360px; }}
  @media (max-width:720px) {{ .product-card.fullspan .img-grid {{ grid-template-columns:1fr !important; }} }}
  .product-card-header {{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:14px 15px;
    background:#f8fafc; border-bottom:1px solid var(--line); min-height:58px; }}
  .product-card.pending .product-card-header {{ background:#fffbeb; }}
  .product-card-header h3 {{ font-size:14.5px; font-weight:700; line-height:1.4;
    flex:1 1 100%; min-width:0; word-break:keep-all; }}
  .product-card-body {{ padding:15px; }}

  .img-grid {{ display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:14px; }}
  .img-box {{ background:#f1f5f9; border-radius:10px; overflow:hidden; text-align:center;
    border:1px solid var(--line); }}
  .img-box img {{ width:100%; max-height:190px; object-fit:contain; display:block; cursor:zoom-in; }}
  .img-box img[data-file] {{ cursor:pointer; }}
  .img-label {{ font-size:12px; color:var(--muted); padding:7px; font-weight:500; background:rgba(255,255,255,.6); }}
  .img-label.mock {{ color:#b45309; background:#fffbeb; }}
  .thumb-row {{ display:flex; gap:8px; }}
  .img-box.thumb {{ flex:1; }}
  .img-box.thumb img {{ max-height:66px; }}

  .pend-badge {{ display:inline-block; margin-bottom:10px; background:#fef3c7; color:#b45309;
    border:1px solid #fcd9a8; padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:600; }}

  .spec-table {{ width:100%; border-collapse:collapse; font-size:13.5px; }}
  .spec-table tr {{ border-bottom:1px solid var(--line); }}
  .spec-table tr:last-child {{ border-bottom:none; }}
  .spec-table th {{ text-align:left; padding:8px 10px 8px 0; color:var(--muted);
    font-weight:600; white-space:nowrap; vertical-align:top; width:78px; }}
  .spec-table td {{ padding:8px 0; vertical-align:top; }}
  .spec-table strong {{ color:var(--brand-dark); }}

  .link-btn {{ display:inline-block; padding:6px 12px; border-radius:8px; font-size:12px;
    font-weight:600; text-decoration:none; background:var(--brand); color:#fff; }}
  .link-btn.secondary {{ background:#e0f2fe; color:var(--brand-dark); border:1px solid #bae6fd; }}
  .link-btn.secondary:hover {{ background:#bae6fd; }}

  .decided-badge {{ background:#dcfce7; color:#166534; border:1px solid #86efac;
    padding:5px 12px; border-radius:999px; font-size:12.5px; font-weight:700; white-space:nowrap; }}
  .section-header .decided-badge {{ margin-left:8px; }}
  .product-card.decided {{ border-color:#86efac; box-shadow:0 0 0 2px #dcfce7 inset, var(--shadow); }}
  .product-card.decided .product-card-header {{ background:#f0fdf4; }}
  .product-card-header .decided-badge {{ margin-left:auto; }}
  .report-footer {{ margin-top:48px; padding:24px; background:var(--card); border:1px solid var(--line);
    border-radius:14px; font-size:13px; color:var(--muted); line-height:1.8; }}
  .report-footer strong {{ color:var(--ink); }}

  /* 이미지 클릭 확대 (라이트박스) */
  .lightbox {{ display:none; position:fixed; inset:0; background:rgba(0,0,0,.88);
    z-index:1000; align-items:center; justify-content:center; padding:24px; cursor:zoom-out; }}
  .lightbox.open {{ display:flex; }}
  .lightbox img {{ max-width:96%; max-height:96%; object-fit:contain; border-radius:8px;
    box-shadow:0 12px 48px rgba(0,0,0,.6); background:#fff; }}
  .lightbox-hint {{ position:fixed; top:16px; right:22px; color:#fff; font-size:13px; opacity:.7; }}

  @media (max-width:1200px) {{ .product-grid {{ grid-template-columns:repeat(2,1fr); }} }}
  @media (max-width:720px) {{
    .product-grid {{ grid-template-columns:1fr; }}
    .stat-grid {{ grid-template-columns:repeat(2,1fr); margin-top:-60px; }}
    .cover h1 {{ font-size:30px; }} .section-badge {{ display:none; }}
  }}
  @media print {{
    body {{ background:#fff; }}
    .product-card {{ break-inside:avoid; box-shadow:none; }}
    .cover {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  }}
</style>
</head>
<body>

<header class="cover">
  <div class="eyebrow">Promotional Goods Review</div>
  <h1>판촉물 검토보고서</h1>
  <div class="sub">{cover_sub}</div>
  <div class="meta">
    <span class="chip">작성일 {TODAY}</span>
    <span class="chip">총 {chip_cat}개 카테고리</span>
    <span class="chip">{chip_item}개 항목 검토</span>
  </div>
</header>

<div class="stat-grid">
{summary_html}
</div>

<main class="content">
{sections_html}
  <div class="report-footer">
    <strong>안내</strong><br>
    · 「목업」 표시는 아파트스퀘어 로고 적용 시안입니다.<br>
    · 단가는 조사 시점 기준이며, 판촉 인쇄·수량에 따라 변동될 수 있어 발주 전 업체 확인이 필요합니다.<br>
    · 장비가방은 전 품목 전화 견적이 필요합니다.
  </div>
</main>

<div id="lightbox" class="lightbox">
  <span class="lightbox-hint">클릭 또는 ESC로 닫기</span>
  <img id="lightbox-img" src="" alt="확대 이미지">
</div>
<script>
var ORIGINALS = {{
{originals_js}
}};
(function(){{
  var lb = document.getElementById('lightbox');
  var im = document.getElementById('lightbox-img');
  function openOriginal(f, key){{
    var bin = atob(f.b64), n = bin.length, arr = new Uint8Array(n);
    for (var i=0;i<n;i++) arr[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([arr], {{type: f.mime}}));
    var a = document.createElement('a');
    a.href = url; a.target = 'pdf_' + key; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){{ URL.revokeObjectURL(url); }}, 60000);
  }}
  document.addEventListener('click', function(e){{
    var t = e.target;
    if (t.tagName === 'IMG' && t.closest('.img-box')) {{
      var key = t.getAttribute('data-file');
      if (key && ORIGINALS[key]) {{ openOriginal(ORIGINALS[key], key); return; }}
      im.src = t.src;
      lb.classList.add('open');
    }} else if (lb.classList.contains('open')) {{
      lb.classList.remove('open');
    }}
  }});
  document.addEventListener('keydown', function(e){{
    if (e.key === 'Escape') lb.classList.remove('open');
  }});
}})();
</script>
</body>
</html>"""

def item_count(specs):
    return sum(len(cards) for _sid, _t, _b, cards, _d in specs)


def build(out_path, specs, originals_keys, cover_sub, summary_cards):
    sections_html = render_sections(specs)
    summary_html = summary_block(summary_cards)
    originals_js = originals_block(originals_keys)
    cats = len(specs)
    items = item_count(specs)
    doc = render(sections_html, summary_html, originals_js, cover_sub, cats, items)
    out_path.write_text(doc, encoding="utf-8")
    print(f"저장 완료: {out_path.name}  ({len(doc):,} bytes / {len(doc)/1024/1024:.2f} MB)")


FULL_SUB = ("볼펜 · 손전등 · 함수율 · DJI · 장비가방 · 열화상 · 온습도계 · 쌍안경 · "
            "겨울 유니폼 · 리플릿 · 하드커버 · 제안서 · 사원증 · 목걸이")
SHORT_SUB = ("볼펜 · 손전등 · 함수율 · DJI · 장비가방 · 열화상 · 온습도계 · 쌍안경 · "
             "겨울 유니폼 · 목걸이")

# 1) 전체본
build(OUT, SECTIONS, ["hardcover", "leaflet", "proposal"], FULL_SUB,
      [(str(len(SECTIONS)), "검토 카테고리"), (str(item_count(SECTIONS)), "검토 항목"),
       ("34", "확보 이미지"), ("19", "목업 시안")])

# 2) 축약본 — 디자인 제작물(리플릿·하드커버·제안서·사원증) 제외
short_specs = [s for s in SECTIONS if s[0] != "design"]
build(OUT_SHORT, short_specs, [], SHORT_SUB,
      [(str(len(short_specs)), "검토 카테고리"),
       (str(item_count(short_specs)), "검토 항목"),
       ("28", "확보 이미지"), ("15", "목업 시안")])
