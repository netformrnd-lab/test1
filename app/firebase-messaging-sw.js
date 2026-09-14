/* 관리자 대시보드 웹 푸시용 서비스 워커
   백그라운드(탭이 꺼져있거나 다른 탭일 때) 알림 수신을 담당한다.
   notification 페이로드가 오면 브라우저가 자동으로 알림을 띄운다. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyCxhisDzLon1_l1-gB6Wzrd1opC537Jocw',
  authDomain: 'aptsquare-4cb7b.firebaseapp.com',
  projectId: 'aptsquare-4cb7b',
  storageBucket: 'aptsquare-4cb7b.firebasestorage.app',
  messagingSenderId: '592390365459',
  appId: '1:592390365459:web:a02bd61c8ca615f368bae6'
})

// FCM 서비스 워커 활성화 (notification 페이로드는 브라우저가 자동 표시)
firebase.messaging()
