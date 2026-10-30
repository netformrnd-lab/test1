# 앱 빌드 가이드 (갤럭시 / 아이폰)

## 0. 먼저 알아둘 것 — 이 앱은 "원격 로드"예요
네이티브 앱(갤럭시·아이폰)은 **껍데기**이고, 실제 화면은 Cloudflare Worker(`floral-cherry-6860`)에 올린 웹앱을 불러옵니다. (`capacitor.config.json` 의 `server.url`)

따라서:
- **웹 내용 수정(문구·기능·PDF 등)** → `npm run deploy` 로 배포만 하면 **설치된 앱에 바로 반영**. 재빌드 불필요.
- **네이티브 재빌드가 필요한 경우만** 아래를 진행:
  - 앱 **아이콘 / 스플래시 / 앱이름** 변경
  - **권한** 추가(마이크·알림 등) 또는 **플러그인** 추가
  - **서버 주소(server.url)** 변경
  - **스토어에 새 버전 제출**(심사 재요청)

---

## 1. 공통 준비 (한 번만)
```bash
npm install          # 의존성 설치
npx cap sync         # capacitor.config.json·플러그인을 android/ios 에 반영
```
> 네이티브 설정(아이콘/권한/플러그인)을 바꾼 뒤에는 항상 `npx cap sync` 를 다시 실행하세요.

---

## 2. 버전 올리기 (스토어 업로드마다 필수)
스토어는 **같은 버전 번호를 두 번 못 올립니다.** 새로 올릴 때마다 숫자를 올리세요.

**Android** — `android/app/build.gradle`
```
versionCode 112141      // 업로드마다 +1 (정수, 반드시 증가)
versionName "1.0.7"     // 사람이 보는 버전 (예: 1.1.0)
```

**iOS** — Xcode 에서 App 타겟 → General
- `Version` (Marketing) : 예 1.1.0
- `Build` (Current Project Version) : 업로드마다 +1

---

## 3. 갤럭시 / 안드로이드 (Google Play)
**필요한 것:** Android Studio, 서명용 keystore(.jks), Google Play Console 계정(최초 1회 $25)

1. Android Studio 로 `android/` 폴더 열기 (Open → android 선택)
2. 처음이면 서명 키 만들기: Build → Generate Signed Bundle/APK → **Android App Bundle(AAB)** → Create new… 로 keystore 생성 (비밀번호·별칭 **꼭 백업**. 분실하면 업데이트 못 올려요)
3. **AAB** 빌드 → `app-release.aab` 생성
4. [Google Play Console](https://play.google.com/console) → 앱 만들기 → 프로덕션(또는 내부테스트) → AAB 업로드 → 스토어 정보(스크린샷·설명·개인정보처리방침 URL) 작성 → 심사 제출

> 빠른 테스트용 설치 파일(.apk)만 필요하면: Android Studio → Build → Build APK(s). 폰에 바로 설치 가능(스토어 제출용은 AAB).

---

## 4. 아이폰 (App Store) — **맥(Mac) 필수**
**필요한 것:** macOS + Xcode, Apple Developer Program($99/년), CocoaPods

1. 맥에서 프로젝트 받고:
   ```bash
   npm install
   npx cap sync ios
   cd ios/App && pod install        # CocoaPods 설치 (sudo gem install cocoapods)
   ```
2. `ios/App/App.xcworkspace` 를 **Xcode로 열기** (.xcodeproj 말고 **.xcworkspace**)
3. App 타겟 → Signing & Capabilities → **Team** 선택(Apple Developer 계정), Bundle Identifier 확인
   - 푸시 쓰면 **Push Notifications** capability 추가
4. 상단 디바이스를 **Any iOS Device** 로 → Product → **Archive**
5. Organizer 창 → **Distribute App** → App Store Connect 업로드
6. [App Store Connect](https://appstoreconnect.apple.com) → 앱 등록 → 빌드 선택 → 스토어 정보·스크린샷·개인정보 작성 → 심사 제출

---

## 5. 푸시 알림(선택)
- **Android:** `android/app/google-services.json` (FCM) 이미 있음. Firebase 콘솔의 서버 키로 발송.
- **iOS:** Apple Developer 에서 **APNs 키(.p8)** 발급 후 Firebase(또는 발송 서버)에 등록, Xcode 에 Push Notifications capability 필요.
> 푸시는 "빌드"와 별개예요. 푸시 없이도 앱은 정상 빌드·동작합니다.

---

## 6. 자주 겪는 것
- **웹 고쳤는데 앱에 안 바뀜** → 재빌드 말고 `npm run deploy` 했는지 확인. (원격 로드라 배포가 곧 반영)
- **"버전 코드가 이미 있습니다"** → `versionCode`(안드로이드)/`Build`(iOS) 를 올리세요.
- **iOS 빌드가 리눅스/윈도우에서 안 됨** → iOS는 **맥에서만** 가능(Apple 정책).
- **플러그인이 안 먹음** → `npx cap sync` 다시 실행 후 재빌드.
