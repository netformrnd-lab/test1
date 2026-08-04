# -*- coding: utf-8 -*-
"""
아파트스퀘어 회사소개 책자 빌더
- booklet/svg/ 의 9개 SVG(p1_cover ~ p9_closing)를 Chromium(Playwright)으로 A4 렌더링
- 각 페이지를 JPEG로 A4 PDF에 배치하여 단일 책자 PDF 생성
- 출력: booklet/아파트스퀘어_회사소개_책자.pdf
필요: pip install playwright PyMuPDF Pillow  /  Chromium 실행파일 경로 지정
"""
import glob, os
from io import BytesIO
from PIL import Image
import fitz
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SVGDIR = os.path.join(HERE, "svg")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
OUT = os.path.join(HERE, "아파트스퀘어_회사소개_책자.pdf")

def render_pages():
    svgs = sorted(glob.glob(os.path.join(SVGDIR, "*.svg")))
    imgs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={"width": 794, "height": 1123}, device_scale_factor=3)
        for s in svgs:
            svg = open(s, encoding="utf-8").read()
            html = ('<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}'
                    'html,body{width:794px;height:1123px}'
                    'svg{width:794px !important;height:1123px !important;display:block}</style>' + svg)
            pg.set_content(html, wait_until="load"); pg.wait_for_timeout(500)
            imgs.append(pg.screenshot())
        b.close()
    return imgs

def build_pdf(shots):
    doc = fitz.open(); A4 = fitz.paper_rect("a4")
    for png in shots:
        im = Image.open(BytesIO(png)).convert("RGB")
        buf = BytesIO(); im.save(buf, "JPEG", quality=88, optimize=True)
        page = doc.new_page(width=A4.width, height=A4.height)
        page.insert_image(page.rect, stream=buf.getvalue())
    doc.save(OUT, deflate=True, garbage=4)
    print("saved", OUT, os.path.getsize(OUT)//1024, "KB")

if __name__ == "__main__":
    build_pdf(render_pages())
