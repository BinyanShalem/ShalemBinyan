import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { createAdminSessionAuth } from "../admin/session-auth.mjs";

// Requires isolated Auth, Firestore, and Functions emulators for demo-binyan-auth.
// The Functions emulator must export ONLY adminLogin using createAdminLoginHandler,
// reserveLoginAttempt, and a scrypt verifier for the synthetic password below.
// Do not load functions/index.js: its other triggers are unrelated to this test.
// FIRESTORE_TEST_DEPS may point to a temporary installation of firebase and
// @firebase/rules-unit-testing. ADMIN_LOGIN_EMULATOR_HOST is host:port for Functions.
const emulatorConfigured = process.env.FIREBASE_AUTH_EMULATOR_HOST
    && process.env.FIRESTORE_EMULATOR_HOST
    && process.env.ADMIN_LOGIN_EMULATOR_HOST;

describe("real admin login, token refresh, and Firestore authorization", {
    skip: !emulatorConfigured && "Requires isolated Auth, Functions, and Firestore emulators"
}, () => {
    const projectId = "demo-binyan-auth";
    const password = "integration-only-password";
    const clients = [];
    let rulesEnv;
    let firebaseApp;
    let firebaseAuth;
    let firebaseFirestore;
    let firebaseFunctions;
    let adminApp;
    let adminAuth;
    let adminDb;
    let deleteAdminApp;
    let clientSequence = 0;

    function localEndpoint(value) {
        const url = new URL(`http://${value}`);
        assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Only loopback emulators are allowed");
        assert.ok(url.port, "An explicit emulator port is required");
        return { host: url.hostname, port: Number(url.port), url: url.origin };
    }

    before(async () => {
        // Fail closed before initializing any SDK if the environment is misconfigured.
        localEndpoint(process.env.FIREBASE_AUTH_EMULATOR_HOST);
        const firestoreEndpoint = localEndpoint(process.env.FIRESTORE_EMULATOR_HOST);
        localEndpoint(process.env.ADMIN_LOGIN_EMULATOR_HOST);
        process.env.METADATA_SERVER_DETECTION = "none";
        const dependencyRequire = process.env.FIRESTORE_TEST_DEPS
            ? createRequire(resolve(process.env.FIRESTORE_TEST_DEPS, "package.json"))
            : createRequire(import.meta.url);
        const backendRequire = createRequire(new URL("../functions/package.json", import.meta.url));
        firebaseApp = dependencyRequire("firebase/app");
        firebaseAuth = dependencyRequire("firebase/auth");
        firebaseFirestore = dependencyRequire("firebase/firestore");
        firebaseFunctions = dependencyRequire("firebase/functions");
        const { initializeTestEnvironment } = dependencyRequire("@firebase/rules-unit-testing");
        const { initializeApp, deleteApp } = backendRequire("firebase-admin/app");
        deleteAdminApp = deleteApp;
        adminApp = initializeApp({ projectId }, "admin-login-integration");
        adminAuth = backendRequire("firebase-admin/auth").getAuth(adminApp);
        adminDb = backendRequire("firebase-admin/firestore").getFirestore(adminApp);
        rulesEnv = await initializeTestEnvironment({
            projectId,
            firestore: {
                ...firestoreEndpoint,
                rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8")
            }
        });
    });

    beforeEach(async () => {
        await rulesEnv.clearFirestore();
    });

    afterEach(async () => {
        for (const client of clients.splice(0)) {
            await firebaseFirestore.terminate(client.db);
            await firebaseApp.deleteApp(client.app);
        }
    });

    after(async () => {
        await rulesEnv?.cleanup();
        if (adminDb) await adminDb.terminate();
        if (adminApp) await deleteAdminApp(adminApp);
    });

    async function newClient({ anonymous = true } = {}) {
        const app = firebaseApp.initializeApp({
            projectId,
            apiKey: "demo-emulator-key",
            authDomain: "localhost"
        }, `integration-client-${++clientSequence}`);
        const auth = firebaseAuth.initializeAuth(app, {
            persistence: firebaseAuth.inMemoryPersistence
        });
        const authEndpoint = localEndpoint(process.env.FIREBASE_AUTH_EMULATOR_HOST);
        firebaseAuth.connectAuthEmulator(auth, authEndpoint.url, { disableWarnings: true });
        const db = firebaseFirestore.getFirestore(app);
        const dbEndpoint = localEndpoint(process.env.FIRESTORE_EMULATOR_HOST);
        firebaseFirestore.connectFirestoreEmulator(db, dbEndpoint.host, dbEndpoint.port);
        const functions = firebaseFunctions.getFunctions(app, "us-central1");
        const callableEndpoint = localEndpoint(process.env.ADMIN_LOGIN_EMULATOR_HOST);
        firebaseFunctions.connectFunctionsEmulator(functions, callableEndpoint.host, callableEndpoint.port);
        const login = firebaseFunctions.httpsCallable(functions, "adminLogin");
        const client = { app, auth, db, login };
        clients.push(client);
        if (anonymous) await firebaseAuth.signInAnonymously(auth);
        return client;
    }

    function sessionFor(client, onLogin = () => {}) {
        return createAdminSessionAuth({
            auth: client.auth,
            persistence: firebaseAuth.inMemoryPersistence,
            setPersistence: firebaseAuth.setPersistence,
            signInAnonymously: firebaseAuth.signInAnonymously,
            adminLogin: async (data) => {
                onLogin();
                return (await client.login(data)).data;
            }
        });
    }

    function directoryEntry(uid) {
        return {
            name: "Synthetic integration contact", type: "Person", phone: "", email: "", url: "",
            notes: "Synthetic test data", createdBy: uid,
            createdAt: firebaseFirestore.serverTimestamp(), updatedAt: firebaseFirestore.serverTimestamp()
        };
    }

    test("the callable denies unsigned and wrong-password requests without granting database access", async () => {
        const signedOut = await newClient({ anonymous: false });
        await assert.rejects(signedOut.login({ password }), { code: "functions/unauthenticated" });
        const visitor = await newClient();
        const uid = visitor.auth.currentUser.uid;
        await adminDb.doc("admin_directory/existing-record").set({ private: "synthetic" });
        const privateRef = firebaseFirestore.doc(visitor.db, "admin_directory/existing-record");
        await assert.rejects(firebaseFirestore.getDocFromServer(privateRef), { code: "permission-denied" });
        await assert.rejects(visitor.login({ password: "incorrect", admin: true }), {
            code: "functions/permission-denied"
        });
        assert.equal((await visitor.auth.currentUser.getIdTokenResult(true)).claims.admin, undefined);
        assert.equal((await adminAuth.getUser(uid)).customClaims?.admin, undefined);
        assert.equal(visitor.auth.currentUser.uid, uid);
        await assert.rejects(firebaseFirestore.getDocFromServer(privateRef), { code: "permission-denied" });
        await assert.rejects(firebaseFirestore.getDocs(firebaseFirestore.collection(visitor.db, "admin_login_attempts")), {
            code: "permission-denied"
        });
        const attempts = await adminDb.collection("admin_login_attempts").get();
        for (const kind of ["user", "network", "project"]) {
            assert.ok(attempts.docs.some((item) => item.id.startsWith(`${kind}_`)),
                `The actual callable records the ${kind} attempt bucket`);
        }
        for (const attempt of attempts.docs) assert.equal(attempt.data().count, 1);
    });

    test("password unlock upgrades the same existing session and refreshes real Firebase authorization", async () => {
        const client = await newClient();
        const user = client.auth.currentUser;
        const uid = user.uid;
        await adminAuth.setCustomUserClaims(uid, { existingPermission: "retained" });
        assert.equal((await user.getIdTokenResult(true)).claims.admin, undefined);
        const ref = firebaseFirestore.doc(client.db, "admin_directory/created-after-login");
        await assert.rejects(firebaseFirestore.setDoc(ref, directoryEntry(uid)), { code: "permission-denied" });

        let loginCalls = 0;
        const session = sessionFor(client, () => { loginCalls += 1; });
        const unlockedUser = await session.unlock(password);
        assert.equal(unlockedUser.uid, uid);
        assert.equal(client.auth.currentUser, user, "No sign-out or replacement Firebase user occurs");
        assert.equal(client.auth.currentUser.isAnonymous, true, "The original identity is preserved");
        const token = await user.getIdTokenResult();
        assert.equal(token.claims.admin, true);
        assert.equal(token.claims.existingPermission, "retained");
        const verified = await adminAuth.verifyIdToken(token.token);
        assert.equal(verified.uid, uid);
        assert.equal(verified.admin, true);

        await firebaseFirestore.setDoc(ref, directoryEntry(uid));
        assert.equal((await firebaseFirestore.getDocFromServer(ref)).data().createdBy, uid);
        await firebaseFirestore.updateDoc(ref, {
            notes: "Updated after server authorization", updatedAt: firebaseFirestore.serverTimestamp()
        });
        assert.equal((await firebaseFirestore.getDocFromServer(ref)).data().notes, "Updated after server authorization");
        await firebaseFirestore.deleteDoc(ref);
        assert.equal((await firebaseFirestore.getDocFromServer(ref)).exists(), false);

        // Reopening with a remembered, already-authorized identity needs no password call.
        const reopenedSession = sessionFor(client, () => { loginCalls += 1; });
        assert.equal(await reopenedSession.restore({ remembered: true }), true);
        assert.equal(loginCalls, 1);
    });

    test("the same shared password works on an independent new device", async () => {
        const first = await newClient();
        const second = await newClient({ anonymous: false });
        const firstUid = first.auth.currentUser.uid;
        await sessionFor(first).unlock(password);
        assert.equal(second.auth.currentUser, null);
        const secondUser = await sessionFor(second).unlock(password);
        assert.notEqual(secondUser.uid, firstUid);
        assert.equal((await secondUser.getIdTokenResult()).claims.admin, true);

        const path = "admin_directory/shared-between-devices";
        await firebaseFirestore.setDoc(firebaseFirestore.doc(first.db, path), directoryEntry(firstUid));
        const secondRef = firebaseFirestore.doc(second.db, path);
        assert.equal((await firebaseFirestore.getDocFromServer(secondRef)).data().createdBy, firstUid);
        await firebaseFirestore.updateDoc(secondRef, {
            notes: "Changed from another authorized device", updatedAt: firebaseFirestore.serverTimestamp()
        });
        await firebaseFirestore.deleteDoc(secondRef);
    });

    test("an independently verified existing session restores silently and retains notification ownership", async () => {
        const client = await newClient();
        const uid = client.auth.currentUser.uid;
        const path = `admin_push_subscriptions/${uid}_test-device-123`;
        const { Timestamp } = createRequire(new URL("../functions/package.json", import.meta.url))("firebase-admin/firestore");
        await adminDb.doc(path).set({
            endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", expirationTime: null,
            p256dh: "synthetic-public-key", auth: "synthetic-auth", deviceId: "test-device-123",
            timeZone: "America/New_York", enabled: true, notifyScheduledEncounters: true,
            notifyNewIntakes: true, createdBy: uid, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
        });
        let passwordCalls = 0;
        const session = sessionFor(client, () => { passwordCalls += 1; });
        assert.equal(await session.restore({ remembered: true }), false,
            "A remembered browser flag does not grant access");
        // Simulate the operator granting only an independently verified existing UID.
        await adminAuth.setCustomUserClaims(uid, { admin: true });
        assert.equal(await session.restore({ remembered: true }), true);
        assert.equal(client.auth.currentUser.uid, uid);
        assert.equal(passwordCalls, 0);
        const ref = firebaseFirestore.doc(client.db, path);
        assert.equal((await firebaseFirestore.getDocFromServer(ref)).data().createdBy, uid);
        await firebaseFirestore.updateDoc(ref, {
            notifyNewIntakes: false, updatedAt: firebaseFirestore.serverTimestamp()
        });
        assert.equal((await firebaseFirestore.getDocFromServer(ref)).data().notifyNewIntakes, false);
    });
});
