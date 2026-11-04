import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { setImmediate as settleEvents } from "node:timers/promises";
import { createAdminSessionAuth, isTransientAdminSessionError } from "../admin/session-auth.mjs";

function harness({ currentUser = null, restoredUser = currentUser, login, tokenError } = {}) {
    const calls = [];
    const persistence = {};
    const auth = {
        currentUser,
        async authStateReady() {
            calls.push("ready");
            auth.currentUser = restoredUser;
        }
    };
    function user(uid, claims = {}) {
        return {
            uid,
            claims,
            async getIdTokenResult(forceRefresh) {
                calls.push(["token", uid, forceRefresh]);
                if (tokenError) throw tokenError;
                return { claims: this.claims };
            }
        };
    }
    const session = createAdminSessionAuth({
        auth,
        persistence,
        async setPersistence(receivedAuth, receivedPersistence) {
            assert.equal(receivedAuth, auth);
            assert.equal(receivedPersistence, persistence);
            calls.push("persistence");
        },
        async signInAnonymously(receivedAuth) {
            assert.equal(receivedAuth, auth);
            calls.push("anonymous");
            auth.currentUser = user("new-anonymous");
            return { user: auth.currentUser };
        },
        async adminLogin(payload) {
            calls.push(["login", payload]);
            if (login) return login(payload, auth);
            auth.currentUser.claims = { admin: true };
            return { authenticated: true };
        }
    });
    return { auth, calls, session, user };
}

test("restores a persisted admin after auth initialization without replacing their identity", async () => {
    const setup = harness();
    const admin = setup.user("persisted-admin", { admin: true });
    setup.auth.authStateReady = async () => {
        setup.calls.push("ready");
        setup.auth.currentUser = admin;
    };
    assert.equal(await setup.session.restore({ remembered: true }), true);
    assert.equal(setup.auth.currentUser, admin);
    assert.deepEqual(setup.calls, ["ready", "persistence", ["token", "persisted-admin", false]]);
});

test("a forged remembered flag cannot promote an anonymous account", async () => {
    const setup = harness();
    const visitor = setup.user("visitor", {});
    setup.auth.authStateReady = async () => {
        setup.calls.push("ready");
        setup.auth.currentUser = visitor;
    };
    assert.equal(await setup.session.restore({ remembered: true }), false);
    assert.equal(setup.auth.currentUser, visitor);
    assert.deepEqual(setup.calls, ["ready", "persistence", ["token", "visitor", false], ["token", "visitor", true]]);
    assert.deepEqual(visitor.claims, {});
});

test("remembered access without a persisted user does not create or promote an account", async () => {
    const setup = harness();
    assert.equal(await setup.session.restore({ remembered: true }), false);
    assert.equal(setup.auth.currentUser, null);
    assert.deepEqual(setup.calls, ["ready", "persistence"]);
});

test("the explicit lock flag still shows login without authorizing a saved account", async () => {
    const setup = harness();
    assert.equal(await setup.session.restore({ remembered: false }), false);
    assert.deepEqual(setup.calls, []);
});

test("unlock sends the exact password only to the callable and verifies a fresh admin claim", async () => {
    const setup = harness();
    const existing = setup.user("existing-device", {});
    setup.auth.authStateReady = async () => {
        setup.calls.push("ready");
        setup.auth.currentUser = existing;
    };
    const password = " example-test-password ";
    assert.equal(await setup.session.unlock(password), existing);
    assert.equal(setup.auth.currentUser, existing);
    assert.deepEqual(setup.calls, [
        "ready", "persistence", ["login", { password }], ["token", "existing-device", true]
    ]);
});

test("unlock waits for asynchronous persisted-auth hydration before considering anonymous sign-in", async () => {
    const setup = harness();
    const existing = setup.user("delayed-device", {});
    let releaseAuth;
    const hydrated = new Promise((resolve) => { releaseAuth = resolve; });
    setup.auth.authStateReady = async () => {
        setup.calls.push("ready");
        await hydrated;
        setup.auth.currentUser = existing;
    };
    const unlocking = setup.session.unlock("test-password");
    await Promise.resolve();
    assert.deepEqual(setup.calls, ["ready"]);
    assert.equal(setup.auth.currentUser, null);
    releaseAuth();
    assert.equal(await unlocking, existing);
    assert.equal(setup.auth.currentUser, existing);
    assert.equal(setup.calls.includes("anonymous"), false);
});

