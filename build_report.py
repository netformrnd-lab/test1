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
    if stack or len(imgs) == 1:
        style = f' style="grid-template-columns:repeat({cols},1fr);"' if cols > 1 else ""
        boxes = "\n      ".join(_img_box(e, alt) for e in imgs)
        return f'<div class="img-grid"{style}>\n      {boxes}\n    </div>'
    primary = _img_box(imgs[0], alt)
    thumbs = "\n        ".join(_img_box(e, alt, thumb=True) for e in imgs[1:])
    return (f'<div class="img-grid">\n      {primary}\n'
            f'      <div class="thumb-row">\n        {thumbs}\n      </div>\n    </div>')


def card(number, title, specs, imgs, url=None, url_text="제품 링크", pending=False,
         stack=False, cols=1, span=False, badge=None):
    badge_text = badge or ("정보 확인 예정" if pending else None)
    badge = f'<span class="pend-badge">{badge_text}</span>' if badge_text else ""
    is_pending = pending or bool(badge_text)
    cls = "product-card" + (" pending" if is_pending else "") + (" fullspan" if span else "")
    return f"""<div class="{cls}">
  <div class="product-card-header">
    <h3>{number} {title}</h3>
    {link_btn(url, url_text)}
  </div>
  <div class="product-card-body">
    {images_block(imgs, title, cols=cols, stack=stack)}
    {badge}
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
          ("기본수량", "1,000개 (최소주문 1개)"),
          ("단가", "1,000개 <strong>338원</strong> ~ 50,000개 288원 (VAT 별도)")],
         [{"path": "01_볼펜_검정_목업.png", "label": "목업 — 블랙", "mock": True},
          {"path": "02_볼펜_흰색_목업.png", "label": "목업 — 화이트"}],
         url="https://daehangift-gyeonggi.com/shop/view.php?index_no=726254"),
    card("②", "고려기프트 — 네오블랙 젤펜 (B3865)",
         [("모델", "B3865"), ("타입", "무광 블랙 젤펜 (젤심)"),
          ("인쇄", "인쇄비 무료"),
          ("단가", "500개 <strong>359원</strong> ~ 50,000개 292원 (VAT 별도)"),
          ("제작기간", "영업일 3~4일")],
         [{"path": "04_네오블랙_젤펜_목업.png", "label": "목업 — 아파트스퀘어 로고", "mock": True},
          {"path": "03_네오블랙_젤펜_원본.png", "label": "원본"}],
         url="https://koreagift.com/ez/mall.php?cat=001002000&query=view&no=53123"),
    card("③", "에어슬림 볼펜 (흰/네이비/검정 3색)",
         [("모델", "B8459"),
          ("타입", "클릭형 슬림 볼펜 (골드 포인트)"),
          ("색상", "화이트, 네이비, 블랙 3색"),
          ("인쇄", "실크 인쇄 (인쇄비 무료)"),
          ("단가", "200개 <strong>1,330원</strong> ~ 10,000개 1,170원 (VAT 별도)"),
          ("제작기간", "영업일 3~5일")],
         [{"path": "05_에어슬림_볼펜.png", "label": "목업 — 3색 (골드 포인트)", "mock": True}],
         url="https://koreagift.com/ez/mall.php?cat=001002000&query=view&no=198014"),
    card("④", "노블 무광 볼펜 (흰/검정 2색)",
         [("모델", "B7512"),
          ("타입", "트위스트형 무광 볼펜 (골드 포인트)"),
          ("색상", "화이트, 블랙 2색"),
          ("인쇄", "인쇄비 무료"),
          ("단가", "100개 <strong>1,820원</strong> ~ 10,000개 1,570원 (VAT 별도)"),
          ("제작기간", "영업일 3~5일")],
         [{"path": "06_노블_무광_볼펜.png", "label": "목업 — 무광 고급형", "mock": True, "dark": True}],
         url="https://koreagift.com/ez/mall.php?cat=001002000&query=view&no=160146"),
]

# ----- 2. 손전등 / 랜턴 -----
flash_cards = [
    card("①", "홍보물닷컴 — 미니 펜라이트 (14×85mm)",
         [("모델", "클립 미니후레쉬 小 (No.130495)"),
          ("규격", "14 × 85mm"),
          ("인쇄", "기본수량 이상 인쇄 무료"),
          ("단가", "100개 <strong>3,270원</strong> ~ 5,000개 2,860원 (VAT 별도)")],
         [{"path": "07_미니_펜라이트_스튜디오_목업.png", "label": "목업 — 스튜디오", "mock": True},
          {"path": "08_미니_펜라이트_라이프스타일_목업.png", "label": "목업 — 라이프스타일"}],
         url="https://www.hongbomool.com/new/shop/detail.php?start=0&code=130495"),
    card("②", "가나기프트 — 하이파워 LED 줌 랜턴",
         [("타입", "LED 줌 랜턴 (줌 조절)"),
          ("인쇄", "기본수량 이상 인쇄 무료"),
          ("단가", "100개 <strong>4,350원</strong> ~ 5,000개 3,470원 (VAT 별도)"),
          ("재고", "<strong>현재 품절</strong>")],
         [{"path": "10_하이파워_LED_줌_랜턴_목업.png", "label": "목업 — 아파트스퀘어 로고", "mock": True},
          {"path": "09_하이파워_LED_줌_랜턴_원본.jpg", "label": "원본"}],
         url="https://www.ganagift.co.kr/new/shop/detail.php?start=&code=173345"),
    card("③", "벤딕트 BEAM-LX800 — 충전식 LED 손전등",
         [("밝기", "1,000루멘"), ("조사 거리", "800m"),
          ("특징", "자석 내장, COB 조명, USB 충전"),
          ("리뷰", "2,180건"), ("단가", "<strong>39,900원</strong> (42% 할인)")],
         [{"path": "11_벤딕트_BEAM-LX800.jpg", "label": "제품 이미지"}],
         url="https://brand.naver.com/vendict/products/11458530519", url_text="네이버 링크"),
    card("④", "Shadowhawk SH1476 — 초강력 LED 손전등",
         [("밝기", "2,000루멘"), ("방수", "IP67"),
          ("배터리", "5,000mAh, 12시간 사용"),
          ("리뷰", "214건"), ("단가", "<strong>29,700원</strong> (40% 할인)")],
         [{"path": "12_Shadowhawk_SH1476.jpg", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9217364344?itemId=27233625678", url_text="쿠팡 링크"),
]

# ----- 3. 함수율 측정기 -----
moist_cards = [
    card("①", "리녹(RINOC) 5in1 벽스캐너 (목재·금속·전선 탐지)",
         [("기능", "목재/금속/전선/AC전선/스터드 5in1 탐지"),
          ("표시", "LCD 백라이트"),
          ("상품평", "36개 / 평점 4.0"),
          ("단가", "<strong>25,340원</strong> (와우 12% 할인, 정가 28,900원)")],
         [{"path": "리녹.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9168776109?itemId=27018617058",
         url_text="쿠팡 링크"),
    card("②", "티앤디시스템 목재 수분측정기 (GM605)",
         [("모델", "GM605"),
          ("측정 방식", "핀타입 (2핀 접촉식) · 홀드 기능"),
          ("대상", "목재"),
          ("상품평", "41개 / 평점 4.5"),
          ("단가", "<strong>20,000원</strong> (20% 할인, 정가 25,000원) · 배송 3,000원")],
         [{"path": "티앤디.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/331406358?itemId=20066227415",
         url_text="쿠팡 링크"),
    card("③", "MT68 콘크리트 함수율측정기 (비파괴)",
         [("측정 방식", "비파괴 유도방식 (핀 불필요)"),
          ("대상", "콘크리트, 벽돌, 석고보드 등"),
          ("단가", "<strong>139,260원</strong>")],
         [{"path": "13_MT68_함수율측정기.jpg", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9575236206?itemId=28580819389", url_text="쿠팡 링크"),
    card("④", "CT-7822S 건축용 수분계 (전자파 방식)",
         [("측정 방식", "전자파 방식 (비파괴)"),
          ("대상", "건축 자재 전반"),
          ("단가", "<strong>153,200원</strong>")],
         [{"path": "14_CT-7822S_수분계.jpg", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/8906011099?itemId=26203505510", url_text="쿠팡 링크"),
]

# ----- 4. 칫솔치약세트 -----
tooth_cards = [
    card("①", "제이웨이기프트 — 이즈 슬림사이즈 휴대용 치약칫솔세트",
         [("구성", "실리콘손잡이 칫솔 + 치약 (슬림 휴대케이스)"),
          ("기본수량", "150개"),
          ("단가", "150개 <strong>2,485원</strong> ~ 7,500개 2,198원 (VAT 별도)")],
         [{"path": "16_이즈_슬림_칫솔치약세트_목업.png", "label": "목업 — 아파트스퀘어 로고", "mock": True},
          {"path": "15_이즈_슬림_칫솔치약세트_원본.png", "label": "원본"}],
         url="https://www.jwaygift.com/product_w/product_view_d.asp?p_idx=421691"),
    card("②", "기프트인포 — 시니바이트 디아고 칫솔치약세트 (국내생산)",
         [("구성", "칫솔 + 치약(SHINY BITE) + 종이케이스"),
          ("케이스", "종이케이스(기본) 무료"),
          ("단가", "100개 <strong>2,980원</strong> ~ 10,000개 2,630원 (VAT 별도)"),
          ("제작기간", "영업일 3~4일")],
         [{"path": "18_시니바이트_디아고_목업.png", "label": "목업 — 아파트스퀘어 로고", "mock": True},
          {"path": "17_시니바이트_디아고_원본.png", "label": "원본"}],
         url="https://giftinfo.co.kr/shop/view.php?item=819866"),
    card("③", "제이웨이기프트 — 굿즈 골드넬 여행용 칫솔치약세트",
         [("구성", "칫솔 + 치약(50g) + PP케이스 + 슬리브 종이케이스"),
          ("규격", "198×46×27mm"), ("기본 수량", "100개 이상"),
          ("단가", "100개 3,798원 / 5,000개 3,235원 (VAT 별도)"),
          ("인쇄", "전화 확인 필요")],
         [{"path": "19_굿즈_골드넬_칫솔치약세트.png", "label": "목업 — 아파트스퀘어 로고", "mock": True}],
         url="https://www.jwaygift.com/product_w/product_view_d.asp?p_idx=495992", url_text="제품 링크"),
    card("④", "홍보물닷컴 — 링칫솔 페리오치약(5g) 투명케이스세트",
         [("구성", "링칫솔 + 페리오치약(5g) + 투명 링케이스"),
          ("인쇄", "실크인쇄 (기본 수량 이상 무료)"),
          ("단가", "300개 669원 / 10,000개 572원 (VAT 별도)"),
          ("제작 기간", "3~4일")],
         [{"path": "20_링칫솔_페리오치약_투명케이스세트.png", "label": "목업 — 아파트스퀘어 로고", "mock": True}],
         url="https://www.hongbomool.com/new/shop/detail.php?start=&code=1913062&cid=448", url_text="제품 링크"),
]

# ----- 5. 드론 조종기 -----
dji_cards = [
    card("①", "DJI RC Pro 2 조종기",
         [("종류", "드론 조종기 (고휘도 디스플레이 내장)"),
          ("디스플레이", "Mini-LED · 2,000nit · HDR · 10bit"),
          ("명암 / 색역", "1,000,000:1 · 98% DCI-P3"),
          ("단가", "<strong>1,220,000원</strong>")],
         [{"path": "22_DJI_RC_Pro_2_현장_운용_목업.png", "label": "목업 — 현장 운용", "mock": True},
          {"path": "21_DJI_RC_Pro_2_제품_이미지.jpg", "label": "제품 이미지"}],
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
          ("소비자가", "117,000원"), ("인쇄", "전화 확인 필요")],
         [{"path": "25_K25600_장비가방.jpg", "label": "제품 이미지"}],
         url="https://www.gabang1bungi.com/product/k25600/5041/category/27/display/1/",
         url_text="제품 페이지"),
]

# ----- 7. 열화상 카메라 -----
thermal_cards = [
    card("①", "힛뷰(HEATVIEW) 열화상카메라",
         [("특징", "고해상도, 한국어 지원, 적외선 누수 탐지"),
          ("상품평", "68개 / 97% 긍정"),
          ("단가", "<strong>171,000원</strong> (50% 할인)")],
         [{"path": "26_힛뷰_열화상카메라.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9233256592?itemId=27295282745", url_text="쿠팡 링크"),
    card("②", "테릭스(THERIX) 고해상도 열화상카메라",
         [("해상도", "<strong>240×240</strong>"),
          ("특징", "동영상 촬영, 한국어 지원, USB 충전식"),
          ("상품평", "39개 / 95% 긍정"),
          ("단가", "<strong>179,500원</strong> (53% 할인)")],
         [{"path": "27_테릭스_열화상카메라.png", "label": "제품 이미지"}],
         url="https://www.coupang.com/vp/products/9072448537?itemId=26645324312", url_text="쿠팡 링크"),
]

# ----- 8. 쌍안경 -----
bino_cards = [
    card("①", "니쿠라(Nikula) 오페라글라스 쌍안경",
         [("모델", "니쿠라 오페라글라스 10×22mm"),
          ("사양", "10배율 / 대물렌즈 22mm"),
          ("상품평", "262건 / 평점 4.76"),
          ("가격", "최저 <strong>12,900원</strong> (배송비 포함)")],
         [{"path": "28_니쿠라__Nikula__쌍안경.png", "label": "제품 이미지"}],
         url="https://search.shopping.naver.com/catalog/46079948618?query=쌍안경",
         url_text="네이버 링크"),
    card("②", "라라캠프 콤팩트 쌍안경 (럭슨 LUXUN)",
         [("모델", "럭슨(LUXUN) 자동초점 오페라글라스"),
          ("특징", "자동초점 · 콘서트/뮤지컬 관람용 콤팩트"),
          ("상품평", "2,329건 / 평점 4.82"),
          ("가격", "<strong>36,800원</strong> (20% 할인, 정가 46,000원) · 배송 3,000원")],
         [{"path": "29_라라캠프_콤팩트_쌍안경.jpg", "label": "제품 이미지"}],
         url="https://smartstore.naver.com/lalacamp/products/7484467111",
         url_text="스마트스토어"),
]

# ----- 9. 겨울 유니폼 -----
uniform_cards = [
    card("①", "아트윈 A-701 쿨맥스 냉감 점퍼 (네이비)",
         [("품번", "A-701 (브랜드 아트윈)"),
          ("소재", "폴리에스터 75% · 쿨맥스 25%"),
          ("사이즈", "90–110"), ("색상", "네이비"),
          ("배송", "3,300원 (150,000원 이상 무료)"),
          ("판매가", "<strong>45,100원</strong> (VAT 포함)")],
         [{"path": "유니폼1_A701.png", "label": "목업 — 아파트스퀘어 로고 (앞/뒤)", "mock": True}],
         url="https://dyuniform.com/product/%EC%95%84%ED%8A%B8%EC%9C%88-a-701-%EC%BF%A8%EB%A7%A5%EC%8A%A4-%EB%83%89%EA%B0%90-%EC%A0%90%ED%8D%BC%EB%84%A4%EC%9D%B4%EB%B9%84/5299/category/54/display/1/",
         url_text="제품 페이지"),
    card("②", "아트윈 A-42 프라다 점퍼 (추동 내피 탈부착)",
         [("품번", "A-42 (브랜드 아트윈)"),
          ("소재", "폴리에스터 100%"),
          ("사이즈", "90–110"), ("색상", "블랙"),
          ("특징", "추동(가을·겨울)용 · 내피 탈부착"),
          ("판매가", "<strong>47,300원</strong> (VAT 포함)")],
         [{"path": "유니폼2_A42.png", "label": "목업 — 아파트스퀘어 로고 (앞/뒤)", "mock": True}],
         url="https://dyuniform.com/product/%EC%95%84%ED%8A%B8%EC%9C%88-a-42-%ED%94%84%EB%9D%BC%EB%8B%A4%EC%A0%90%ED%8D%BC%EC%B6%94%EB%8F%99%EB%82%B4%ED%94%BC%EC%B0%B0%EB%B6%80%EC%B0%A9/5230/category/54/display/1/",
         url_text="제품 페이지"),
]

# ----- 여름 유니폼 -----
summer_cards = [
    card("①", "JS유니폼 UBS-3103 — 나일론 스판 작업복 점퍼",
         [("품번", "UBS-3103 (춘하·신축성)"),
          ("종류", "작업복 점퍼 (긴팔)"),
          ("소재", "나일론 92% · 스판 8% (신축)"),
          ("사이즈", "M(95) ~ 4XL(120)"), ("색상", "블랙"),
          ("배송", "3,500원 (200,000원 이상 무료)"),
          ("판매가", "<strong>48,400원</strong> (VAT 포함, 17% 할인)")],
         [{"path": "여름유니폼1_UBS3103.png", "label": "목업 — 아파트스퀘어 로고 (앞/뒤)", "mock": True}],
         url="https://jsuniform.com/product/ubs-3103-%EB%82%98%EC%9D%BC%EB%A1%A0-%EC%8A%A4%ED%8C%90-%EC%9E%91%EC%97%85%EB%B3%B5-%EC%A0%90%ED%8D%BC-%EC%B6%98%ED%95%98%EC%8B%A0%EC%B6%95%EC%84%B1/10673/category/107/display/1/",
         url_text="제품 페이지"),
    card("②", "JS유니폼 TBS-5241 — 반팔 워크 셔츠 (여름)",
         [("품번", "TBS-5241 (여름·등판 벤틸레이션)"),
          ("종류", "반팔 워크 셔츠 (여름)"),
          ("소재", "나일론 100%"),
          ("사이즈", "M(90) ~ 4XL(115)"), ("색상", "블랙"),
          ("배송", "3,500원 (200,000원 이상 무료)"),
          ("판매가", "<strong>47,300원</strong> (VAT 포함, 2% 할인)")],
         [{"path": "여름유니폼2_TBS5241.png", "label": "목업 — 아파트스퀘어 로고 (앞/뒤)", "mock": True}],
         url="https://jsuniform.com/product/tbs-5241-%EB%B0%98%ED%8C%94-%EC%9B%8C%ED%81%AC-%EC%97%AC%EB%A6%84-%EC%A0%90%ED%8D%BC-%EC%97%AC%EB%A6%84%EB%93%B1%ED%8C%90%EB%B2%A4%EB%94%9C%EB%A0%88%EC%9D%B4%EC%85%98/10390/category/33/display/1/",
         url_text="제품 페이지"),
]

# ----- 아코디언 파일 (디자인 시안 A/B) -----
accordion_cards = [
    card("A안", "진한 네이비",
         [("컨셉", "전문성 · 신뢰감 · 무게감"),
          ("구성", "앞면 + 실제 뒷면")],
         [{"path": "아코디언_A_앞.png", "label": "A안 앞면 · 클릭 시 원본 파일", "mock": True, "file": "accordion"},
          {"path": "아코디언_A_뒤.png", "label": "A안 실제 뒷면", "file": "accordion"}]),
    card("B안", "화이트 · 코발트 블루",
         [("컨셉", "개방감 · 고급 패키지 인상 · 명료함"),
          ("구성", "앞면 + 실제 뒷면")],
         [{"path": "아코디언_B_앞.png", "label": "B안 앞면 · 클릭 시 원본 파일", "mock": True, "file": "accordion"},
          {"path": "아코디언_B_뒤.png", "label": "B안 실제 뒷면", "file": "accordion"}]),
]

# ----- 11. 하드커버 (양장) — 표지 + 내부 -----
hardcover_cards = [
    card("A안", "아파트스퀘어 하드커버 (양장)",
         [("표지", "앞: 로고·슬로건·4아이콘 / 뒤: 로고·연락처"),
          ("내부", "공동주택 유지보수의 전문감리기관 카피"),
          ("구성", "앞표지 + 책등 + 뒤표지 (220+15+220mm)")],
         [{"path": "하드커버_B.png", "label": "표지 (뒤·책등·앞) · 클릭 시 원본 PDF", "mock": True, "file": "hardcover", "hifi": True},
          {"path": "하드커버_A.png", "label": "내부 (좌·우)", "file": "hardcover"}]),
    card("B안", "아파트스퀘어 하드커버 (양장)",
         [("표지", "앞: 대형 로고·슬로건·4아이콘 / 뒤: 로고·연락처"),
          ("내부", "신뢰로 증명합니다 · 150+/1,200+/98%/10년+ · ONE-STOP"),
          ("구성", "앞표지 + 책등 + 뒤표지 (220+15+220mm)")],
         [{"path": "하드커버B_표지.png", "label": "표지 (뒤·앞) · 클릭 시 원본 PDF", "mock": True, "file": "hardcover_b", "hifi": True},
          {"path": "하드커버B_내부.png", "label": "내부 (좌·우)", "file": "hardcover_b"}]),
]

# ----- A4 리플릿 (디자인 시안 A/B) -----
leaflet_cards = [
    card("A안", "딥네이비 히어로형",
         [("앞면", "아파트 보수공사, 끝까지 함께합니다"),
          ("뒷면", "결정은 쉽게, 근거는 남게 — Q&A 4"),
          ("톤", "딥네이비 · 항공사진 · 무게감/신뢰")],
         [{"path": "리플릿A_앞.png", "label": "A안 앞면 · 클릭 시 원본 PDF", "mock": True, "file": "leaflet_a", "hifi": True},
          {"path": "리플릿A_뒤.png", "label": "A안 뒷면", "file": "leaflet_a", "hifi": True}]),
    card("B안", "라이트 프로세스형",
         [("앞면", "모든 과정을 한 곳에서 — 통합 관리 5단계"),
          ("뒷면", "무엇을 점검하고 무엇을 드리나"),
          ("톤", "화이트 · 밝고 명료 · 프로세스 강조")],
         [{"path": "리플릿B_앞.png", "label": "B안 앞면 · 클릭 시 원본 PDF", "mock": True, "file": "leaflet_b", "hifi": True},
          {"path": "리플릿B_뒤.png", "label": "B안 뒷면", "file": "leaflet_b", "hifi": True}]),
]

sections_html = "".join([
    section("1", "볼펜 / 젤펜", "4종 검토", pen_cards),
    section("2", "손전등 / 랜턴", "4종 비교", flash_cards),
    section("3", "함수율 측정기", "4종 비교", moist_cards),
    section("4", "칫솔치약세트", "4종 비교", tooth_cards),
    section("5", "드론 조종기", "현장 운용 장비", dji_cards),
    section("6", "장비가방", "3종 비교 — 가격 전화 견적 필수", bag_cards),
    section("7", "열화상 카메라", "2종 비교", thermal_cards),
    section("8", "쌍안경", "2종 비교", bino_cards),
    section("9", "겨울 유니폼", "2종 검토", uniform_cards),
    section("10", "여름 유니폼", "2종 — 춘하/여름", summer_cards),
    section("11", "A4 리플릿 (디자인 시안)", "A/B 시안 — 택1 결정 필요", leaflet_cards),
    section("12", "아코디언 파일 (디자인 시안)", "A/B 시안 — 택1 결정 필요", accordion_cards),
    section("13", "하드커버 (디자인 시안)", "A/B 시안 — 택1 결정 필요", hardcover_cards),
])

# ---------------------------------------------------------------------------
# 요약 지표
# ---------------------------------------------------------------------------
summary_cards = [("13", "검토 카테고리"), ("34", "검토 항목"),
                 ("41", "확보 이미지"), ("23", "목업 시안")]
summary_html = "\n".join(
    f'      <div class="stat-card"><div class="stat-num">{n}</div>'
    f'<div class="stat-label">{l}</div></div>' for n, l in summary_cards)

TODAY = "2026-07-30"

# 원본 파일(클릭 시 새 탭에서 열람) 임베드
ORIGINALS = {
    "accordion": {"mime": "image/png", "name": "아파트스퀘어_아코디언_AB.png",
                  "b64": raw_b64(ORIGDIR / "아코디언_원본.png")},
    "hardcover": {"mime": "application/pdf", "name": "아파트스퀘어_하드커버.pdf",
                  "b64": raw_b64(ORIGDIR / "하드커버_원본.pdf")},
    "leaflet_a": {"mime": "application/pdf", "name": "아파트스퀘어_리플릿_A안.pdf",
                  "b64": raw_b64(ORIGDIR / "리플릿A_원본.pdf")},
    "leaflet_b": {"mime": "application/pdf", "name": "아파트스퀘어_리플릿_B안.pdf",
                  "b64": raw_b64(ORIGDIR / "리플릿B_원본.pdf")},
    "hardcover_b": {"mime": "application/pdf", "name": "아파트스퀘어_하드커버_B안.pdf",
                    "b64": raw_b64(ORIGDIR / "하드커버B_원본.pdf")},
}
originals_js = ",\n".join(
    f'  "{k}": {{mime:"{v["mime"]}", name:"{v["name"]}", b64:"{v["b64"]}"}}'
    for k, v in ORIGINALS.items())

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
  .product-card-header {{ display:flex; align-items:center; gap:8px; padding:14px 15px;
    background:#f8fafc; border-bottom:1px solid var(--line); min-height:58px; }}
  .product-card.pending .product-card-header {{ background:#fffbeb; }}
  .product-card-header h3 {{ font-size:14.5px; font-weight:700; line-height:1.4; }}
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
  <div class="sub">볼펜 · 손전등 · 함수율 · 칫솔 · DJI · 장비가방 · 열화상 · 쌍안경 · 겨울/여름 유니폼 · 리플릿 · 아코디언 · 하드커버</div>
  <div class="meta">
    <span class="chip">작성일 {TODAY}</span>
    <span class="chip">총 13개 카테고리</span>
    <span class="chip">34개 항목 검토</span>
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
    · 「정보 확인 예정」 카드는 이미지만 확보된 상태로, 세부 스펙·단가는 추후 반영됩니다.<br>
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
  function openOriginal(f){{
    var bin = atob(f.b64), n = bin.length, arr = new Uint8Array(n);
    for (var i=0;i<n;i++) arr[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([arr], {{type: f.mime}}));
    var w = window.open(url, '_blank');
    setTimeout(function(){{ URL.revokeObjectURL(url); }}, 60000);
  }}
  document.addEventListener('click', function(e){{
    var t = e.target;
    if (t.tagName === 'IMG' && t.closest('.img-box')) {{
      var key = t.getAttribute('data-file');
      if (key && ORIGINALS[key]) {{ openOriginal(ORIGINALS[key]); return; }}
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

OUT.write_text(DOC, encoding="utf-8")
print(f"저장 완료: {OUT.name}  ({len(DOC):,} bytes / {len(DOC)/1024/1024:.2f} MB)")
