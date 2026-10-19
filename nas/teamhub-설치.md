# 팀허브 올리기 — **파일 하나 업로드**가 전부입니다

폴더를 새로 만들 것도 없습니다. 브랜드허브가 있는 그 폴더에 **파일 하나만**
올려 주세요.

```
/web/brand/
  ├ brand.html            ← 브랜드허브 (이미 있음)
  ├ mediam_TeamHub.html   ← ★ 이것만 올리면 끝
  ├ teamhub.php           ← 저절로 올라갑니다
  └ DB_teamhub/           ← 저절로 만들어집니다
      ├ 미디어마케팅팀/ · 백업/ · 주고받기/
```

---

## 하실 일

1. DSM → **File Station** → `web` → `brand`
2. 위쪽 **`업로드`** 단추
3. 받으신 `선택_NAS…v2.5.9.zip` 안의 **`mediam_TeamHub.html`** 고르기

25MB 라 조금 걸립니다. 그게 전부입니다.

> `teamhub.php` 는 안 올리셔도 됩니다 — 자동 업데이트 목록에 넣어 뒀습니다.
> 급하시면 이 폴더의 `teamhub.php` 를 같이 올리셔도 됩니다.

---

## 되는지 보기

```
https://netformrnd.synology.me/brand/teamhub.php
```

| 보이는 것 | 뜻 |
|---|---|
| `{"ok":true, … "writable":true}` | 다 됐습니다 ✅ |
| 404 | `teamhub.php` 가 아직 안 올라왔습니다 — 직접 올리세요 |
| PHP 글자가 그대로 | Web Station 의 PHP 가 꺼져 있습니다 |
| `writable: false` | `brand` 폴더에 `http` 계정 쓰기 권한이 없습니다 |

그다음 브랜드허브에서 `Ctrl+Shift+R` → 할 일 연동 칸에
**「✅ 바로 옆 팀허브와 붙었습니다」** 가 뜹니다.

---

## 팀허브 열기

팀 허브 → 미디어마케팅팀 → `✎` → **자리**:

```
mediam_TeamHub.html#/board
```

| 뒤에 붙이면 | 열리는 곳 |
|---|---|
| `#/board` | 할 일 |
| `#/calendar` | 팀 캘린더 |
| `#/today` | TODAY |

---

## 할 일은 저절로 오갑니다

- 팀허브가 내보낸 할 일 → 브랜드허브가 **날짜 폴더 안까지 찾아** 가져옵니다
- 우리 할 일 → **`주고받기`** 에 놓이고 팀허브 `[불러오기]` 가 집어 갑니다
- 같은 일은 **같은 번호로 이어지고**, 양쪽이 고친 칸은 **칸마다 합쳐집니다**

---

## 치워 두실 것

`/web/brand/` 에 **`teamhub.html` (24MB · 10월 13일)** 이 있습니다.
옛날에 손으로 복사해 둔 것이고, 며칠 전 「이전 버전이 열린다」 의 원인입니다.
우클릭 → 이름 바꾸기 → **`teamhub-옛날.html`** 로 바꿔 두세요.

---

## ⚠️ 자료가 주소로 새지 않게

자료(`DB_teamhub`)가 웹 폴더 안이라, 주소를 아는 사람은 로그인 없이 받아
갈 수 있습니다. `teamhub.php` 가 `.htaccess` 로 막지만 **Apache 일 때만**
듣습니다.

DSM → 웹 스테이션 → 해당 웹 서비스 → **HTTP 백엔드 서버** 확인:

- **Apache** → 그대로 두셔도 됩니다
- **Nginx** → `사용자 정의 설정` 에 아래 한 줄

```nginx
location ~ ^/brand/DB_teamhub/ { deny all; return 404; }
```

어려우시면 알려 주세요 — 자료만 웹 폴더 밖으로 빼 드리겠습니다
(`teamhub.php` 맨 위 `$BASE` 한 줄).

---

## 판이 올라오면

**`mediam_TeamHub.html` 하나만** 새 파일로 올리면 끝입니다.
