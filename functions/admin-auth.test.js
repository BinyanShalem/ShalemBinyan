"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scryptSync } = require("node:crypto");
const {
    authorizedPushSubscriptions, createAdminLoginHandler, loginAttemptBuckets, passwordMatches, requireAdmin, reserveLoginAttempt
} = require("./admin-auth");

const password = "test-only shared password";
const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
const verifier = JSON.stringify({
    algorithm: "scrypt-v1", salt: salt.toString("hex"), hash: scryptSync(password, salt, 32).toString("hex")
});

function fixture(overrides = {}) {
    const calls = [];
    const auth = {
        async getUser(uid) { calls.push(["read", uid]); return { uid, customClaims: { existing: "kept" } }; },
        async setCustomUserClaims(uid, claims) { calls.push(["grant", uid, claims]); }
    };
    const handler = createAdminLoginHandler({
        auth,
        readPasswordVerifier: () => verifier,
        reserveAttempt: async (uid, ip) => { calls.push(["attempt", uid, ip]); },
        ...overrides
    });
    return { handler, calls };
}

function request(value = password) {
    return { auth: { uid: "existing-device-uid", token: {} }, data: { password: value }, rawRequest: { ip: "192.0.2.1" } };
}

test("server password comparison preserves exact password characters", async () => {
    assert.equal(await passwordMatches(password, verifier), true);
    assert.equal(await passwordMatches(password + " ", verifier), false);
    assert.equal(await passwordMatches(password.toUpperCase(), verifier), false);
});

test("login grants only the caller's existing UID and preserves unrelated claims", async () => {
    const { handler, calls } = fixture();
    const payload = request();
    payload.data.uid = "different-user";
    assert.deepEqual(await handler(payload), { authenticated: true });
    assert.deepEqual(calls, [
        ["attempt", "existing-device-uid", "192.0.2.1"],
        ["read", "existing-device-uid"],
        ["grant", "existing-device-uid", { existing: "kept", admin: true }]
    ]);
});

test("missing auth, browser unlock flags and malformed passwords cannot grant access", async () => {
    const { handler, calls } = fixture();
    await assert.rejects(handler({ data: { password } }), { code: "unauthenticated" });
    for (const value of [undefined, null, {}, [], true, "", "x".repeat(1025)]) {
        const input = request(value);
        input.data.password = value;
        input.data.unlocked = true;
        input.data.admin = true;
        await assert.rejects(handler(input), { code: "permission-denied" });
    }
    assert.deepEqual(calls, []);
});

test("wrong password consumes an attempt but never reads or grants an account", async () => {
    const { handler, calls } = fixture();
    await assert.rejects(handler(request("wrong password")), { code: "permission-denied" });
    assert.deepEqual(calls, [["attempt", "existing-device-uid", "192.0.2.1"]]);
});

test("disabled users and quota failures cannot gain admin permission", async () => {
    let grants = 0;
    const disabled = fixture({ auth: {
        async getUser(uid) { return { uid, disabled: true }; },
        async setCustomUserClaims() { grants += 1; }
    } });
    await assert.rejects(disabled.handler(request()), { code: "permission-denied" });
    const blocked = fixture({ reserveAttempt: async () => { throw new Error("quota"); } });
    await assert.rejects(blocked.handler(request()), /quota/);
    assert.equal(grants, 0);
    assert.deepEqual(blocked.calls, []);
});

test("missing or malformed secret fails closed without echoing its value", async () => {
    for (const value of [
        "", "invalid secret", "null", JSON.stringify({ algorithm: "unknown", salt: "a", hash: "b" }),
        JSON.stringify({ algorithm: "scrypt-v1", salt: ["0".repeat(32)], hash: "0".repeat(64) }),
        JSON.stringify({ algorithm: "scrypt-v1", salt: "0".repeat(32), hash: ["0".repeat(64)] })
    ]) {
        await assert.rejects(passwordMatches(password, value), (error) => {
            assert.equal(error.code, "failed-precondition");
            assert.equal(error.message, "Admin sign-in is not configured.");
            return true;
        });
    }
});

test("protected callables require exact trusted admin claims", () => {
    assert.throws(() => requireAdmin({}), { code: "unauthenticated" });
    for (const admin of [undefined, false, "true", 1]) {
        assert.throws(() => requireAdmin({ auth: { token: { admin } } }), { code: "permission-denied" });
    }
    assert.doesNotThrow(() => requireAdmin({ auth: { token: { admin: true } } }));
});

