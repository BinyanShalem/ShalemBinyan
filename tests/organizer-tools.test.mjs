import test from "node:test";
import assert from "node:assert/strict";

import {
    buildEncounterPrefill,
    deriveReminders,
    groupEncounterThreads,
    localDayKey,
    normalizeEncounter
} from "../admin/organizer-tools.mjs";

const submission = {
    id: "form-1",
    data: {
        h_name: "Ari Cohen",
        w_name: "Leah Cohen",
        h_cell: "555-0101",
        w_email: "leah@example.com",
        issue_presenting: "Communication",
        timestamp: "2026-08-18T15:00:00.000Z"
    }
};

test("prefills a first encounter from an intake submission", () => {
    const prefill = buildEncounterPrefill({
        submission,
        now: new Date("2026-08-20T14:35:00")
    });

    assert.equal(prefill.names, "Ari Cohen & Leah Cohen");
    assert.equal(prefill.contact, "555-0101 · leah@example.com");
    assert.equal(prefill.notes, "Communication");
    assert.equal(prefill.submissionId, "form-1");
    assert.equal(prefill.occurredDate, "2026-08-20");
    assert.equal(prefill.occurredTime, "14:35");
    assert.equal(prefill.needsFollowUp, true);
});

test("prefills a chained meeting while leaving its notes empty", () => {
    const encounter = normalizeEncounter({
        names: "Ari & Leah",
        contact: "555-0101",
        method: "Phone",
        notes: "Called about next steps",
        needsFollowUp: true,
        rootEncounterId: "root-1",
        submissionId: "form-1"
    }, "meeting-1");
    const prefill = buildEncounterPrefill({
        encounter,
        now: new Date("2026-08-21T09:05:00")
    });

    assert.equal(prefill.names, "Ari & Leah");
    assert.equal(prefill.contact, "555-0101");
    assert.equal(prefill.method, "Phone");
    assert.equal(prefill.notes, "");
    assert.equal(prefill.previousEncounterId, "meeting-1");
    assert.equal(prefill.rootEncounterId, "root-1");
    assert.equal(prefill.occurredDate, "2026-08-21");
    assert.equal(prefill.occurredTime, "09:05");
});

test("groups chained encounters and puts the newest meeting last", () => {
    const threads = groupEncounterThreads([
        { id: "follow-up", rootEncounterId: "root", occurredDate: "2026-08-20", occurredTime: "10:00" },
        { id: "root", rootEncounterId: "root", occurredDate: "2026-08-19", occurredTime: "10:00" },
        { id: "standalone", occurredDate: "2026-08-18", occurredTime: "10:00" }
    ]);

    assert.equal(threads.length, 2);
    const chained = threads.find(({ rootId }) => rootId === "root");
    assert.deepEqual(chained.meetings.map(({ id }) => id), ["root", "follow-up"]);
    assert.equal(chained.latest.id, "follow-up");
});

test("a linked encounter replaces its intake reminder", () => {
    const reminders = deriveReminders({
        submissions: [submission],
        encounters: [
            {
                id: "meeting-1",
                submissionId: "form-1",
                rootEncounterId: "meeting-1",
                names: "Ari & Leah",
                needsFollowUp: true,
                archived: false,
                occurredDate: "2026-08-20",
                occurredTime: "14:00"
            }
        ]
    });

    assert.deepEqual(reminders.map(({ key }) => key), ["encounter:meeting-1"]);
});

test("the latest no-follow-up meeting suppresses the whole thread and form reminder", () => {
    const reminders = deriveReminders({
        submissions: [submission],
        encounters: [
            { id: "meeting-1", submissionId: "form-1", rootEncounterId: "meeting-1", needsFollowUp: true, occurredDate: "2026-08-19" },
            { id: "meeting-2", submissionId: "form-1", rootEncounterId: "meeting-1", needsFollowUp: false, occurredDate: "2026-08-20" }
        ]
    });

    assert.deepEqual(reminders, []);
});

test("unlinked forms and standalone follow-ups become reminders until resolved", () => {
    const reminders = deriveReminders({
        submissions: [submission],
        encounters: [
            { id: "standalone", rootEncounterId: "standalone", names: "Miriam", needsFollowUp: true, occurredDate: "2026-08-20" }
        ],
        resolutions: [{ targetKey: "submission:form-1" }]
    });

    assert.deepEqual(reminders.map(({ key }) => key), ["encounter:standalone"]);
    assert.equal(reminders[0].title, "Follow up with Miriam");
});

test("formats a stable local day key", () => {
    assert.equal(localDayKey(new Date(2026, 7, 9, 23, 59)), "2026-08-09");
});
