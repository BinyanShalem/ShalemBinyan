import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, manifestSource, serviceWorker, firestoreRules, functionsSource, functionsPackage] = await Promise.all([
    readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../admin/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../admin/service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
    readFile(new URL("../functions/package.json", import.meta.url), "utf8")
]);

const manifest = JSON.parse(manifestSource);

test("defines an installable admin PWA scoped to /admin/", () => {
    assert.equal(manifest.id, "/admin/");
    assert.equal(manifest.start_url, "/admin/");
    assert.equal(manifest.scope, "/admin/");
    assert.equal(manifest.display, "standalone");
    assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);
    assert.deepEqual(manifest.shortcuts.map(({ short_name }) => short_name), ["Resources", "Encounters", "Directory", "Reminders"]);
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
    assert.match(serviceWorker, /directory-tools\.mjs/);
    assert.match(serviceWorker, /addEventListener\("push"/);
    assert.match(serviceWorker, /showNotification/);
});

test("registers durable background push and sends reminders from Firebase", () => {
    assert.match(adminPage, /pushManager\.subscribe/);
    assert.match(adminPage, /applicationServerKey: base64UrlBytes\(VAPID_PUBLIC_KEY\)/);
    assert.match(adminPage, /PUSH_SUBSCRIPTIONS_COLLECTION/);
    assert.match(adminPage, /sendTestPushFunction/);
    assert.match(adminPage, /Background notifications are on/);
    assert.doesNotMatch(adminPage, /maybeSendDailyNotification/);
    assert.match(firestoreRules, /match \/admin_push_subscriptions\/\{subscriptionId\}/);
    assert.match(firestoreRules, /subscriptionId\.matches\(request\.auth\.uid \+ '_\[a-zA-Z0-9-\]\{8,64\}'\)/);
    assert.match(firestoreRules, /match \/admin_reminder_snoozes\/\{snoozeId\}/);
    assert.match(functionsSource, /exports\.sendAdminReminders = onSchedule/);
    assert.match(functionsSource, /schedule: "every 15 minutes"/);
    assert.match(functionsSource, /exports\.sendTestPush = onCall/);
    assert.match(functionsSource, /WEB_PUSH_VAPID_PRIVATE_KEY/);
    assert.equal(JSON.parse(functionsPackage).engines.node, "22");
});

test("provides completed and scheduled encounters in one low-entry organizer", () => {
    assert.match(adminPage, /<span>Resources<\/span>/);
    assert.match(adminPage, /<span>Encounters<\/span>/);
    assert.match(adminPage, /<span>Directory<\/span>/);
    assert.match(adminPage, /<span>Reminders<\/span>/);
    assert.match(adminPage, /id="encounter-names"[^>]+required/);
    assert.match(adminPage, /id="encounter-other-people"[^>]+maxlength="500"/);
    assert.match(adminPage, /id="encounter-followup"[^>]+role="switch"/);
    assert.match(adminPage, /data-encounter-view="archived"/);
    assert.match(adminPage, /id="log-new-encounter-button"/);
    assert.match(adminPage, /id="schedule-new-encounter-button"/);
    assert.match(adminPage, /id="encounter-type"[^>]+value="completed"/);
    assert.match(adminPage, /"Schedule encounter"/);
    assert.doesNotMatch(adminPage, /"Log encounter"/);
    assert.match(adminPage, /"Taken care of"/);
    assert.match(firestoreRules, /match \/admin_encounters\/\{encounterId\}/);
    assert.match(firestoreRules, /match \/admin_reminder_resolutions\/\{resolutionId\}/);
    assert.match(firestoreRules, /'completed', 'scheduled'/);
});

test("lets the admin create personal reminders without an intake or encounter", () => {
    assert.match(adminPage, /id="new-manual-reminder-button"/);
    assert.match(adminPage, /id="manual-reminder-form"/);
    assert.match(adminPage, /id="manual-reminder-title"[^>]+required/);
    assert.match(adminPage, /id="manual-reminder-date"[^>]+type="date"/);
    assert.match(adminPage, /id="manual-reminder-time"[^>]+type="time"/);
    assert.match(adminPage, /id="manual-reminder-description"/);
    assert.match(adminPage, /edit\.dataset\.manualReminderEditId = reminder\.targetId/);
    assert.match(adminPage, /MANUAL_REMINDERS_COLLECTION/);
    assert.match(firestoreRules, /match \/admin_manual_reminders\/\{reminderId\}/);
});

test("provides a private directory with low-entry contact and resource tools", () => {
    assert.match(adminPage, /id="directory-panel"/);
    assert.match(adminPage, /id="directory-name"[^>]+required/);
    assert.match(adminPage, /data-directory-filter="Therapist"/);
    assert.match(adminPage, /data-directory-filter="Resource"/);
    assert.match(adminPage, /createDirectoryLink\("Call"/);
    assert.match(adminPage, /createDirectoryLink\("Text"/);
    assert.match(adminPage, /createDirectoryLink\("Email"/);
    assert.match(adminPage, /createDirectoryLink\("Open"/);
    assert.match(adminPage, /let directoryFormTrigger = null/);
    assert.match(adminPage, /edit\.dataset\.directoryEditId = entry\.id/);
    assert.match(adminPage, /restoreTarget\.focus\(\)/);
    assert.match(firestoreRules, /match \/admin_directory\/\{entryId\}/);
});

test("opens one meeting at a time and supports editing that meeting", () => {
    assert.match(adminPage, /id="meeting-detail-dialog"/);
    assert.match(adminPage, /className = "meeting-entry-open"/);
    assert.match(adminPage, /meetingDetailDialog\.showModal\(\)/);
    assert.match(adminPage, />Edit meeting</);
    assert.match(adminPage, /id="meeting-edit-form"/);
    assert.match(adminPage, /id="meeting-detail-other-people"/);
    assert.match(adminPage, /id="meeting-edit-other-people"/);
    assert.match(adminPage, />Save changes</);
    assert.match(adminPage, /id="record-meeting-outcome-button"/);
    assert.match(adminPage, /meetingEditTargetType === "scheduled"/);
    assert.match(adminPage, /encounterType: meetingEditTargetType/);
    assert.match(adminPage, /await updateDoc\(doc\(db, ENCOUNTERS_COLLECTION, meeting\.id\), changes\)/);
    assert.match(firestoreRules, /otherPeopleInvolved/);
});
