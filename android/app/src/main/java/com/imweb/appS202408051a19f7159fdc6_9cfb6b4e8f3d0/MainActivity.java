package com.imweb.appS202408051a19f7159fdc6_9cfb6b4e8f3d0;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onStart() {
    super.onStart();
    // 유튜브 등 영상 자동재생 허용 (WebView 기본은 터치해야 재생)
    try {
      this.bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    } catch (Exception e) {}
  }
}
