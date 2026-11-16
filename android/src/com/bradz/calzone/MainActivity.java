package com.bradz.calzone;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Brad's Bullpup shell: a full-screen WebView that serves the bundled page from
 * https://appassets.androidplatform.net/ (a secure origin, so IndexedDB, AudioWorklet
 * and crypto all behave like in Chrome), plus a file picker and a save-to-Downloads bridge.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK = 41;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(17, 17, 19));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        immersive();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.addJavascriptInterface(new Bridge(this), "CalzoneAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    h.put("Access-Control-Allow-Origin", "*");
                    r.setResponseHeaders(h);
                    return r;
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Choose a file"), PICK);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Android 13+ predictive back. From targetSdk 36 onBackPressed() is no longer called, so the
        // back gesture is routed through an OnBackInvokedCallback that asks the page first.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (saved != null) web.restoreState(saved);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mime(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        immersive();
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (req != PICK || fileCallback == null) return;
        Uri[] out = null;
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                out = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(out);
        fileCallback = null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    /** Lets the page close an open sheet or leave a game first; if it doesn't handle back, the app goes to the background. */
    private void handleBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("(window.bullpupBack && window.bullpupBack()) ? 1 : 0", r -> {
            if (!"1".equals(r)) moveTaskToBack(true);
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // Let gamepad and keyboard keys reach the page even when focus wandered off the WebView.
        if (web != null && !web.hasFocus() && e.getKeyCode() != KeyEvent.KEYCODE_BACK) web.requestFocus();
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        immersive();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    /** Exposed to the page as window.CalzoneAndroid */
    public static class Bridge {
        private final Activity a;
        public Bridge(Activity a) { this.a = a; }

        @JavascriptInterface
        public String save(String name, String mimeType, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (mimeType == null || mimeType.isEmpty()) mimeType = "application/octet-stream";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Bullpup");
                    Uri uri = a.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    OutputStream os = a.getContentResolver().openOutputStream(uri);
                    os.write(bytes);
                    os.close();
                    return "Downloads/Bullpup/" + safe;
                } else {
                    File dir = a.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) dir = a.getFilesDir();
                    dir.mkdirs();
                    File f = new File(dir, safe);
                    FileOutputStream fo = new FileOutputStream(f);
                    fo.write(bytes);
                    fo.close();
                    return f.getAbsolutePath();
                }
            } catch (Exception e) {
                return "";
            }
        }

        private android.os.Vibrator vib;
        private Boolean predefinedOk;

        @SuppressWarnings("deprecation")
        private android.os.Vibrator vibrator() {
            if (vib != null) return vib;
            if (Build.VERSION.SDK_INT >= 31) {
                android.os.VibratorManager m = (android.os.VibratorManager) a.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (m != null) vib = m.getDefaultVibrator();
            }
            if (vib == null) vib = (android.os.Vibrator) a.getSystemService(Context.VIBRATOR_SERVICE);
            return vib;
        }

        /** Legacy entry point kept for pages built before 1.5. */
        @JavascriptInterface
        public void vibrate(int ms) {
            haptic(ms >= 30 ? "strong" : ms >= 18 ? "medium" : "light");
        }

        /**
         * Button-press haptics. The old version called Vibrator.vibrate(6ms), which is below what many
         * motors can play, was filtered on Android 13+ when "touch vibration" was off, and was never
         * called by the page anyway. This tries, in order: a tuned predefined click (API 29+), a
         * one-shot with explicit amplitude (API 26+), then a plain pulse, all tagged as game haptics so
         * they follow the media vibration setting instead of the touch one.
         */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void haptic(String level) {
            try {
                android.os.Vibrator v = vibrator();
                if (v == null || !v.hasVibrator()) { viewHaptic(); return; }
                int ms = "strong".equals(level) ? 38 : "medium".equals(level) ? 22 : 14;
                int amp = "strong".equals(level) ? 255 : "medium".equals(level) ? 190 : 120;
                android.media.AudioAttributes aa = new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_GAME)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                if (Build.VERSION.SDK_INT >= 29) {
                    int id = "strong".equals(level) ? android.os.VibrationEffect.EFFECT_HEAVY_CLICK
                            : "medium".equals(level) ? android.os.VibrationEffect.EFFECT_CLICK : android.os.VibrationEffect.EFFECT_TICK;
                    if (predefinedOk == null) {
                        predefinedOk = Build.VERSION.SDK_INT < 30
                                || v.areAllEffectsSupported(android.os.VibrationEffect.EFFECT_TICK, android.os.VibrationEffect.EFFECT_CLICK,
                                android.os.VibrationEffect.EFFECT_HEAVY_CLICK) == android.os.Vibrator.VIBRATION_EFFECT_SUPPORT_YES;
                    }
                    if (predefinedOk) { v.vibrate(android.os.VibrationEffect.createPredefined(id), aa); return; }
                }
                if (Build.VERSION.SDK_INT >= 26) {
                    // Phones without amplitude control get a slightly longer pulse so it is felt at all
                    if (!v.hasAmplitudeControl()) { amp = android.os.VibrationEffect.DEFAULT_AMPLITUDE; ms += 6; }
                    v.vibrate(android.os.VibrationEffect.createOneShot(ms, amp), aa);
                } else {
                    v.vibrate(ms + 6);
                }
            } catch (Exception e) {
                viewHaptic();
            }
        }

        /** Last resort: the system's own keyboard-tap haptic on the WebView. */
        @SuppressWarnings("deprecation")
        private void viewHaptic() {
            a.runOnUiThread(() -> {
                View root = a.getWindow().getDecorView();
                root.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP,
                        android.view.HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING);
            });
        }
    }
}
