import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, manifestSource, serviceWorker, firestoreRules] = await Promise.all([
    readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../admin/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../admin/service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8")
]);

const manifest = JSON.parse(manifestSource);

test("defines an installable admin PWA scoped to /admin/", () => {
    assert.equal(manifest.id, "/admin/");
    assert.equal(manifest.start_url, "/admin/");
    assert.equal(manifest.scope, "/admin/");
    assert.equal(manifest.display, "standalone");
    assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);
    assert.deepEqual(manifest.shortcuts.map(({ short_name }) => short_name), ["Resources", "Encounters", "Reminders"]);
    assert.match(adminPage, /rel="manifest" href="\.\/manifest\.webmanifest"/);
    assert.match(adminPage, /navigator\.serviceWorker\.register\("\.\/service-worker\.js", \{ scope: "\.\/" \}\)/);
});

test("remembers a successful device unlock until the admin locks the app", () => {
    assert.match(adminPage, /const ADMIN_UNLOCK_KEY = "binyanShalem\.adminUnlocked\.v1"/);
    assert.match(adminPage, /window\.localStorage\.setItem\(ADMIN_UNLOCK_KEY, "unlocked"\)/);
    assert.match(adminPage, /window\.localStorage\.removeItem\(ADMIN_UNLOCK_KEY\)/);
    assert.match(adminPage, />Lock app</);
    assert.match(adminPage, /if \(!hasRememberedUnlock\(\)\)/);
});

test("keeps the app shell cached without caching Firestore writes", () => {
    assert.match(serviceWorker, /const APP_SHELL = \[/);
    assert.match(serviceWorker, /"\/admin\/manifest\.webmanifest"/);
    assert.match(serviceWorker, /if \(request\.method !== "GET"\) return/);
    assert.doesNotMatch(serviceWorker, /firestore\.googleapis\.com/);
    assert.match(serviceWorker, /notificationclick/);
    assert.match(serviceWorker, /organizer-tools\.mjs/);
});

test("provides the three organizer sections and low-entry encounter form", () => {
    assert.match(adminPage, /<span>Resources<\/span>/);
    assert.match(adminPage, /<span>Encounters<\/span>/);
    assert.match(adminPage, /<span>Reminders<\/span>/);
    assert.match(adminPage, /id="encounter-names"[^>]+required/);
    assert.match(adminPage, /id="encounter-followup"[^>]+role="switch"/);
    assert.match(adminPage, /data-encounter-view="archived"/);
    assert.match(adminPage, /"Log encounter"/);
    assert.match(adminPage, /"Taken care of"/);
    assert.match(firestoreRules, /match \/admin_encounters\/\{encounterId\}/);
    assert.match(firestoreRules, /match \/admin_reminder_resolutions\/\{resolutionId\}/);
});
