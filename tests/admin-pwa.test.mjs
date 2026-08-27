import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, chatAssistant, manifestSource, serviceWorker, firestoreRules, functionsSource, geminiAssistantSource, functionsPackage] = await Promise.all([
    readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../admin/chat-assistant.mjs", import.meta.url), "utf8"),
    readFile(new URL("../admin/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../admin/service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
    readFile(new URL("../functions/gemini-assistant.js", import.meta.url), "utf8"),
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
    assert.match(serviceWorker, /chat-assistant\.mjs/);
    assert.match(serviceWorker, /addEventListener\("push"/);
    assert.match(serviceWorker, /showNotification/);
});

test("opens into a conversational assistant with a complete dashboard switch", () => {
    assert.match(adminPage, /id="chat-mode-button"[^>]+aria-pressed="true"/);
    assert.match(adminPage, /id="dashboard-mode-button"/);
    assert.match(adminPage, /id="chat-conversation"[^>]+role="log"/);
    assert.match(adminPage, /id="chat-composer-input"/);
    assert.match(adminPage, /activateAdminMode\("chat"\)/);
    assert.match(adminPage, /createAdminChat\(/);
    assert.match(chatAssistant, /How can I help\?/);
    assert.match(chatAssistant, /actionButton\("Today"/);
    assert.match(chatAssistant, /actionButton\("Encounters"/);
    assert.match(chatAssistant, /actionButton\("Reminders"/);
    assert.match(chatAssistant, /actionButton\("Directory"/);
    assert.match(chatAssistant, /actionButton\("Resources"/);
    assert.match(chatAssistant, /actionButton\("Intake forms"/);
});

test("supports viewing and mutating every admin data area inside chat", () => {
    assert.match(chatAssistant, /showEncounterForm/);
    assert.match(chatAssistant, /showReminderForm/);
    assert.match(chatAssistant, /showDirectoryForm/);
    assert.match(chatAssistant, /showResourcePasteForm/);
    assert.match(chatAssistant, /showIntakeDetails/);
    assert.match(chatAssistant, /actions\.saveEncounter/);
    assert.match(chatAssistant, /actions\.saveReminder/);
    assert.match(chatAssistant, /actions\.saveDirectoryEntry/);
    assert.match(chatAssistant, /actions\.publishResource/);
    assert.match(chatAssistant, /actions\.deleteSubmission/);
    assert.match(chatAssistant, /actions\.setThreadArchived/);
    assert.match(chatAssistant, /actions\.completeReminder/);
    assert.match(chatAssistant, /actions\.enableNotifications/);
    assert.match(chatAssistant, /actions\.disableNotifications/);
    assert.match(chatAssistant, /actions\.testNotifications/);
});

test("adds a protected Gemini assistant with allowlisted, confirmation-gated skills", () => {
    assert.match(adminPage, /const adminAssistantFunction = httpsCallable\(cloudFunctions, "adminAssistant"/);
    assert.match(adminPage, /function compactAssistantContext\(\)/);
    assert.match(adminPage, /skill: "delete_reminder"/);
    assert.match(adminPage, /id="chat-smart-status"/);
    assert.match(chatAssistant, /actions\.askAssistant/);
    assert.match(chatAssistant, /presentSmartPlan/);
    assert.match(chatAssistant, /Nothing changes until you review the details/);
    assert.match(chatAssistant, /This cannot be undone\./);
    assert.match(chatAssistant, /smartActionPresentation/);
    assert.match(functionsSource, /const GEMINI_API_KEY = defineSecret\("GEMINI_API_KEY"\)/);
    assert.match(functionsSource, /exports\.adminAssistant = onCall/);
    assert.match(functionsSource, /const AI_DAILY_LIMIT = 30/);
    assert.match(functionsSource, /const AI_MONTHLY_LIMIT = 500/);
    assert.match(geminiAssistantSource, /const MODEL_ID = "gemini-3\.1-flash-lite"/);
    assert.match(geminiAssistantSource, /const SKILLS = Object\.freeze/);
    assert.match(geminiAssistantSource, /responseJsonSchema: RESPONSE_SCHEMA/);
    assert.match(geminiAssistantSource, /requiresConfirmation: WRITE_SKILLS\.has\(skill\)/);
    assert.doesNotMatch(geminiAssistantSource, /names: 240, contact:/);
    assert.equal(JSON.parse(functionsPackage).dependencies["@google/genai"], "^2.19.0");
});

test("registers durable background push and sends reminders from Firebase", () => {
    assert.match(adminPage, /pushManager\.subscribe/);
    assert.match(adminPage, /applicationServerKey: base64UrlBytes\(VAPID_PUBLIC_KEY\)/);
    assert.match(adminPage, /PUSH_SUBSCRIPTIONS_COLLECTION/);
    assert.match(adminPage, /sendTestPushFunction/);
    assert.match(adminPage, /id="test-notifications-button"/);
    assert.match(adminPage, /id="scheduled-meeting-notifications"[^>]+role="switch"[^>]+checked/);
    assert.match(adminPage, /id="new-intake-notifications"[^>]+role="switch"[^>]+checked/);
    assert.match(adminPage, /notifyScheduledEncounters: true/);
    assert.match(adminPage, /notifyNewIntakes: true/);
    assert.match(adminPage, /Test notification sent\. It may take a few seconds to appear\./);
    assert.match(adminPage, /Background notifications are on/);
    assert.doesNotMatch(adminPage, /maybeSendDailyNotification/);
    assert.match(firestoreRules, /match \/admin_push_subscriptions\/\{subscriptionId\}/);
    assert.match(firestoreRules, /subscriptionId\.matches\(request\.auth\.uid \+ '_\[a-zA-Z0-9-\]\{8,64\}'\)/);
    assert.match(firestoreRules, /match \/admin_reminder_snoozes\/\{snoozeId\}/);
    assert.match(functionsSource, /exports\.sendAdminReminders = onSchedule/);
    assert.match(functionsSource, /schedule: "every 15 minutes"/);
    assert.match(functionsSource, /exports\.sendNewIntakeNotification = onDocumentCreated/);
    assert.match(functionsSource, /A new intake form was submitted\./);
    assert.match(functionsSource, /filterNotificationPreferences/);
    assert.match(functionsSource, /exports\.sendTestPush = onCall/);
    assert.match(functionsSource, /WEB_PUSH_VAPID_PRIVATE_KEY/);
    assert.match(functionsSource, /VAPID_PRIVATE_KEY\.value\(\)\.trim\(\)/);
    assert.match(firestoreRules, /notifyScheduledEncounters/);
    assert.match(firestoreRules, /notifyNewIntakes/);
    assert.match(chatAssistant, /Meeting alerts:/);
    assert.match(chatAssistant, /New form alerts:/);
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
