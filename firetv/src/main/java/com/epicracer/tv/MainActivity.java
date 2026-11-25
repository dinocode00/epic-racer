package com.epicracer.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.List;

/**
 * Epic Racer on a Fire TV: one full-screen web view. It opens on a small menu (assets/menu.html)
 * with two ways to play:
 *
 *  - Play: the copy of the game GitHub Pages hosts (BuildConfig.HOSTED_URL), rebuilt on every
 *    push, so it's always the newest version. No computer; Xbox controllers and the remote.
 *  - Play with phones: the game served by Epic Racer running on a computer on the same Wi-Fi
 *    (http://computer:4000). Phones join that computer as usual, and the computer pulls updates.
 *
 * Controllers are read here and handed to the page (Pads, window.EpicTV.pads()); the remote
 * stays a keyboard. Back on the remote returns to the menu; Back on the menu closes the app.
 */
public class MainActivity extends Activity {
    private static final String MENU = "file:///android_asset/menu.html";

    private WebView web;
    private final Pads pads = new Pads();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private volatile boolean onMenu = true;
    /** Shown on the menu once, e.g. why the game couldn't be reached. */
    private volatile String note = "";
    private String target = "";

    private final InputManager.InputDeviceListener devices = new InputManager.InputDeviceListener() {
        @Override public void onInputDeviceAdded(int id) { pads.scanDevices(); }
        @Override public void onInputDeviceRemoved(int id) { pads.removed(id); }
        @Override public void onInputDeviceChanged(int id) { }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("epic", Context.MODE_PRIVATE);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // the game keeps its race settings in localStorage
        s.setMediaPlaybackRequiresUserGesture(false); // sound without tapping first
        // Lets the game know it's in this app (it then offers "Game updates" for the computer).
        s.setUserAgentString(s.getUserAgentString() + " EpicRacerTV/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "EpicTV");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());
        setContentView(web);
        hideSystemUi();

        ((InputManager) getSystemService(Context.INPUT_SERVICE)).registerInputDeviceListener(devices, ui);
        pads.scanDevices();
        showMenu("");
        web.requestFocus();
    }

    @Override
    protected void onDestroy() {
        ((InputManager) getSystemService(Context.INPUT_SERVICE)).unregisterInputDeviceListener(devices);
        web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    // ---------- where the game comes from ----------

    private void showMenu(String message) {
        onMenu = true;
        note = message == null ? "" : message;
        target = "";
        web.loadUrl(MENU);
        web.clearHistory();
    }

    private void playOnline() {
        onMenu = false;
        target = "the online game";
        prefs.edit().putString("last", "online").apply();
        // A fresh address each time, so a newly published version is never hidden by the cache.
        Uri u = Uri.parse(BuildConfig.HOSTED_URL).buildUpon()
                .appendQueryParameter("v", String.valueOf(System.currentTimeMillis())).build();
        web.loadUrl(u.toString());
    }

    /** "192.168.1.20", "192.168.1.20:4000" or "http://my-pc:4000/" all work. */
    static String normalize(String address) {
        String a = address == null ? "" : address.trim();
        a = a.replaceFirst("(?i)^https?://", "");
        int slash = a.indexOf('/');
        if (slash >= 0) a = a.substring(0, slash);
        if (a.isEmpty() || !a.matches("[A-Za-z0-9.\\-]+(:\\d{1,5})?")) return null;
        if (!a.contains(":")) a = a + ":" + Finder.PORT;
        return a;
    }

    private void playComputer(String hostPort) {
        onMenu = false;
        target = "Epic Racer on the computer at " + hostPort.replace(":" + Finder.PORT, "");
        prefs.edit().putString("last", "computer").putString("computer", hostPort).apply();
        web.loadUrl("http://" + hostPort + "/");
    }

    private final class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return false; // stay in the app (the game only ever reloads itself)
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (Build.VERSION.SDK_INT >= 23 && req.isForMainFrame()) failed();
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onReceivedError(WebView view, int code, String description, String url) {
            if (Build.VERSION.SDK_INT < 23) failed();
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse res) {
            if (req.isForMainFrame() && !onMenu) failed();
        }
    }

    private void failed() {
        if (onMenu) return;
        String what = target;
        ui.post(() -> showMenu("Couldn't reach " + what + "."
                + (what.startsWith("the online") ? " Check the TV's internet connection."
                : " Is Epic Racer running on it, on the same Wi-Fi as the TV?")));
    }

    // ---------- remote and controllers ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (pads.onKey(e)) return true; // controller buttons go to the game as a gamepad
        int code = e.getKeyCode();
        if (code == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP) back();
            return true;
        }
        // The remote's middle button acts as Enter (join / ready / OK).
        if (code == KeyEvent.KEYCODE_DPAD_CENTER) return super.dispatchKeyEvent(remap(e, KeyEvent.KEYCODE_ENTER));
        // ≡ and play/pause: Escape (pause the race, close a panel).
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
            return super.dispatchKeyEvent(remap(e, KeyEvent.KEYCODE_ESCAPE));
        return super.dispatchKeyEvent(e);
    }

    private static KeyEvent remap(KeyEvent e, int code) {
        return new KeyEvent(e.getDownTime(), e.getEventTime(), e.getAction(), code, e.getRepeatCount(),
                e.getMetaState(), e.getDeviceId(), e.getScanCode(), e.getFlags(), e.getSource());
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (pads.onMotion(e)) return true;
        return super.dispatchGenericMotionEvent(e);
    }

    /** Remote Back: in the game, back to the menu; on the menu, let it close a panel, else quit. */
    private void back() {
        if (!onMenu) {
            showMenu("");
            return;
        }
        web.evaluateJavascript("window.tvBack ? tvBack() : false", (handled) -> {
            if (!"true".equals(handled)) finish();
        });
    }

    // ---------- what the pages can call (window.EpicTV) ----------

    private static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : (s == null ? "" : s).toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(' ');
            else if (c == '<') b.append("\\u003c");
            else b.append(c);
        }
        return b.append('"').toString();
    }

    final class Bridge {
        /** Controllers, for the game and the menu (see Pads.json). */
        @JavascriptInterface
        public String pads() {
            return pads.json();
        }

        // The rest only work from the app's own menu page.

        @JavascriptInterface
        public String state() {
            if (!onMenu) return "{}";
            String n = note;
            note = "";
            return "{\"last\":" + q(prefs.getString("last", "")) + ",\"computer\":" + q(prefs.getString("computer", ""))
                    + ",\"note\":" + q(n) + ",\"version\":" + q(BuildConfig.VERSION_NAME)
                    + ",\"online\":" + q(BuildConfig.HOSTED_URL) + "}";
        }

        @JavascriptInterface
        public void playOnline() {
            if (onMenu) ui.post(MainActivity.this::playOnline);
        }

        /** Returns false if the address doesn't look like one. */
        @JavascriptInterface
        public boolean playComputer(String address) {
            if (!onMenu) return false;
            String a = normalize(address);
            if (a == null) return false;
            ui.post(() -> MainActivity.this.playComputer(a));
            return true;
        }

        /** Looks for computers running Epic Racer; answers with window.tvFound([{address, room}]). */
        @JavascriptInterface
        public void findComputers() {
            if (!onMenu) return;
            new Thread(() -> {
                List<Finder.Found> found = Finder.scan();
                StringBuilder s = new StringBuilder("[");
                for (int i = 0; i < found.size(); i++) {
                    if (i > 0) s.append(',');
                    s.append("{\"address\":").append(q(found.get(i).address))
                            .append(",\"room\":").append(q(found.get(i).room)).append('}');
                }
                String js = "window.tvFound && tvFound(" + s.append(']') + ")";
                ui.post(() -> { if (onMenu) web.evaluateJavascript(js, null); });
            }, "find-computers").start();
        }

        @JavascriptInterface
        public void quit() {
            if (onMenu) ui.post(MainActivity.this::finish);
        }
    }
}
