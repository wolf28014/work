package com.smarttasks.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v6.10.3 — 注册原生 SystemBrowser 插件（用系统默认浏览器打开 URL，避免 In-App WebView）
        registerPlugin(SystemBrowserPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
