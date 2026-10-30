import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { notificationPayload } from "../functions/notification-payload.js";
import { readNotificationRoute, resolveNotificationItem } from "../admin/notification-route.mjs";

for (const type of ["submission", "scheduled", "encounter", "manual", "donation"]) {
    test(`${type} push carries the exact record to a contextual notification page`, () => {
        const payload = JSON.parse(notificationPayload([{ key: `${type}:record_123`, type, body: "Generic alert." }]));
        const route = readNotificationRoute(payload.url);
        assert.deepEqual(route.items, [{ key: `${type}:record_123`, type, id: "record_123" }]);
        assert.ok(route.title && route.reason);
        assert.equal(route.count, 1);
        assert.equal(route.donations, type === "donation");
    });
}

test("grouped alerts preserve notified IDs and bound payload size without exposing record contents", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ key: `manual:${i}`, title: "Private reminder", notes: "Private notes" }));
    const payload = notificationPayload(rows);
    const route = readNotificationRoute(JSON.parse(payload).url);
    assert.equal(route.count, 100);
    assert.equal(route.items.length, 6);
    assert.doesNotMatch(payload, /Private/);
    const longKeys = rows.map((row, i) => ({ ...row, key: `manual:${i}${"א".repeat(179)}` }));
    assert.ok(Buffer.byteLength(notificationPayload(longKeys)) < 3500);
});

test("test and legacy alerts explain the notification without inventing a record", () => {
    const route = readNotificationRoute(JSON.parse(notificationPayload([], { test: true })).url);
    assert.equal(route.kind, "test");
    assert.equal(route.items.length, 0);
    assert.match(route.reason, /no task/);
    const legacy = readNotificationRoute("/admin/?notice=legacy&view=donations&reason=A%20donation%20form%20was%20submitted.");
    assert.equal(legacy.donations, true);
    assert.equal(legacy.reason, "A donation form was submitted.");
    assert.equal(readNotificationRoute("/admin/?tab=reminders"), null);
});

test("routes reject invalid targets, deduplicate, and preserve encoded identifiers", () => {
    const params = new URLSearchParams({ notice: "items" });
    for (const key of ["manual:id & name", "manual:id & name", "manual:../bad", "evil:id", "manual:"]) params.append("item", key);
    const route = readNotificationRoute(`/admin/?${params}`);
    assert.deepEqual(route.items, [{ key: "manual:id & name", type: "manual", id: "id & name" }]);
    assert.equal(route.count, 1);
});

test("item resolution waits for data and distinguishes errors, missing records, and completed/archived records", () => {
    const item = { key: "manual:m1", type: "manual", id: "m1" };
    const state = { loaded: {}, manualReminders: [], donations: [] };
    assert.equal(resolveNotificationItem(item, state).status, "loading");
    state.errors = { manualReminders: true };
    assert.equal(resolveNotificationItem(item, state).status, "error");
    state.errors = {};
    state.loaded.manualReminders = true;
    assert.equal(resolveNotificationItem(item, state).status, "missing");
    state.manualReminders = [{ id: "m1", title: "Already handled", completed: true }];
    const resolved = resolveNotificationItem(item, state);
    assert.equal(resolved.status, "ready");
    assert.equal(resolved.record.completed, true);
    state.loaded.donations = true;
    state.donations = [{ id: "d1", name: "Archived donation", archived: true }];
    assert.equal(resolveNotificationItem({ type: "donation", id: "d1" }, state).record.archived, true);
});

const serviceWorkerSource = await readFile(new URL("../admin/service-worker.js", import.meta.url), "utf8");
async function clickNotification({ data, body, tag, windows = [] }) {
    const listeners = {};
    const opened = [];
    let closed = false;
    let work;
    const self = {
        location: { origin: "https://www.binyan-shalem.com" },
        addEventListener: (name, callback) => { listeners[name] = callback; },
        clients: { matchAll: async () => windows, openWindow: async (url) => { opened.push(url); } }
    };
    vm.runInNewContext(serviceWorkerSource, { self, URL });
    listeners.notificationclick({
        notification: { data, body, tag, close: () => { closed = true; } },
        waitUntil: (promise) => { work = promise; }
    });
    await work;
    assert.equal(closed, true);
    return opened;
}

test("closed-app clicks open the exact notification and legacy clicks gain context", async () => {
    const payload = JSON.parse(notificationPayload([{ key: "submission:abc", body: "A new intake form was submitted." }]));
    const [opened] = await clickNotification({ data: { url: payload.url } });
    assert.equal(readNotificationRoute(opened).items[0].id, "abc");
    const [legacy] = await clickNotification({ data: { url: "/admin/?tab=reminders" }, body: "A follow-up needs your attention." });
    assert.equal(readNotificationRoute(legacy).reason, "A follow-up needs your attention.");
});

test("existing admin windows navigate and focus, with a safe fallback when navigation fails", async () => {
    let navigated;
    let focused = false;
    const existing = { url: "https://www.binyan-shalem.com/admin/", navigate: async (url) => { navigated = url; return { focus: async () => { focused = true; } }; } };
    assert.deepEqual(await clickNotification({ data: { url: "/admin/?notice=test" }, windows: [existing] }), []);
    assert.match(navigated, /notice=test/);
    assert.equal(focused, true);
    existing.navigate = async () => { throw new Error("Tab closed"); };
    assert.equal((await clickNotification({ data: {}, windows: [existing] })).length, 1);
    existing.navigate = async () => null;
    assert.equal((await clickNotification({ data: {}, windows: [existing] })).length, 1);
});

test("notification clicks cannot navigate off-site or outside the admin route", async () => {
    for (const url of ["https://example.org/admin/", "javascript:alert(1)", "/donate/", "http://["]) {
        const [opened] = await clickNotification({ data: { url } });
        assert.equal(new URL(opened).origin, "https://www.binyan-shalem.com");
        assert.equal(new URL(opened).pathname, "/admin/");
    }
});
