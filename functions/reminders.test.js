"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { clockParts, deriveDueReminders } = require("./reminders");

function atNewYorkTime(iso) {
    return new Date(iso);
}

test("reads the local calendar day in the subscription timezone", () => {
    assert.deepEqual(
        clockParts(atNewYorkTime("2026-08-21T13:15:00Z"), "America/New_York"),
        { day: "2026-08-21", minutes: 9 * 60 + 15 }
    );
});

test("sends daily intake and follow-up reminders after 9am", () => {
    const result = deriveDueReminders({
        submissions: [{ id: "form-a" }],
        encounters: [{
            id: "meeting-a",
            encounterType: "completed",
            rootEncounterId: "meeting-a",
            names: "Couple A",
            needsFollowUp: true,
            occurredDate: "2026-08-20"
        }],
        now: atNewYorkTime("2026-08-21T13:05:00Z")
    });
    assert.deepEqual(result.reminders.map(({ key }) => key), ["submission:form-a", "encounter:meeting-a"]);
});

test("a future scheduled encounter suppresses the older thread follow-up", () => {
    const result = deriveDueReminders({
        encounters: [
            {
                id: "meeting-a",
                encounterType: "completed",
                rootEncounterId: "meeting-a",
                needsFollowUp: true,
                occurredDate: "2026-08-20"
            },
            {
                id: "meeting-b",
                encounterType: "scheduled",
                rootEncounterId: "meeting-a",
                occurredDate: "2026-08-22",
                occurredTime: "10:00"
            }
        ],
        now: atNewYorkTime("2026-08-21T15:00:00Z")
    });
    assert.deepEqual(result.reminders, []);
});

test("a scheduled encounter is due at its chosen time on its chosen day", () => {
    const encounter = {
        id: "meeting-b",
        encounterType: "scheduled",
        rootEncounterId: "meeting-a",
        occurredDate: "2026-08-21",
        occurredTime: "10:00"
    };
    const before = deriveDueReminders({
        encounters: [encounter],
        now: atNewYorkTime("2026-08-21T13:59:00Z")
    });
    const after = deriveDueReminders({
        encounters: [encounter],
        now: atNewYorkTime("2026-08-21T14:01:00Z")
    });
    assert.equal(before.reminders.length, 0);
    assert.deepEqual(after.reminders.map(({ key }) => key), ["scheduled:meeting-b"]);
});

test("manual reminders wait for their date and time, then repeat daily until completed", () => {
    const reminder = { id: "manual-a", title: "Call", dueDate: "2026-08-21", dueTime: "11:30" };
    assert.equal(deriveDueReminders({
        manualReminders: [reminder],
        now: atNewYorkTime("2026-08-21T15:00:00Z")
    }).reminders.length, 0);
    assert.equal(deriveDueReminders({
        manualReminders: [reminder],
        now: atNewYorkTime("2026-08-21T15:31:00Z")
    }).reminders.length, 1);
    assert.equal(deriveDueReminders({
        manualReminders: [reminder],
        now: atNewYorkTime("2026-08-22T13:05:00Z")
    }).reminders.length, 1);
});

test("resolutions and persisted snoozes suppress background delivery", () => {
    const base = {
        submissions: [{ id: "form-a" }, { id: "form-b" }],
        resolutions: [{ targetKey: "submission:form-a" }],
        snoozes: [{ targetKey: "submission:form-b", snoozedThrough: "2026-08-21" }],
        now: atNewYorkTime("2026-08-21T14:00:00Z")
    };
    assert.deepEqual(deriveDueReminders(base).reminders, []);
    assert.deepEqual(
        deriveDueReminders({ ...base, now: atNewYorkTime("2026-08-22T14:00:00Z") }).reminders.map(({ key }) => key),
        ["submission:form-b"]
    );
});