test("unlock creates an anonymous identity only after restored auth is known to be absent", async () => {
    const setup = harness();
    const unlocked = await setup.session.unlock("test-password");
    assert.equal(unlocked.uid, "new-anonymous");
    assert.equal(setup.auth.currentUser, unlocked);
    assert.deepEqual(setup.calls, [
        "ready", "persistence", "anonymous", ["login", { password: "test-password" }],
        ["token", "new-anonymous", true]
    ]);
});

test("a successful callable response alone does not authorize the workspace", async () => {
    const setup = harness({ login: async () => ({ authenticated: true }) });
    await assert.rejects(setup.session.unlock("test-password"), { code: "auth/admin-required" });
    assert.equal(setup.auth.currentUser.uid, "new-anonymous");
    assert.deepEqual(setup.auth.currentUser.claims, {});
});

test("claim values must be boolean true", async () => {
    const setup = harness({
        login: async (_payload, auth) => {
            auth.currentUser.claims = { admin: "true" };
            return { authenticated: true };
        }
    });
    await assert.rejects(setup.session.unlock("test-password"), { code: "auth/admin-required" });
});

test("wrong passwords and transient callable failures preserve the current user", async () => {
    for (const code of ["functions/permission-denied", "functions/unavailable"]) {
        const failure = Object.assign(new Error("request failed"), { code });
        const setup = harness({ login: async () => { throw failure; } });
        const existing = setup.user("existing-device", {});
        setup.auth.authStateReady = async () => { setup.auth.currentUser = existing; };
        await assert.rejects(setup.session.unlock("test-password"), (error) => error === failure);
        assert.equal(setup.auth.currentUser, existing);
        assert.equal(setup.calls.some((call) => call === "anonymous"), false);
        assert.equal(setup.calls.some((call) => Array.isArray(call) && call[0] === "token"), false);
    }
});

test("transient token refresh failures neither sign out nor replace a remembered user", async () => {
    const failure = Object.assign(new Error("offline"), { code: "auth/network-request-failed" });
    const setup = harness({ tokenError: failure });
    const existing = setup.user("existing-admin", { admin: true });
    setup.auth.authStateReady = async () => { setup.auth.currentUser = existing; };
    await assert.rejects(setup.session.restore({ remembered: true }), (error) => error === failure);
    assert.equal(setup.auth.currentUser, existing);
    assert.deepEqual(setup.calls, ["persistence", ["token", "existing-admin", false]]);
});

test("a valid cached admin token restores offline without a forced refresh", async () => {
    const setup = harness();
    const existing = setup.user("offline-admin", { admin: true });
    existing.getIdTokenResult = async (forceRefresh) => {
        setup.calls.push(["token", existing.uid, forceRefresh]);
        if (forceRefresh) throw Object.assign(new Error("offline"), { code: "auth/network-request-failed" });
        return { claims: { admin: true } };
    };
    setup.auth.authStateReady = async () => { setup.auth.currentUser = existing; };
    assert.equal(await setup.session.restore({ remembered: true }), true);
    assert.equal(setup.auth.currentUser, existing);
    assert.deepEqual(setup.calls, ["persistence", ["token", "offline-admin", false]]);
});

test("a claimless cached token refreshes once to pick up a verified admin migration", async () => {
    const setup = harness();
    const existing = setup.user("migrated-admin", {});
    existing.getIdTokenResult = async (forceRefresh) => {
        setup.calls.push(["token", existing.uid, forceRefresh]);
        return { claims: forceRefresh ? { admin: true } : {} };
    };
    setup.auth.authStateReady = async () => { setup.auth.currentUser = existing; };
    assert.equal(await setup.session.restore({ remembered: true }), true);
    assert.equal(setup.auth.currentUser, existing);
    assert.deepEqual(setup.calls, [
        "persistence", ["token", "migrated-admin", false], ["token", "migrated-admin", true]
    ]);
});

