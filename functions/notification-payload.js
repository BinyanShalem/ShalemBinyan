"use strict";

// Keep private names, amounts, and notes out of push payloads and URLs.
function notificationPayload(reminders, { test = false, tag = "", title = "", body = "", url = "" } = {}) {
    const params = new URLSearchParams(url.split("?")[1] || "tab=reminders");
    params.set("notice", test ? "test" : "items");
    params.set("count", String(reminders.length));
    const keys = [...new Set(reminders.map(({ key }) => key))]
        .filter((key) => /^(submission|scheduled|encounter|manual|donation):[^/\u0000-\u001f]{1,180}$/.test(key));
    // Bound the payload well below Web Push's size limit, even for a busy day.
    for (const key of keys.slice(0, 6)) {
        const next = new URLSearchParams(params);
        next.append("item", key);
        if (Buffer.byteLength(next.toString(), "utf8") > 2200) break;
        params.append("item", key);
    }
    return JSON.stringify({
        title: title || (test ? "Binyan Shalem notifications are ready" : "Binyan Shalem reminder"),
        body: body || (test
            ? "You’ll now receive reminders even when the admin app is closed."
            : reminders.length === 1
                ? reminders[0].body
                : `${reminders.length} reminders need your attention.`),
        icon: "/admin/icons/icon-192.png",
        badge: "/admin/icons/icon-192.png",
        tag: tag || (test ? "binyan-push-test" : "binyan-reminders"),
        url: `/admin/?${params}`
    });
}

module.exports = { notificationPayload };
