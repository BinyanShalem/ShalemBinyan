import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";

const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;

describe("Meeting photo Storage authorization", {
    skip: (!storageHost || !firestoreHost) && "Requires the local Cloud Storage and Firestore emulators"
}, () => {
    let env;
    let assertFails;
    let assertSucceeds;
    let adminStorage;
    let visitorStorage;

    const meetingId = "meeting-1";
    const photoId = "photo-1";
    const displayPath = `admin-meeting-images/${meetingId}/${photoId}/display.jpg`;

    function metadata(variant = "display", overrides = {}) {
        return {
            contentType: "image/jpeg",
            cacheControl: "private, max-age=0, no-store",
            customMetadata: {
                meetingId,
                photoId,
                createdBy: "admin-device",
                variant
            },
            ...overrides
        };
    }

    before(async () => {
        const dependencyRequire = process.env.FIRESTORE_TEST_DEPS
            ? createRequire(resolve(process.env.FIRESTORE_TEST_DEPS, "package.json"))
            : createRequire(import.meta.url);
        const rulesTesting = dependencyRequire("@firebase/rules-unit-testing");
        ({ assertFails, assertSucceeds } = rulesTesting);
        const [host, port] = storageHost.split(":");
        const [firestoreHostName, firestorePort] = firestoreHost.split(":");
        env = await rulesTesting.initializeTestEnvironment({
            projectId: "demo-binyan-auth",
            firestore: {
                host: firestoreHostName,
                port: Number(firestorePort),
                rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8")
            },
            storage: {
                host,
                port: Number(port),
                rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8")
            }
        });
        adminStorage = env.authenticatedContext("admin-device", { admin: true }).storage();
        visitorStorage = env.authenticatedContext("visitor-device", { admin: false }).storage();
    });

    beforeEach(async () => {
        await env.clearStorage();
        await env.clearFirestore();
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().doc(`admin_encounters/${meetingId}`).set({ synthetic: true });
        });
    });

    after(async () => {
        await env?.cleanup();
    });

    test("only admins can create, read, and delete immutable meeting JPEGs", async () => {
        const adminRef = adminStorage.ref(displayPath);
        const visitorRef = visitorStorage.ref(displayPath);
        await assertFails(visitorRef.putString("not-secret-test-bytes", "raw", metadata()));
        await assertSucceeds(adminRef.putString("synthetic-image-bytes", "raw", metadata()));
        await assertSucceeds(adminRef.getMetadata());
        await assertFails(visitorRef.getMetadata());
        await assertFails(adminRef.putString("replacement", "raw", metadata()));
        await assertFails(visitorRef.delete());
        await assertSucceeds(adminRef.delete());
    });

    test("uploads must use the exact meeting path, JPEG type, size, and custom metadata", async () => {
        await assertFails(adminStorage.ref(`other/${photoId}/display.jpg`)
            .putString("synthetic", "raw", metadata()));
        await assertFails(adminStorage.ref(`admin-meeting-images/missing-meeting/${photoId}/display.jpg`)
            .putString("synthetic", "raw", metadata("display", {
                customMetadata: { ...metadata().customMetadata, meetingId: "missing-meeting" }
            })));
        await assertFails(adminStorage.ref(displayPath)
            .putString("synthetic", "raw", metadata("display", { contentType: "image/png" })));
        await assertFails(adminStorage.ref(displayPath)
            .putString("synthetic", "raw", metadata("display", {
                customMetadata: { ...metadata().customMetadata, meetingId: "different-meeting" }
            })));
        await assertFails(adminStorage.ref(displayPath)
            .put(new Uint8Array(8 * 1024 * 1024 + 1), metadata()));
        await assertSucceeds(adminStorage.ref(`admin-meeting-images/${meetingId}/${photoId}/thumb.jpg`)
            .putString("synthetic-thumbnail", "raw", metadata("thumbnail")));
    });
});
