package com.epicracer.tv;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Looks around the home network for a computer running Epic Racer: asks every address next to
 * the TV's own (x.y.z.1 - 254) for the game server's /api/info on its port.
 */
final class Finder {
    static final int PORT = 4000;
    private static final Pattern ROOM = Pattern.compile("\"room\"\\s*:\\s*\"(\\w+)\"");

    static final class Found {
        final String address;
        final String room;

        Found(String address, String room) {
            this.address = address;
            this.room = room;
        }
    }

    /** The TV's own home-network addresses (Wi-Fi or Ethernet). */
    static List<String> ownAddresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {
            // no network
        }
        return out;
    }

    /** Asks one address. Returns the room code if Epic Racer answers there, else null. */
    static String probe(String hostPort, int timeoutMs) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + hostPort + "/api/info").openConnection();
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs * 3);
            if (c.getResponseCode() != 200) return null;
            byte[] buf = new byte[8192];
            int n, total = 0;
            InputStream in = c.getInputStream();
            while (total < buf.length && (n = in.read(buf, total, buf.length - total)) > 0) total += n;
            Matcher m = ROOM.matcher(new String(buf, 0, total, "UTF-8"));
            return m.find() ? m.group(1) : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Every computer on the TV's network(s) that runs Epic Racer. Takes a few seconds. */
    static List<Found> scan() {
        Set<String> targets = new LinkedHashSet<>();
        Set<String> own = new LinkedHashSet<>(ownAddresses());
        for (String ip : own) {
            String prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
            for (int i = 1; i < 255; i++) {
                String t = prefix + i;
                if (!own.contains(t)) targets.add(t);
            }
        }
        List<Found> found = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(48);
        for (String t : targets) {
            pool.execute(() -> {
                String room = probe(t + ":" + PORT, 600);
                if (room != null) found.add(new Found(t, room));
            });
        }
        pool.shutdown();
        try {
            pool.awaitTermination(15, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        pool.shutdownNow();
        synchronized (found) {
            return new ArrayList<>(found);
        }
    }
}
