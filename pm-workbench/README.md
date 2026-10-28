# 브랜드마케팅 PM 워크벤치

아파트스퀘어·POUR 브랜드마케팅 과제를 AI와 함께 진행하는 도구입니다.
진행 순서는 01 분석 → 02 전략 → 03 계획 → 04 실행 → 05 성과 → 06 개선입니다.

- 게시된 화면: https://claude.ai/artifact/LBKiSC3f1p3Z9hDuBZrAP1
- 이 폴더는 아파트스퀘어 앱과 별개입니다. 앱 배포(`build-deploy.js`)는 `app/`만 쓰므로 여기 파일은 앱에 들어가지 않습니다.

## 파일

| 파일 | 내용 |
|---|---|
| `pm-workbench.html` | 워크벤치 전체 코드입니다. **게시되는 파일이자 원본**입니다 (v40). |
| `kit/kit.css`, `kit/kit-run.js` | 화면 시안 디자인 키트의 스타일과 움직임(펼침, 숫자 세기, 3D 히어로 등)입니다. |
| `kit/kit-render.js` | 키트 렌더러입니다. AI가 준 구성(JSON)을 15가지 블록으로 조립합니다. 아임웹 코드, 미리보기와 자동 점검도 맡습니다. |
| `kit/kit-wb.js` | 키트와 워크벤치를 잇는 코드입니다. 시안 요청, 링크 읽기, 페이지별 생성, 1280/390 화면 점검을 다룹니다. |
| `kit/dec.js` | 정한 것: PM·팀장님이 정한 내용이 모든 AI 작업에 들어갑니다. |
| `kit/xfmt.js` | 원고 규격: 매체 11종의 글자 수·반복 점검과 '규격에 맞게 줄이기'입니다. |
| `kit/ke.js` | 구역 편집: 시안 구역을 직접 고치기, 순서 바꾸기, 고정, 부분 다시 만들기입니다. |
| `kit/tell.js` | 설명하기: 팀장님 컨펌 요청, 발표 이야기, 워크벤치 소개입니다. |
| `kit/pretendard-ks.woff2` | 시안용 Pretendard 글꼴(한글 부분)입니다. 게시할 때 같은 경로로 함께 올립니다. |
| `samples/` | 키트 시험용 구성 예시입니다 (아파트스퀘어, POUR). |
| `homepage/` | 직접 만든 아파트스퀘어 홈페이지 시안입니다. `aptsquare-home.html`은 미리보기, `aptsquare-imweb-main.html`은 아임웹에 붙일 코드입니다. 연락처는 자리표시(010-0000-0000)라서 실제 번호로 바꿔야 합니다. |

## 고치는 법

`pm-workbench.html` 안에 `kit/`의 코드가 그대로 들어 있습니다. 모듈을 고쳤으면 다시 넣습니다.

```sh
cd kit
python3 build.py          # kit.css·kit-run.js를 kit-render.js에 넣어 kit-render.built.js를 만든다
python3 reinject.py       # 렌더러 + kit-wb.js를 pm-workbench.html에 다시 넣는다
python3 reinject_tell.py  # tell.js만 다시 넣는다
```

`dec.js`, `xfmt.js`, `ke.js`는 HTML 안에 같은 내용으로 들어 있습니다. 고칠 때는 HTML과 이 파일을 같이 맞춥니다.

## 실행

- 이 페이지는 claude.ai 아티팩트 안에서만 제대로 동작합니다. 쓰는 기능은 공유 저장소(db), AI 호출, 사용자, 연결 도구(TinyFish·Figma·Notion·Google Drive), 파일 저장, 내려받기입니다.
- 브라우저에서 파일만 열면 화면은 보이지만 AI와 저장 기능은 동작하지 않습니다.
- 과제 데이터는 아티팩트 저장소에 있고 이 폴더에는 없습니다.
- 고객 이름·전화·주소는 AI로 보내지 않습니다.
