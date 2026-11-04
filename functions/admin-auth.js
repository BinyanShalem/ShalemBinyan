"use strict";

const { createHash, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

const deriveKey = promisify(scrypt);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS_COLLECTION = "admin_login_attempts";

function requireAdmin(request, message = "Unlock the admin app before continuing.") {
    if (!request.auth) throw new HttpsError("unauthenticated", message);
    if (request.auth.token?.admin !== true) throw new HttpsError("permission-denied", message);
}

async function passwordMatches(password, serializedVerifier) {
    let verifier;
    try {
        verifier = JSON.parse(serializedVerifier);
    } catch {
        throw new HttpsError("failed-precondition", "Admin sign-in is not configured.");
    }
    if (verifier?.algorithm !== "scrypt-v1"
        || typeof verifier.salt !== "string"
        || typeof verifier.hash !== "string"
        || !/^[a-f0-9]{32}$/.test(verifier.salt)
        || !/^[a-f0-9]{64}$/.test(verifier.hash)) {
        throw new HttpsError("failed-precondition", "Admin sign-in is not configured.");
    }
    const actual = await deriveKey(password, Buffer.from(verifier.salt, "hex"), 32, {
        N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024
    });
    return timingSafeEqual(actual, Buffer.from(verifier.hash, "hex"));
}

function loginAttemptBuckets(uid, ip, now = Date.now()) {
    const window = Math.floor(now / LOGIN_WINDOW_MS);
    return [
        { kind: "user", identity: uid, limit: 30 },
        // This is only a supplemental limit: forwarded addresses can be spoofed.
        { kind: "network", identity: ip || "unknown", limit: 150 },
        { kind: "project", identity: "admin-login", limit: 1000 }
    ].map(({ kind, identity, limit }) => ({
        id: `${kind}_${window}_${createHash("sha256").update(identity).digest("hex")}`,
        limit,
        expiresAt: Timestamp.fromMillis((window + 1) * LOGIN_WINDOW_MS + 24 * 60 * 60 * 1000)
    }));
}

async function reserveLoginAttempt(db, uid, ip, now = Date.now()) {
    const buckets = loginAttemptBuckets(uid, ip, now);
    const refs = buckets.map(({ id }) => db.collection(LOGIN_ATTEMPTS_COLLECTION).doc(id));
    await db.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const counts = snapshots.map((snapshot) => Number(snapshot.data()?.count || 0));
        if (counts.some((count, index) => count >= buckets[index].limit)) {
            throw new HttpsError("resource-exhausted", "Too many sign-in attempts. Please try again later.");
        }
        refs.forEach((ref, index) => transaction.set(ref, {
            count: counts[index] + 1,
            expiresAt: buckets[index].expiresAt
        }));
    });
}

function createAdminLoginHandler({ auth, readPasswordVerifier, reserveAttempt }) {
    return async (request) => {
        if (!request.auth?.uid) {
            throw new HttpsError("unauthenticated", "Connect before unlocking the admin app.");
        }
        const password = request.data?.password;
        if (typeof password !== "string" || !password.length || password.length > 1024) {
            throw new HttpsError("permission-denied", "That password didn’t match. Please try again.");
        }
        await reserveAttempt(request.auth.uid, request.rawRequest?.ip || "unknown");
        if (!await passwordMatches(password, readPasswordVerifier())) {
            throw new HttpsError("permission-denied", "That password didn’t match. Please try again.");
        }
        const user = await auth.getUser(request.auth.uid);
        if (user.disabled) throw new HttpsError("permission-denied", "This session is unavailable.");
        await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
        // Keep the same UID and refresh token, including existing notification ownership.
        // The client must refresh its ID token before accessing administrator data.
        return { authenticated: true };
    };
}

async function authorizedPushSubscriptions(auth, documents) {
    const candidates = documents.filter((document) => {
        const { createdBy, deviceId } = document.data();
        return typeof createdBy === "string" && createdBy.length > 0
            && typeof deviceId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(deviceId)
            && document.id === `${createdBy}_${deviceId}`;
    });
    const owners = [...new Set(candidates.map((document) => document.data().createdBy))];
    const authorized = new Set();
    // Admin SDK sends bypass Firestore rules, so check old subscriptions too.
    for (let offset = 0; offset < owners.length; offset += 100) {
        const { users } = await auth.getUsers(owners.slice(offset, offset + 100).map((uid) => ({ uid })));
        users.forEach((user) => {
            if (!user.disabled && user.customClaims?.admin === true) authorized.add(user.uid);
        });
    }
    return candidates.filter((document) => authorized.has(document.data().createdBy));
}

module.exports = {
    authorizedPushSubscriptions,
    createAdminLoginHandler,
    loginAttemptBuckets,
    passwordMatches,
    requireAdmin,
    reserveLoginAttempt
};
