package com.smarttasks.android;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * v6.10.3 — Native plugin to open URL in system default browser
 *
 * Why this exists:
 *   WebView (window.open / Capacitor's _blank) opens URLs in Chrome Custom Tab
 *   or in-WebView, which:
 *     - May not trigger APK download on GitHub release URLs
 *     - Some users see "无法打开" because Custom Tab can't handle github.com redirects
 *     - In-App browser shows our own webview chrome, can't go back to App easily
 *
 *   This plugin uses Intent.ACTION_VIEW with FLAG_ACTIVITY_NEW_TASK to launch
 *   the user's chosen default browser (Chrome / Edge / Firefox / Brave / etc.)
 *   as a separate App, not an in-App overlay.
 */
@CapacitorPlugin(name = "SystemBrowser")
public class SystemBrowserPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            Uri uri = Uri.parse(url);
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            // Try to find the default browser package and force the Intent to it.
            // This avoids the chooser dialog when the user has already picked a default.
            // On Android 11+ (API 30), package visibility restrictions apply, so we
            // query with theIntent and resolveActivity.
            PackageManager pm = getContext().getPackageManager();
            String defaultBrowserPkg = getDefaultBrowserPackage(pm, uri);

            if (defaultBrowserPkg != null && !defaultBrowserPkg.isEmpty()) {
                intent.setPackage(defaultBrowserPkg);
            }
            // Else: leave unset → Android shows chooser with browsers only

            getActivity().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            if (defaultBrowserPkg != null) ret.put("browser", defaultBrowserPkg);
            call.resolve(ret);
        } catch (Exception e) {
            // Fallback: try without setPackage (show chooser)
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception e2) {
                Toast.makeText(getContext(), "无法打开浏览器: " + e2.getMessage(), Toast.LENGTH_LONG).show();
                call.reject("Failed to open browser: " + e2.getMessage());
            }
        }
    }

    /**
     * Find the default browser package for HTTP/HTTPS intents.
     * Returns null if no default is set (Android will show chooser).
     */
    private String getDefaultBrowserPackage(PackageManager pm, Uri uri) {
        Intent probe = new Intent(Intent.ACTION_VIEW, uri);
        // resolveActivity returns null on Android 11+ if no default is set
        // (due to package visibility). We use queryIntentActivities as fallback.
        try {
            // First try resolveActivity (gives the default if set)
            android.content.ComponentName cn = probe.resolveActivity(pm);
            if (cn != null) {
                String pkg = cn.getPackageName();
                // Make sure it's actually a browser (not ourselves)
                if (pkg != null && !pkg.equals(getContext().getPackageName())) {
                    return pkg;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }
}
