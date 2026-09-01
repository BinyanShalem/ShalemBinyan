import test from "node:test";
import assert from "node:assert/strict";

import {
    buildEncounterPrefill,
    deriveReminders,
    findCoupleThread,
    groupEncounterThreads,
    localDayKey,
    manualReminderTimestamp,
    normalizeEncounter,
    normalizeManualReminder
} from "../admin/organizer-tools.mjs";

const submission = {
    id: "form-1",
    data: {
        h_name: "Ari Cohen",
        w_name: "Leah Cohen",
        h_cell: "555-0101",
        w_email: "leah@example.com",
        issue_presenting: "Communication",
        anyone_else_involved: "Rabbi Feldman",
        anyone_else_involvement: "Family rabbi",
        anyone_else_contact: "555-0134",
        timestamp: "2026-08-18T15:00:00.000Z"
    }
};

test("prefills a first encounter from an intake submission", () => {
    const prefill = buildEncounterPrefill({
        submission,
        encounterType: "scheduled",
        now: new Date("2026-08-20T14:35:00")
    });

    assert.equal(prefill.names, "Ari Cohen & Leah Cohen");
    assert.equal(prefill.contact, "555-0101 · leah@example.com");
    assert.equal(prefill.otherPeopleInvolved, "Rabbi Feldman · Involvement: Family rabbi · Contact: 555-0134");
    assert.equal(prefill.notes, "Communication");
    assert.equal(prefill.submissionId, "form-1");
    assert.equal(prefill.encounterType, "scheduled");
    assert.equal(prefill.occurredDate, "");
    assert.equal(prefill.occurredTime, "");
    assert.equal(prefill.needsFollowUp, false);
});

test("scheduled chained meetings carry couple details but require a new date", () => {
    const prefill = buildEncounterPrefill({
        encounter: {
            id: "meeting-1",
            rootEncounterId: "root-1",
            submissionId: "form-1",
            names: "Ari & Leah",
            contact: "555-0101",
            method: "Video",
            needsFollowUp: true
        },
        encounterType: "scheduled",
        now: new Date("2026-08-21T09:05:00")
    });

    assert.equal(prefill.encounterType, "scheduled");
    assert.equal(prefill.occurredDate, "");
    assert.equal(prefill.occurredTime, "");
    assert.equal(prefill.needsFollowUp, false);
    assert.equal(prefill.previousEncounterId, "meeting-1");
    assert.equal(prefill.rootEncounterId, "root-1");
});

test("prefills a chained meeting while leaving its notes empty", () => {
    const encounter = normalizeEncounter({
        names: "Ari & Leah",
        contact: "555-0101",
        otherPeopleInvolved: "Rabbi Feldman",
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
    assert.equal(prefill.otherPeopleInvolved, "Rabbi Feldman");
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

test("finds one couple thread by intake first, then by matching identity", () => {
    const encounters = [
        { id: "root", rootEncounterId: "root", submissionId: "form-1", names: "Ari & Leah", contact: "555-0101" },
        { id: "later", rootEncounterId: "root", submissionId: "form-1", names: "Ari & Leah", contact: "555-0101", occurredDate: "2026-08-20" }
    ];

    assert.equal(findCoupleThread(encounters, { submissionId: "form-1" }).rootId, "root");
    assert.equal(findCoupleThread(encounters, { names: "  ARI & LEAH " }).rootId, "root");
    assert.equal(findCoupleThread(encounters, { contact: "555 0101" }).rootId, "root");
    assert.equal(findCoupleThread(encounters, { names: "Someone else" }), null);
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

test("a scheduled encounter becomes the only thread reminder on its date", () => {
    const reminders = deriveReminders({
        submissions: [submission],
        encounters: [
            { id: "meeting-1", submissionId: "form-1", rootEncounterId: "meeting-1", names: "Ari & Leah", needsFollowUp: true, occurredDate: "2026-08-19" },
            { id: "meeting-2", encounterType: "scheduled", submissionId: "form-1", rootEncounterId: "meeting-1", names: "Ari & Leah", occurredDate: "2026-08-21", occurredTime: "10:00", method: "Phone" }
        ],
        now: new Date("2026-08-21T08:00:00")
    });

    assert.deepEqual(reminders.map(({ key }) => key), ["scheduled:meeting-2"]);
    assert.equal(reminders[0].title, "Meeting with Ari & Leah");
});

test("a future scheduled encounter suppresses older follow-ups without reminding early", () => {
    const reminders = deriveReminders({
        encounters: [
            { id: "meeting-1", rootEncounterId: "meeting-1", needsFollowUp: true, occurredDate: "2026-08-19" },
            { id: "meeting-2", encounterType: "scheduled", rootEncounterId: "meeting-1", occurredDate: "2026-08-22" }
        ],
        now: new Date("2026-08-21T08:00:00")
    });

    assert.deepEqual(reminders, []);
});

test("legacy encounters normalize as completed", () => {
    assert.equal(normalizeEncounter({ names: "Ari & Leah" }, "legacy").encounterType, "completed");
    assert.equal(normalizeEncounter({ encounterType: "scheduled" }, "future").encounterType, "scheduled");
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

test("personal reminders can stand alone with optional timing and description", () => {
    const reminder = normalizeManualReminder({
        title: "  Call the therapist  ",
        description: "  Ask about availability  ",
        dueDate: "2026-08-22",
        dueTime: "14:30",
        completed: false
    }, "personal-1");
    const reminders = deriveReminders({
        manualReminders: [reminder, { id: "done", title: "Finished", completed: true }]
    });

    assert.equal(reminder.title, "Call the therapist");
    assert.equal(reminder.description, "Ask about availability");
    assert.equal(manualReminderTimestamp(reminder), new Date("2026-08-22T14:30").getTime());
    assert.deepEqual(reminders.map(({ key }) => key), ["manual:personal-1"]);
    assert.equal(reminders[0].dueTime, "14:30");
});

test("a durable snooze hides the reminder only through its chosen day", () => {
    const input = {
        submissions: [submission],
        snoozes: [{ targetKey: "submission:form-1", snoozedThrough: "2026-08-21" }]
    };
    assert.deepEqual(deriveReminders({
        ...input,
        now: new Date(2026, 7, 21, 10, 0)
    }), []);
    assert.deepEqual(deriveReminders({
        ...input,
        now: new Date(2026, 7, 22, 10, 0)
    }).map(({ key }) => key), ["submission:form-1"]);
});

test("formats a stable local day key", () => {
    assert.equal(localDayKey(new Date(2026, 7, 9, 23, 59)), "2026-08-09");
});
