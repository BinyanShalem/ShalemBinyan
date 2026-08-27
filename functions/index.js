"use strict";

const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const webpush = require("web-push");
const { generateAssistantPlan, usageKeys } = require("./gemini-assistant");
const { deriveDueReminders } = require("./reminders");

initializeApp();

const db = getFirestore();
const PROJECT_ID = "binyanshalem-28b1a";
const PUSH_SUBSCRIPTIONS_COLLECTION = "admin_push_subscriptions";
const PUSH_SNOOZES_COLLECTION = "admin_reminder_snoozes";
const PUSH_DELIVERIES_COLLECTION = "admin_push_deliveries";
const AI_USAGE_COLLECTION = "admin_ai_usage";
const AI_DAILY_LIMIT = 30;
const AI_MONTHLY_LIMIT = 500;
const VAPID_PUBLIC_KEY = "BL7ha4R4kMW9sE9RJAkn1tIfJFEjjRYVUVDRTGq1TZrSCuReDfCebPst902WeZbNSBZYMnt-Qx4qeDqOCR4LHAQ";
const VAPID_PRIVATE_KEY = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

function configureWebPush() {
    const privateKey = VAPID_PRIVATE_KEY.value().trim();
    webpush.setVapidDetails(
        "https://www.binyan-shalem.com",
        VAPID_PUBLIC_KEY,
        privateKey
    );
}

function documentRows(snapshot) {
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function subscriptionFrom(data = {}) {
    return {
        endpoint: data.endpoint,
        expirationTime: data.expirationTime || null,
        keys: { p256dh: data.p256dh, auth: data.auth }
    };
}

function deliveryId(subscriptionId, localDay, reminderKey) {
    return createHash("sha256")
        .update(`${subscriptionId}|${localDay}|${reminderKey}`)
        .digest("hex");
}

async function unsentReminders(subscriptionId, localDay, reminders) {
    if (!reminders.length) return [];
    const refs = reminders.map(({ key }) => db.collection(PUSH_DELIVERIES_COLLECTION).doc(
        deliveryId(subscriptionId, localDay, key)
    ));
    const snapshots = await db.getAll(...refs);
    return reminders.filter((_, index) => !snapshots[index].exists);
}

async function recordDeliveries(subscriptionId, localDay, reminders) {
    const batch = db.batch();
    reminders.forEach(({ key }) => {
        const ref = db.collection(PUSH_DELIVERIES_COLLECTION).doc(deliveryId(subscriptionId, localDay, key));
        batch.set(ref, {
            subscriptionId,
            localDay,
            reminderKey: key,
            sentAt: FieldValue.serverTimestamp()
        });
    });
    await batch.commit();
}

async function removeExpiredSubscription(ref, error) {
    if (![404, 410].includes(error?.statusCode)) return false;
    await ref.delete();
    return true;
}

function notificationPayload(reminders, { test = false } = {}) {
    return JSON.stringify({
        title: test ? "Binyan Shalem notifications are ready" : "Binyan Shalem reminder",
        body: test
            ? "You’ll now receive reminders even when the admin app is closed."
            : reminders.length === 1
                ? reminders[0].body
                : `${reminders.length} reminders need your attention.`,
        icon: "/admin/icons/icon-192.png",
        badge: "/admin/icons/icon-192.png",
        tag: test ? "binyan-push-test" : "binyan-reminders",
        url: "/admin/?tab=reminders"
    });
}

async function reserveAssistantUsage(uid, now = new Date()) {
    const keys = usageKeys(uid, now);
    const dailyRef = db.collection(AI_USAGE_COLLECTION).doc(keys.dailyId);
    const monthlyRef = db.collection(AI_USAGE_COLLECTION).doc(keys.monthlyId);
    return db.runTransaction(async (transaction) => {
        const [dailySnapshot, monthlySnapshot] = await Promise.all([
            transaction.get(dailyRef),
            transaction.get(monthlyRef)
        ]);
        const dailyCount = Number(dailySnapshot.data()?.count || 0);
        const monthlyCount = Number(monthlySnapshot.data()?.count || 0);
        if (dailyCount >= AI_DAILY_LIMIT) {
            throw new HttpsError("resource-exhausted", "The Smart assistant has reached today’s safety limit. The guided menu still works.");
        }
        if (monthlyCount >= AI_MONTHLY_LIMIT) {
            throw new HttpsError("resource-exhausted", "The Smart assistant has reached this month’s cost limit. The guided menu still works.");
        }
        const updatedAt = FieldValue.serverTimestamp();
        transaction.set(dailyRef, {
            uid,
            day: keys.day,
            count: dailyCount + 1,
            updatedAt
        }, { merge: true });
        transaction.set(monthlyRef, {
            month: keys.month,
            count: monthlyCount + 1,
            updatedAt
        }, { merge: true });
        return {
            dailyRemaining: AI_DAILY_LIMIT - dailyCount - 1,
            monthlyRemaining: AI_MONTHLY_LIMIT - monthlyCount - 1
        };
    });
}

exports.sendAdminReminders = onSchedule({
    schedule: "every 15 minutes",
    timeZone: "America/New_York",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 120,
    maxInstances: 1,
    secrets: [VAPID_PRIVATE_KEY]
}, async () => {
    configureWebPush();
    const [submissions, encounters, resolutions, manualReminders, snoozes, subscriptions] = await Promise.all([
        db.collection("artifacts").doc(PROJECT_ID).collection("public").doc("data").collection("submissions").get(),
        db.collection("admin_encounters").get(),
        db.collection("admin_reminder_resolutions").get(),
        db.collection("admin_manual_reminders").get(),
        db.collection(PUSH_SNOOZES_COLLECTION).get(),
        db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).where("enabled", "==", true).get()
    ]);

    const rows = {
        submissions: documentRows(submissions),
        encounters: documentRows(encounters),
        resolutions: documentRows(resolutions),
        manualReminders: documentRows(manualReminders),
        snoozes: documentRows(snoozes)
    };

    await Promise.all(subscriptions.docs.map(async (subscriptionDoc) => {
        const subscriptionData = subscriptionDoc.data();
        const { day, reminders } = deriveDueReminders({
            ...rows,
            now: new Date(),
            timeZone: subscriptionData.timeZone || "America/New_York"
        });
        const unsent = await unsentReminders(subscriptionDoc.id, day, reminders);
        if (!unsent.length) return;
        try {
            await webpush.sendNotification(
                subscriptionFrom(subscriptionData),
                notificationPayload(unsent),
                { TTL: 3600, urgency: "normal" }
            );
            await recordDeliveries(subscriptionDoc.id, day, unsent);
        } catch (error) {
            const removed = await removeExpiredSubscription(subscriptionDoc.ref, error);
            if (!removed) throw error;
        }
    }));

    const cutoff = Timestamp.fromMillis(Date.now() - 45 * 86400000);
    const oldDeliveries = await db.collection(PUSH_DELIVERIES_COLLECTION)
        .where("sentAt", "<", cutoff)
        .limit(200)
        .get();
    if (!oldDeliveries.empty) {
        const cleanup = db.batch();
        oldDeliveries.docs.forEach((item) => cleanup.delete(item.ref));
        await cleanup.commit();
    }
});

