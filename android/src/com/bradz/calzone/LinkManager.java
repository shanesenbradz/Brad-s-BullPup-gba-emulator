package com.bradz.calzone;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;

/**
 * The link cable's transport, for two phones: Wi-Fi (TCP, found with network service
 * discovery or typed in by IP) or Bluetooth (RFCOMM between paired phones).
 * Messages are short text lines; the page does the emulation side.
 *
 * Exposed to the page as window.BullpupLink. Events go back through
 * window.bullpupLinkEvent(type, data):
 *   hosting  {how, name, ip, port}   waiting for the other phone
 *   found    {name, ip, port}        a Wi-Fi host showed up while searching
 *   connected {how, role, peer}      link is up (role: host or guest)
 *   msg      line                    a line from the other phone
 *   closed   reason                  link went down
 *   error    message
 *   perm     granted|denied          answer to the Bluetooth permission prompt
 */
public class LinkManager {
    static final String SERVICE_TYPE = "_bullpup._tcp.";
    static final int PORT = 47823;
    static final UUID BT_UUID = UUID.fromString("6b1f2a4e-9c3d-4e8a-b7a1-b011f00dcab1");
    static final int REQ_BT = 77;

    private final MainActivity a;
    private volatile OutputStream out;
    private volatile Closeable conn, server;
    private volatile boolean closing;
    private NsdManager nsd;
    private NsdManager.RegistrationListener reg;
    private NsdManager.DiscoveryListener disc;
    private WifiManager.MulticastLock mlock;

    LinkManager(MainActivity a) { this.a = a; }

    private void event(String type, String data) {
        a.linkEvent(type, data);
    }

    private static String q(String s) {
        return "\"" + (s == null ? "" : s.replace("\\", "\\\\").replace("\"", "'")) + "\"";
    }

    /* ---------------- Wi-Fi ---------------- */