test("an account changed during login cannot open a workspace under another identity", async () => {
    const setup = harness({
        login: async (_payload, auth) => {
            auth.currentUser = { uid: "different-device" };
            return { authenticated: true };
        }
    });
    await assert.rejects(setup.session.unlock("test-password"), { code: "auth/session-changed" });
});

test("an account changed during token refresh cannot restore the workspace", async () => {
    const setup = harness();
    const existing = setup.user("existing-device", { admin: true });
    existing.getIdTokenResult = async () => {
        setup.auth.currentUser = null;
        return { claims: { admin: true } };
    };
    setup.auth.authStateReady = async () => { setup.auth.currentUser = existing; };
    await assert.rejects(setup.session.restore({ remembered: true }), { code: "auth/session-changed" });
    assert.equal(setup.auth.currentUser, null);
});

const adminPage = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");
const bootstrapSource = adminPage.slice(
    adminPage.indexOf("        let adminRestorePending = false;"),
    adminPage.indexOf("        void bootstrapAdmin();", adminPage.indexOf('window.addEventListener("online", () => {', adminPage.indexOf("        let adminRestorePending = false;")))
);

function bootstrapHarness({ online = false, restore }) {
    const screens = [];
    const listeners = new Map();
    const timers = new Map();
    let timerId = 0;
    const navigator = { onLine: online };
    const bootstrap = runInNewContext(`${bootstrapSource}\n({ bootstrapAdmin });`, {
        LOCAL_PREVIEW: false,
        adminSession: { restore },
        hasRememberedUnlock: () => true,
        isTransientAdminSessionError,
        navigator,
        showWorkspace: () => screens.push("workspace"),
        showLogin: () => screens.push("login"),
        console: { error() {} },
        window: {
            addEventListener: (name, handler) => listeners.set(name, handler),
            setTimeout: (handler, delay) => {
                timers.set(++timerId, { handler, delay });
                return timerId;
            },
            clearTimeout: (id) => timers.delete(id)
        }
    });
    return { ...bootstrap, navigator, screens, listeners, timers };
}

test("bootstrap keeps the opening screen through an offline token failure and restores automatically online", async () => {
    let attempts = 0;
    const setup = bootstrapHarness({ restore: async () => {
        if (++attempts === 1) throw Object.assign(new Error("offline"), { code: "auth/network-request-failed" });
        return true;
    } });
    await setup.bootstrapAdmin();
    assert.deepEqual(setup.screens, []);
    assert.equal(setup.timers.size, 0);
    setup.navigator.onLine = true;
    setup.listeners.get("online")();
    await settleEvents();
    assert.deepEqual(setup.screens, ["workspace"]);
    assert.equal(attempts, 2);
});

test("bootstrap retries transient online failures with backoff without requesting a password", async () => {
    let attempts = 0;
    const setup = bootstrapHarness({ online: true, restore: async () => {
        if (++attempts < 3) throw Object.assign(new Error("unavailable"), { code: "auth/internal-error" });
        return true;
    } });
    await setup.bootstrapAdmin();
    let timer = [...setup.timers.values()][0];
    assert.equal(timer.delay, 1000);
    timer.handler();
    await settleEvents();
    timer = [...setup.timers.values()][0];
    assert.equal(timer.delay, 2000);
    assert.deepEqual(setup.screens, []);
    timer.handler();
    await settleEvents();
    assert.deepEqual(setup.screens, ["workspace"]);
    assert.equal(setup.timers.size, 0);
});

test("bootstrap does not keep retrying a definite non-admin or revoked session", async () => {
    for (const restore of [
        async () => false,
        async () => { throw Object.assign(new Error("revoked"), { code: "auth/user-token-expired" }); }
    ]) {
        const setup = bootstrapHarness({ online: true, restore });
        await setup.bootstrapAdmin();
        assert.deepEqual(setup.screens, ["login"]);
        assert.equal(setup.timers.size, 0);
        setup.listeners.get("online")();
        await settleEvents();
        assert.deepEqual(setup.screens, ["login"]);
    }
});