exports.sendTestPush = onCall({
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    secrets: [VAPID_PRIVATE_KEY]
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before enabling notifications.");
    const deviceId = typeof request.data?.deviceId === "string" ? request.data.deviceId : "";
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) {
        throw new HttpsError("invalid-argument", "A valid device ID is required.");
    }
    const ref = db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(`${request.auth.uid}_${deviceId}`);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().enabled !== true) {
        throw new HttpsError("not-found", "This device is not registered for notifications.");
    }
    configureWebPush();
    try {
        await webpush.sendNotification(
            subscriptionFrom(snapshot.data()),
            notificationPayload([], { test: true }),
            { TTL: 300, urgency: "normal" }
        );
        return { delivered: true };
    } catch (error) {
        await removeExpiredSubscription(ref, error);
        throw new HttpsError("unavailable", "The test notification could not be delivered.");
    }
});

exports.adminAssistant = onCall({
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 2,
    secrets: [GEMINI_API_KEY]
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unlock the admin app before using the Smart assistant.");
    const message = typeof request.data?.message === "string" ? request.data.message.trim() : "";
    if (!message || message.length > 500) {
        throw new HttpsError("invalid-argument", "Write a message between 1 and 500 characters.");
    }
    const apiKey = GEMINI_API_KEY.value().trim();
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "Smart assistant setup is not finished yet. The guided menu still works.");
    }
    const usage = await reserveAssistantUsage(request.auth.uid);
    try {
        const plan = await generateAssistantPlan({
            apiKey,
            message,
            context: request.data?.context,
            history: request.data?.history
        });
        return { ...plan, usage };
    } catch (error) {
        console.error("Gemini assistant request failed", {
            name: error?.name,
            status: error?.status,
            code: error?.code
        });
        if ([400, 401, 403].includes(Number(error?.status))) {
            throw new HttpsError("failed-precondition", "Smart assistant setup needs attention. The guided menu still works.");
        }
        throw new HttpsError("unavailable", "The Smart assistant could not respond right now. The guided menu still works.");
    }
});
