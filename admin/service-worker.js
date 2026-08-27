const CACHE_VERSION = "binyan-admin-2026-08-27.5";
const APP_SHELL = [
    "/admin/",
    "/admin/index.html",
    "/admin/manifest.webmanifest",
    "/admin/organizer-tools.mjs",
    "/admin/directory-tools.mjs",
    "/admin/chat-assistant.mjs",
    "/admin/icons/icon-192.png",
    "/admin/icons/icon-512.png",
    "/admin/icons/apple-touch-icon.png",
    "/logo_nbg.png",
    "/content-resource-tools.mjs",
    "/cache-refresh.js",
    "/site-version.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith("binyan-admin-") && key !== CACHE_VERSION)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch {
        return (await cache.match(request)) || (await cache.match("/admin/"));
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
        if (response.ok || response.type === "opaque") cache.put(request, response.clone());
        return response;
    }).catch(() => null);
    return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request));
        return;
    }

    const url = new URL(request.url);
    const isStaticAsset = ["style", "script", "image", "font", "manifest"].includes(request.destination);
    const isLocalAdminAsset = url.origin === self.location.origin && (
        url.pathname.startsWith("/admin/")
        || ["/logo_nbg.png", "/content-resource-tools.mjs", "/cache-refresh.js", "/site-version.json"].includes(url.pathname)
    );

    if (isStaticAsset || isLocalAdminAsset) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data?.json() || {};
    } catch {
        payload = { body: event.data?.text() || "A reminder needs your attention." };
    }
    event.waitUntil(self.registration.showNotification(payload.title || "Binyan Shalem reminder", {
        body: payload.body || "A reminder needs your attention.",
        icon: payload.icon || "/admin/icons/icon-192.png",
        badge: payload.badge || "/admin/icons/icon-192.png",
        tag: payload.tag || "binyan-reminders",
        renotify: false,
        data: { url: payload.url || "/admin/?tab=reminders" }
    }));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || "/admin/?tab=reminders", self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
            const existing = clients.find((client) => new URL(client.url).pathname.startsWith("/admin/"));
            if (existing) {
                await existing.navigate(targetUrl);
                return existing.focus();
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});