test("attempt buckets retain a shared network limit across replacement anonymous accounts", () => {
    const first = loginAttemptBuckets("uid-one", "192.0.2.1", 1000);
    const second = loginAttemptBuckets("uid-two", "192.0.2.1", 1000);
    assert.notEqual(first[0].id, second[0].id);
    assert.equal(first[1].id, second[1].id);
    assert.equal(first[2].id, loginAttemptBuckets("fresh-uid", "different-forwarded-address", 1000)[2].id);
    assert.notEqual(first[1].id, loginAttemptBuckets("uid-one", "192.0.2.1", 15 * 60 * 1000)[1].id);
    assert.ok(first.every(({ id }) => !id.includes("192.0.2.1") && !id.includes("uid-one")));
});

test("transactional attempts enforce user and network limits and expire by time window", async () => {
    const rows = new Map();
    let chain = Promise.resolve();
    const db = {
        collection: () => ({ doc: (id) => ({ id }) }),
        runTransaction(callback) {
            const result = chain.then(() => callback({
                get: async (ref) => ({ data: () => rows.get(ref.id) }),
                set: (ref, value) => rows.set(ref.id, value)
            }));
            chain = result.catch(() => {});
            return result;
        }
    };
    const burst = await Promise.allSettled(Array.from({ length: 35 }, () => reserveLoginAttempt(db, "uid", "192.0.2.1", 1000)));
    assert.equal(burst.filter(({ status }) => status === "fulfilled").length, 30);
    assert.ok(burst.filter(({ status }) => status === "rejected").every(({ reason }) => reason.code === "resource-exhausted"));
    for (let i = 0; i < 120; i += 1) await reserveLoginAttempt(db, `fresh-${i}`, "192.0.2.1", 1000);
    await assert.rejects(reserveLoginAttempt(db, "another-new-uid", "192.0.2.1", 1000), { code: "resource-exhausted" });
    await reserveLoginAttempt(db, "uid", "192.0.2.1", 15 * 60 * 1000);
    const globalBucket = loginAttemptBuckets("uid", "192.0.2.1", 1000)[2];
    rows.set(globalBucket.id, { count: globalBucket.limit, expiresAt: globalBucket.expiresAt });
    await assert.rejects(reserveLoginAttempt(db, "rotated-uid", "spoofed-address", 1000), { code: "resource-exhausted" });
});

test("existing push subscriptions only deliver for an active administrator owner", async () => {
    const subscription = (uid, deviceId = "device-123", id = `${uid}_${deviceId}`) => ({
        id, data: () => ({ createdBy: uid, deviceId, endpoint: "unchanged", notifyNewIntakes: false })
    });
    const adminDevice = subscription("admin");
    const secondDevice = subscription("admin", "device-456");
    const documents = [adminDevice, secondDevice, subscription("visitor"), subscription("disabled"),
        subscription("deleted"), subscription("admin", "device-789", "visitor_device-789")];
    const received = [];
    const result = await authorizedPushSubscriptions({
        async getUsers(identifiers) {
            received.push(identifiers);
            return { users: [
                { uid: "admin", customClaims: { admin: true } },
                { uid: "visitor", customClaims: {} },
                { uid: "disabled", customClaims: { admin: true }, disabled: true }
            ] };
        }
    }, documents);
    assert.deepEqual(result, [adminDevice, secondDevice]);
    assert.equal(result[0], adminDevice);
    assert.deepEqual(received, [[{ uid: "admin" }, { uid: "visitor" }, { uid: "disabled" }, { uid: "deleted" }]]);
});

test("notification authorization fails closed when account lookup is unavailable", async () => {
    let lookedUp = false;
    const auth = { async getUsers() { lookedUp = true; throw new Error("lookup unavailable"); } };
    assert.deepEqual(await authorizedPushSubscriptions(auth, []), []);
    assert.equal(lookedUp, false);
    await assert.rejects(authorizedPushSubscriptions(auth, [{
        id: "admin_device-123", data: () => ({ createdBy: "admin", deviceId: "device-123" })
    }]), /lookup unavailable/);
});
