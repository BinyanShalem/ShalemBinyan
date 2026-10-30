const CACHE_VERSION = "binyan-admin-2026-10-29.1";
const APP_SHELL = [
    "/admin/",
    "/admin/index.html",
    "/admin/manifest.webmanifest",
    "/admin/organizer-tools.mjs",
    "/admin/directory-tools.mjs",
    "/admin/chat-assistant.mjs",
    "/admin/notification-route.mjs?v=2026-10-29.1",
    "/admin/notification-view.css?v=2026-10-29.1",
    "/admin/icons/icon-192.png",
    "/admin/icons/icon-512.png",
    "/admin/icons/apple-touch-icon.png",
    "/logo_nbg.png",
    "/content-resource-tools.mjs",
    "/donation-tools.mjs",
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
        || ["/logo_nbg.png", "/content-resource-tools.mjs", "/donation-tools.mjs", "/cache-refresh.js", "/site-version.json"].includes(url.pathname)
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

function notificationTarget(notification) {
    let target;
    try {
        target = new URL(notification.data?.url || "/admin/?tab=reminders", self.location.origin);
    } catch {
        target = new URL("/admin/?tab=reminders", self.location.origin);
    }
    if (target.origin !== self.location.origin || !["/admin/", "/admin/index.html"].includes(target.pathname)) {
        target = new URL("/admin/?tab=reminders", self.location.origin);
    }
    if (!target.searchParams.has("notice")) {
        target.searchParams.set("notice", notification.tag === "binyan-push-test" ? "test" : "legacy");
        if (notification.body) target.searchParams.set("reason", notification.body.slice(0, 300));
    }
    return target.href;
}

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = notificationTarget(event.notification);
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
            const existing = clients.find((client) => {
                const url = new URL(client.url);
                return url.origin === self.location.origin && url.pathname.startsWith("/admin/");
            });
            if (existing) {
                try {
                    const navigated = await existing.navigate(targetUrl);
                    if (navigated) return navigated.focus();
                } catch {
                    // A closing tab must not swallow the notification click.
                }
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});
