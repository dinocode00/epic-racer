package com.epicracer.tv;

import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.HashMap;
import java.util.Map;

/**
 * Game controllers (Xbox, Fire TV game controller, ...) read natively and handed to the page in
 * the web "standard gamepad" layout, which is what the game expects:
 *
 *   buttons 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu, 10/11 stick clicks,
 *           12-15 D-pad up/down/left/right, 16 guide
 *   axes    0/1 left stick x/y, 2/3 right stick x/y
 *
 * The Fire TV remote is not a controller (no sticks): it stays a keyboard for the page.
 */
final class Pads {
    static final int SLOTS = 4;
    private static final int BUTTONS = 17;

    private static final class Pad {
        final int slot;
        final String name;
        final float[] axes = new float[4];
        final boolean[] keys = new boolean[BUTTONS];
        final float[] analog = new float[BUTTONS]; // triggers, and the D-pad when it's a hat
        long time = SystemClock.uptimeMillis();

        Pad(int slot, String name) {
            this.slot = slot;
            this.name = name;
        }
    }

    private final Map<Integer, Pad> byDevice = new HashMap<>();
    private final Pad[] slots = new Pad[SLOTS];

    /** A real controller: has analog sticks (the remote has none). */
    static boolean isController(InputDevice d) {
        if (d == null || d.isVirtual()) return false;
        return (d.getSources() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    /** Give controllers already paired and switched on a slot straight away. */
    synchronized void scanDevices() {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (isController(d)) pad(d);
        }
    }

    synchronized void removed(int deviceId) {
        Pad p = byDevice.remove(deviceId);
        if (p != null) slots[p.slot] = null;
    }

    private Pad pad(InputDevice d) {
        Pad p = byDevice.get(d.getId());
        if (p != null) return p;
        for (int s = 0; s < SLOTS; s++) {
            if (slots[s] == null) {
                p = new Pad(s, d.getName() == null ? "Controller" : d.getName());
                slots[s] = p;
                byDevice.put(d.getId(), p);
                return p;
            }
        }
        return null; // more than four controllers: the extras are ignored
    }

    private static int button(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_DPAD_CENTER: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT:
            case KeyEvent.KEYCODE_BACK: return 8; // some Xbox pads send Back for View
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MENU: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            case KeyEvent.KEYCODE_BUTTON_MODE: return 16;
            default: return -1;
        }
    }

    /** True if the key came from a controller and was taken (the page must not also see it). */
    synchronized boolean onKey(KeyEvent e) {
        InputDevice d = e.getDevice();
        if (!isController(d) && !KeyEvent.isGamepadButton(e.getKeyCode())) return false;
        int b = button(e.getKeyCode());
        if (b < 0) return false;
        if (d == null) return true;
        Pad p = pad(d);
        if (p == null) return true;
        if (e.getAction() == KeyEvent.ACTION_DOWN) p.keys[b] = true;
        else if (e.getAction() == KeyEvent.ACTION_UP) p.keys[b] = false;
        p.time = SystemClock.uptimeMillis();
        return true;
    }

    /** Sticks, triggers and hat D-pads. True if it was a controller's. */
    synchronized boolean onMotion(MotionEvent e) {
        InputDevice d = e.getDevice();
        if (!isController(d) || e.getAction() != MotionEvent.ACTION_MOVE) return false;
        Pad p = pad(d);
        if (p == null) return true;
        // Most pads put the triggers on LTRIGGER/RTRIGGER (or BRAKE/GAS) and the right stick on
        // Z/RZ; a few older ones put the right stick on RX/RY and the triggers on Z/RZ.
        boolean hasTriggers = d.getMotionRange(MotionEvent.AXIS_LTRIGGER) != null
                || d.getMotionRange(MotionEvent.AXIS_BRAKE) != null;
        p.axes[0] = e.getAxisValue(MotionEvent.AXIS_X);
        p.axes[1] = e.getAxisValue(MotionEvent.AXIS_Y);
        float lt, rt;
        if (hasTriggers || d.getMotionRange(MotionEvent.AXIS_RX) == null) {
            p.axes[2] = e.getAxisValue(MotionEvent.AXIS_Z);
            p.axes[3] = e.getAxisValue(MotionEvent.AXIS_RZ);
            lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
            rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
        } else {
            p.axes[2] = e.getAxisValue(MotionEvent.AXIS_RX);
            p.axes[3] = e.getAxisValue(MotionEvent.AXIS_RY);
            lt = e.getAxisValue(MotionEvent.AXIS_Z);
            rt = e.getAxisValue(MotionEvent.AXIS_RZ);
        }
        p.analog[6] = clamp01(lt);
        p.analog[7] = clamp01(rt);
        float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        p.analog[12] = hy < -0.5f ? 1 : 0;
        p.analog[13] = hy > 0.5f ? 1 : 0;
        p.analog[14] = hx < -0.5f ? 1 : 0;
        p.analog[15] = hx > 0.5f ? 1 : 0;
        p.time = SystemClock.uptimeMillis();
        return true;
    }

    private static float clamp01(float v) {
        return v < 0 ? 0 : (v > 1 ? 1 : v);
    }

    /** All slots as JSON: [{i, id, t, a: [axes], b: [button values]} | null, ...]. */
    synchronized String json() {
        StringBuilder s = new StringBuilder(512).append('[');
        for (int i = 0; i < SLOTS; i++) {
            if (i > 0) s.append(',');
            Pad p = slots[i];
            if (p == null) {
                s.append("null");
                continue;
            }
            s.append("{\"i\":").append(i)
                    .append(",\"id\":\"").append(p.name.replace("\\", "").replace("\"", "'"))
                    .append("\",\"t\":").append(p.time).append(",\"a\":[");
            for (int a = 0; a < 4; a++) {
                if (a > 0) s.append(',');
                s.append(round(p.axes[a]));
            }
            s.append("],\"b\":[");
            for (int b = 0; b < BUTTONS; b++) {
                if (b > 0) s.append(',');
                s.append(p.keys[b] ? "1" : round(p.analog[b]));
            }
            s.append("]}");
        }
        return s.append(']').toString();
    }

    private static String round(float v) {
        if (Float.isNaN(v)) return "0";
        return String.valueOf(Math.round(v * 1000) / 1000f);
    }
}