    @JavascriptInterface
    public String localIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress ad : Collections.list(ni.getInetAddresses())) {
                    if (ad instanceof Inet4Address && ad.isSiteLocalAddress()) return ad.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return "";
    }

    @JavascriptInterface
    public void hostWifi(String name) {
        close("restart");
        closing = false;
        new Thread(() -> {
            try {
                ServerSocket ss = new ServerSocket();
                ss.setReuseAddress(true);
                ss.bind(new InetSocketAddress(PORT));
                server = ss;
                register(name);
                event("hosting", "{\"how\":\"wifi\",\"name\":" + q(name) + ",\"ip\":" + q(localIp()) + ",\"port\":" + PORT + "}");
                Socket s = ss.accept();
                closeQuiet(ss); server = null;
                unregister();
                start(s, "wifi", "host", s.getInetAddress().getHostAddress());
            } catch (IOException e) {
                if (!closing) event("error", "Couldn't host on Wi-Fi: " + e.getMessage());
            }
        }, "link-host").start();
    }

    @JavascriptInterface
    public void joinWifi(String ip, int port) {
        close("restart");
        closing = false;
        stopSearch();
        new Thread(() -> {
            try {
                Socket s = new Socket();
                s.connect(new InetSocketAddress(ip, port > 0 ? port : PORT), 6000);
                start(s, "wifi", "guest", ip);
            } catch (IOException e) {
                event("error", "Couldn't reach " + ip + ". Check both phones are on the same Wi-Fi or hotspot.");
            }
        }, "link-join").start();
    }

    private void start(Socket s, String how, String role, String peer) throws IOException {
        s.setTcpNoDelay(true);
        s.setKeepAlive(true);
        begin(s, s.getInputStream(), s.getOutputStream(), how, role, peer);
    }

    private void register(String name) {
        try {
            nsd = (NsdManager) a.getSystemService(Context.NSD_SERVICE);
            NsdServiceInfo info = new NsdServiceInfo();
            info.setServiceName(name);
            info.setServiceType(SERVICE_TYPE);
            info.setPort(PORT);
            reg = new NsdManager.RegistrationListener() {
                @Override public void onRegistrationFailed(NsdServiceInfo i, int c) { }
                @Override public void onUnregistrationFailed(NsdServiceInfo i, int c) { }
                @Override public void onServiceRegistered(NsdServiceInfo i) { }
                @Override public void onServiceUnregistered(NsdServiceInfo i) { }
            };
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, reg);
        } catch (Exception ignored) { reg = null; }
    }

    private void unregister() {
        try { if (nsd != null && reg != null) nsd.unregisterService(reg); } catch (Exception ignored) { }
        reg = null;
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public void search() {
        stopSearch();
        try {
            WifiManager wm = (WifiManager) a.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) { mlock = wm.createMulticastLock("bullpup-link"); mlock.setReferenceCounted(false); mlock.acquire(); }
            nsd = (NsdManager) a.getSystemService(Context.NSD_SERVICE);
            disc = new NsdManager.DiscoveryListener() {
                @Override public void onStartDiscoveryFailed(String t, int c) { event("error", "Search failed (" + c + "). Type the host's IP instead."); }
                @Override public void onStopDiscoveryFailed(String t, int c) { }
                @Override public void onDiscoveryStarted(String t) { }
                @Override public void onDiscoveryStopped(String t) { }
                @Override public void onServiceLost(NsdServiceInfo i) { }
                @Override public void onServiceFound(NsdServiceInfo i) {
                    nsd.resolveService(i, new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo r, int c) { }
                        @Override public void onServiceResolved(NsdServiceInfo r) {
                            if (r.getHost() == null) return;
                            event("found", "{\"name\":" + q(r.getServiceName()) + ",\"ip\":" + q(r.getHost().getHostAddress()) + ",\"port\":" + r.getPort() + "}");
                        }
                    });
                }
            };
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, disc);
        } catch (Exception e) {
            event("error", "Search isn't available here. Type the host's IP instead.");
        }
    }

    @JavascriptInterface
    public void stopSearch() {
        try { if (nsd != null && disc != null) nsd.stopServiceDiscovery(disc); } catch (Exception ignored) { }
        disc = null;
        try { if (mlock != null) mlock.release(); } catch (Exception ignored) { }
        mlock = null;
    }

    /* ---------------- Bluetooth ---------------- */

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) a.getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    /** "ok", "noperm" (call askPermission), "off" (Bluetooth is off) or "none" (no Bluetooth). */
    @JavascriptInterface
    public String btState() {
        BluetoothAdapter ad = adapter();
        if (ad == null) return "none";
        if (Build.VERSION.SDK_INT >= 31 && a.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) return "noperm";
        try { return ad.isEnabled() ? "ok" : "off"; } catch (SecurityException e) { return "noperm"; }
    }

    @JavascriptInterface
    public void askPermission() {
        if (Build.VERSION.SDK_INT >= 31) a.runOnUiThread(() -> a.requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT));
        else event("perm", "granted");
    }

    /** Paired phones as JSON: [{name, address}] */
    @JavascriptInterface
    @SuppressWarnings("MissingPermission")
    public String pairedDevices() {
        StringBuilder b = new StringBuilder("[");
        try {
            BluetoothAdapter ad = adapter();
            if (ad != null) for (BluetoothDevice d : ad.getBondedDevices()) {
                if (b.length() > 1) b.append(',');
                b.append("{\"name\":").append(q(d.getName())).append(",\"address\":").append(q(d.getAddress())).append('}');
            }
        } catch (SecurityException ignored) { }
        return b.append(']').toString();
    }

    @JavascriptInterface
    @SuppressWarnings("MissingPermission")
    public void hostBt() {
        close("restart");
        closing = false;
        new Thread(() -> {
            try {
                BluetoothAdapter ad = adapter();
                BluetoothServerSocket ss = ad.listenUsingInsecureRfcommWithServiceRecord("Brad's Bullpup link", BT_UUID);
                server = ss;
                String name = "";
                try { name = ad.getName(); } catch (SecurityException ignored) { }
                event("hosting", "{\"how\":\"bt\",\"name\":" + q(name) + ",\"ip\":\"\",\"port\":0}");
                BluetoothSocket s = ss.accept();
                closeQuiet(ss); server = null;
                String peer = "";
                try { peer = s.getRemoteDevice().getName(); } catch (SecurityException ignored) { }
                begin(s, s.getInputStream(), s.getOutputStream(), "bt", "host", peer);
            } catch (Exception e) {
                if (!closing) event("error", "Couldn't host on Bluetooth: " + e.getMessage());
            }
        }, "link-bt-host").start();
    }

    @JavascriptInterface
    @SuppressWarnings("MissingPermission")
    public void joinBt(String address) {
        close("restart");
        closing = false;
        new Thread(() -> {
            try {
                BluetoothAdapter ad = adapter();
                try { ad.cancelDiscovery(); } catch (SecurityException ignored) { }
                BluetoothDevice d = ad.getRemoteDevice(address);
                BluetoothSocket s = d.createInsecureRfcommSocketToServiceRecord(BT_UUID);
                s.connect();
                String peer = "";
                try { peer = d.getName(); } catch (SecurityException ignored) { }
                begin(s, s.getInputStream(), s.getOutputStream(), "bt", "guest", peer);
            } catch (Exception e) {
                event("error", "Couldn't connect over Bluetooth. Make sure the other phone tapped Host on Bluetooth first.");
            }
        }, "link-bt-join").start();
    }

    /* ---------------- shared ---------------- */

    private void begin(Closeable c, InputStream in, OutputStream o, String how, String role, String peer) {
        conn = c;
        out = o;
        event("connected", "{\"how\":" + q(how) + ",\"role\":" + q(role) + ",\"peer\":" + q(peer) + "}");
        Thread t = new Thread(() -> {
            String reason = "The other phone disconnected";
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) a.linkMessage(line);
            } catch (IOException e) {
                reason = "Link lost: " + e.getMessage();
            }
            if (conn == c) { out = null; conn = null; closeQuiet(c); if (!closing) event("closed", reason); }
        }, "link-read");
        t.setPriority(Thread.MAX_PRIORITY);
        t.start();
    }

    /** Sends one line. Called from the page; returns false when there's no link. */
    @JavascriptInterface
    public boolean send(String line) {
        OutputStream o = out;
        if (o == null) return false;
        try {
            synchronized (this) { o.write((line + "\n").getBytes(StandardCharsets.UTF_8)); o.flush(); }
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    @JavascriptInterface
    public void close(String why) {
        closing = true;
        stopSearch();
        unregister();
        Closeable c = conn, s = server;
        conn = null; server = null; out = null;
        closeQuiet(c);
        closeQuiet(s);
    }

    private static void closeQuiet(Closeable c) {
        try { if (c != null) c.close(); } catch (Exception ignored) { }
    }
}
