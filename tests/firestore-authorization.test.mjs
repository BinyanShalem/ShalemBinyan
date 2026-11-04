import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";

// Run against a local Firestore emulator, never the live database. Install
// @firebase/rules-unit-testing and firebase in a temporary directory, then set
// FIRESTORE_TEST_DEPS to that directory if they are not installed locally.
// firebase emulators:exec --only firestore --project demo-binyan-auth \
//   'node --test tests/firestore-authorization.test.mjs'
describe("Firestore administrator authorization", {
    skip: !process.env.FIRESTORE_EMULATOR_HOST && "Requires the local Firestore emulator"
}, () => {
    let env;
    let assertFails;
    let assertSucceeds;
    let collection;
    let deleteDoc;
    let doc;
    let getDoc;
    let getDocs;
    let serverTimestamp;
    let setDoc;
    let Timestamp;
    let updateDoc;
    let admin;
    let visitor;
    let signedOut;

    const adminUid = "existing-admin-device";
    const visitorUid = "public-visitor";
    const submissionCollection = "artifacts/binyan-shalem/public/data/submissions";
    const privateCollections = [
        submissionCollection,
        "admin_encounters",
        "admin_meeting_photos",
        "admin_reminder_resolutions",
        "admin_manual_reminders",
        "admin_reminder_snoozes",
        "admin_directory",
        "donation_intents"
    ];

    before(async () => {
        const dependencyRequire = process.env.FIRESTORE_TEST_DEPS
            ? createRequire(resolve(process.env.FIRESTORE_TEST_DEPS, "package.json"))
            : createRequire(import.meta.url);
        const rulesTesting = dependencyRequire("@firebase/rules-unit-testing");
        ({ assertFails, assertSucceeds } = rulesTesting);
        ({ collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc }
            = dependencyRequire("firebase/firestore"));
        const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
        env = await rulesTesting.initializeTestEnvironment({
            projectId: "demo-binyan-auth",
            firestore: {
                host,
                port: Number(port),
                rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8")
            }
        });
        admin = env.authenticatedContext(adminUid, { admin: true }).firestore();
        visitor = env.authenticatedContext(visitorUid, {
            firebase: { sign_in_provider: "anonymous" }
        }).firestore();
        signedOut = env.unauthenticatedContext().firestore();
    });

    beforeEach(async () => {
        await env.clearFirestore();
    });

    after(async () => {
        await env?.cleanup();
    });

    function submission(uid = visitorUid) {
        return {
            h_name: "Test husband", w_name: "Test wife", h_cell: null, h_email: null,
            w_cell: null, w_email: null, h_age: null, w_age: null, address: null,
            years_married: null, issue_presenting: null, family_rabbi: null,
            anyone_else_involved: null, submitter_relationship: null, parents_names: null,
            num_kids: null, donation: "No", timestamp: "2026-10-19T12:00:00.000Z",
            uid, formType: "couple"
        };
    }

    function donation(uid = visitorUid) {
        return {
            name: "Test donor", amount: 180, frequency: "one_time",
            paymentMethod: "credit_card", status: "unconfirmed", adminViewed: false,
            archived: false, createdAt: serverTimestamp(), createdBy: uid
        };
    }

    function resource() {
        return {
            id: "test-resource", type: "video", source: "youtube", title: "Test video",
            speaker: "Test speaker", primaryLabel: "Watch", primaryUrl: "https://www.youtube.com/watch?v=test",
            imageUrl: "https://i.ytimg.com/vi/test/hqdefault.jpg", imageAlt: "Test image",
            embedUrl: "https://www.youtube.com/embed/test", dialIn: "", dialInHref: "",
            extension: "", schemaVersion: 1, published: true, sortOrder: 1,
            createdAt: serverTimestamp(), createdBy: adminUid
        };
    }

    function timestamps() {
        return { createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: adminUid };
    }

    function encounter() {
        return {
            encounterType: "scheduled", names: "Test couple", contact: "Test phone",
            occurredDate: "2026-10-20", occurredTime: "10:00", method: "Phone", notes: "Test note",
            needsFollowUp: true, submissionId: null, rootEncounterId: "test-encounter",
            previousEncounterId: null, archived: false, ...timestamps()
        };
    }

    function reminder() {
        return {
            title: "Test reminder", description: "Test description", dueDate: "2026-10-20",
            dueTime: "10:00", completed: false, ...timestamps()
        };
    }

    function meetingPhoto(photoId = "test-photo", meetingId = "test-encounter", uid = adminUid) {
        return {
            meetingId,
            storagePath: `admin-meeting-images/${meetingId}/${photoId}/display.jpg`,
            thumbnailPath: `admin-meeting-images/${meetingId}/${photoId}/thumb.jpg`,
            originalName: "meeting-photo.jpg",
            contentType: "image/jpeg",
            size: 125000,
            width: 1600,
            height: 1200,
            createdAt: serverTimestamp(),
            createdBy: uid
        };
    }

    function directoryEntry() {
        return {
            name: "Test person", type: "Person", phone: "", email: "", url: "",
            notes: "Test note", ...timestamps()
        };
    }

    function pushSubscription(uid = adminUid) {
        return {
            endpoint: "https://fcm.googleapis.com/fcm/send/test-subscription", expirationTime: null,
            p256dh: "test-public-key", auth: "test-auth", deviceId: "test-device-123",
            timeZone: "America/New_York", enabled: true,
            notifyScheduledEncounters: true, notifyNewIntakes: true,
            ...timestamps(), createdBy: uid
        };
    }

    async function seed(path, data = { confidential: "synthetic test data" }) {
        await env.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), path), data);
        });
    }

    test("public visitors can submit intake forms but cannot read, change, or delete them", async () => {
        const path = `${submissionCollection}/public-intake`;
        await assertSucceeds(setDoc(doc(visitor, path), submission()));
        await assertFails(getDoc(doc(visitor, path)));
        await assertFails(getDocs(collection(visitor, submissionCollection)));
        await assertFails(updateDoc(doc(visitor, path), { other_notes: "changed" }));
        await assertFails(deleteDoc(doc(visitor, path)));
        await assertFails(setDoc(doc(signedOut, `${submissionCollection}/signed-out`), submission()));
        await assertFails(setDoc(doc(visitor, `${submissionCollection}/spoofed`), submission(adminUid)));
        await assertFails(setDoc(doc(visitor, `${submissionCollection}/extra-field`), {
            ...submission(), admin: true
        }));
    });

    test("public donations still work without giving donors access to any donation records", async () => {
        const path = "donation_intents/public-donation";
        await assertSucceeds(setDoc(doc(visitor, path), donation()));
        await assertFails(getDoc(doc(visitor, path)));
        await assertFails(getDocs(collection(visitor, "donation_intents")));
        await assertFails(updateDoc(doc(visitor, path), { adminViewed: true }));
        await assertFails(deleteDoc(doc(visitor, path)));
        await assertFails(setDoc(doc(signedOut, "donation_intents/signed-out"), donation()));
        await assertFails(setDoc(doc(visitor, "donation_intents/spoofed"), donation(adminUid)));
        await assertFails(setDoc(doc(visitor, "donation_intents/pre-archived"), {
            ...donation(), archived: true
        }));
    });

    test("private records require the exact server-issued boolean admin claim", async () => {
        const unprivileged = [
            signedOut,
            visitor,
            env.authenticatedContext("regular-account").firestore(),
            env.authenticatedContext("false-admin", { admin: false }).firestore(),
            env.authenticatedContext("string-admin", { admin: "true" }).firestore()
        ];
        for (const name of privateCollections) {
            const path = `${name}/existing-record`;
            await seed(path);
            await assertSucceeds(getDoc(doc(admin, path)));
            await assertSucceeds(getDocs(collection(admin, name)));
            for (const db of unprivileged) {
                await assertFails(getDoc(doc(db, path)));
                await assertFails(getDocs(collection(db, name)));
                await assertFails(updateDoc(doc(db, path), { confidential: "changed" }));
                await assertFails(deleteDoc(doc(db, path)));
            }
        }
    });

    test("public content remains readable while only administrators can publish or delete", async () => {
        const path = "content/test-resource";
        await assertFails(setDoc(doc(visitor, path), { ...resource(), createdBy: visitorUid }));
        await assertFails(setDoc(doc(signedOut, path), resource()));
        await assertSucceeds(setDoc(doc(admin, path), resource()));
        await assertSucceeds(getDoc(doc(signedOut, path)));
        await assertSucceeds(getDocs(collection(signedOut, "content")));
        await assertSucceeds(getDoc(doc(visitor, path)));
        await assertFails(deleteDoc(doc(visitor, path)));
        // Publishing remains create/delete only; authorization does not change the schema.
        await assertFails(updateDoc(doc(admin, path), { title: "Changed" }));
        await assertSucceeds(deleteDoc(doc(admin, path)));
    });

    test("administrators retain intake creation, unrestricted existing intake edits, and deletion", async () => {
        const path = `${submissionCollection}/admin-intake`;
        await assertSucceeds(setDoc(doc(admin, path), submission(adminUid)));
        await assertSucceeds(updateDoc(doc(admin, path), {
            adminViewed: true, archived: true, adminNotes: "Test administrator note"
        }));
        await assertSucceeds(getDoc(doc(admin, path)));
        await assertSucceeds(deleteDoc(doc(admin, path)));
    });

    test("administrators retain encounters, manual reminders, and directory CRUD across devices", async () => {
        const secondAdmin = env.authenticatedContext("other-admin-device", { admin: true }).firestore();
        const records = [
            ["admin_encounters/test-encounter", encounter(), { notes: "Updated", archived: true }],
            ["admin_manual_reminders/test-reminder", reminder(), { completed: true }],
            ["admin_directory/test-person", directoryEntry(), { notes: "Updated" }]
        ];
        for (const [path, data, changes] of records) {
            await assertFails(setDoc(doc(visitor, path), { ...data, createdBy: visitorUid }));
            await assertSucceeds(setDoc(doc(admin, path), data));
            await assertSucceeds(getDoc(doc(secondAdmin, path)));
            await assertSucceeds(updateDoc(doc(secondAdmin, path), {
                ...changes, updatedAt: serverTimestamp()
            }));
            await assertFails(updateDoc(doc(admin, path), {
                createdBy: "different-creator", updatedAt: serverTimestamp()
            }));
            await assertFails(updateDoc(doc(admin, path), {
                createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp()
            }));
            await assertSucceeds(deleteDoc(doc(secondAdmin, path)));
        }
    });

    test("meeting photos require an existing meeting and exact immutable admin metadata", async () => {
        const encounterPath = "admin_encounters/test-encounter";
        const photoPath = "admin_meeting_photos/test-photo";
        await assertFails(setDoc(doc(admin, photoPath), meetingPhoto()));
        await assertSucceeds(setDoc(doc(admin, encounterPath), encounter()));
        await assertFails(setDoc(doc(visitor, photoPath), meetingPhoto("test-photo", "test-encounter", visitorUid)));
        await assertFails(setDoc(doc(admin, photoPath), {
            ...meetingPhoto(),
            storagePath: "admin-meeting-images/different/path/display.jpg"
        }));
        await assertSucceeds(setDoc(doc(admin, photoPath), meetingPhoto()));
        await assertSucceeds(getDoc(doc(admin, photoPath)));
        await assertFails(getDoc(doc(visitor, photoPath)));
        await assertFails(updateDoc(doc(admin, photoPath), { originalName: "renamed.jpg" }));
        await assertFails(deleteDoc(doc(visitor, photoPath)));
        await assertSucceeds(deleteDoc(doc(admin, photoPath)));
    });

    test("administrators retain resolving and snoozing reminders", async () => {
        const resolution = "admin_reminder_resolutions/test-resolution";
        const resolutionData = () => ({
            targetKey: "encounter:test-encounter", resolvedAt: serverTimestamp(), resolvedBy: adminUid
        });
        await assertFails(setDoc(doc(visitor, resolution), {
            ...resolutionData(), resolvedBy: visitorUid
        }));
        await assertSucceeds(setDoc(doc(admin, resolution), resolutionData()));
        await assertSucceeds(setDoc(doc(admin, resolution), resolutionData()));
        await assertSucceeds(deleteDoc(doc(admin, resolution)));

        const snooze = "admin_reminder_snoozes/test-snooze";
        const snoozeData = () => ({
            targetKey: "encounter:test-encounter", snoozedThrough: "2026-10-20",
            updatedAt: serverTimestamp(), updatedBy: adminUid
        });
        await assertFails(setDoc(doc(visitor, snooze), { ...snoozeData(), updatedBy: visitorUid }));
        await assertSucceeds(setDoc(doc(admin, snooze), snoozeData()));
        await assertSucceeds(updateDoc(doc(admin, snooze), {
            snoozedThrough: "2026-10-21", updatedAt: serverTimestamp()
        }));
        await assertSucceeds(deleteDoc(doc(admin, snooze)));
    });

    test("donation review, archiving, and archived deletion keep their existing behavior", async () => {
        const path = "donation_intents/reviewable-donation";
        await assertSucceeds(setDoc(doc(visitor, path), donation()));
        await assertSucceeds(getDoc(doc(admin, path)));
        await assertSucceeds(updateDoc(doc(admin, path), { adminViewed: true }));
        await assertFails(deleteDoc(doc(admin, path)));
        await assertFails(updateDoc(doc(admin, path), { amount: 999 }));
        await assertSucceeds(updateDoc(doc(admin, path), { archived: true }));
        await assertSucceeds(deleteDoc(doc(admin, path)));
    });

    test("push subscriptions require admin authorization and preserve device ownership", async () => {
        const path = `admin_push_subscriptions/${adminUid}_test-device-123`;
        const visitorPath = `admin_push_subscriptions/${visitorUid}_test-device-123`;
        await assertFails(setDoc(doc(visitor, visitorPath), pushSubscription(visitorUid)));
        await assertSucceeds(setDoc(doc(admin, path), pushSubscription()));
        await assertSucceeds(getDoc(doc(admin, path)));
        await assertSucceeds(updateDoc(doc(admin, path), {
            notifyNewIntakes: false, updatedAt: serverTimestamp()
        }));
        const secondAdmin = env.authenticatedContext("other-admin-device", { admin: true }).firestore();
        await assertFails(getDoc(doc(secondAdmin, path)));
        await assertFails(updateDoc(doc(secondAdmin, path), { enabled: false, updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(doc(secondAdmin, path)));
        await assertSucceeds(deleteDoc(doc(admin, path)));

        // A formerly anonymous subscription does not grant its owner administrator privileges.
        await seed(visitorPath, {
            ...pushSubscription(visitorUid), createdAt: Timestamp.now(), updatedAt: Timestamp.now()
        });
        await assertFails(getDoc(doc(visitor, visitorPath)));
        await assertFails(updateDoc(doc(visitor, visitorPath), { enabled: true, updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(doc(visitor, visitorPath)));
    });

    test("the existing user-owned subtree stays isolated and does not confer admin access", async () => {
        const path = `artifacts/binyan-shalem/users/${visitorUid}/preferences/test`;
        await assertSucceeds(setDoc(doc(visitor, path), { admin: true, unlocked: true }));
        await assertSucceeds(getDoc(doc(visitor, path)));
        await assertFails(getDoc(doc(admin, path)));
        await seed("admin_directory/private-entry");
        await assertFails(getDoc(doc(visitor, "admin_directory/private-entry")));
        await assertFails(setDoc(doc(visitor, "admin_claims/self-grant"), { admin: true }));
    });
});
