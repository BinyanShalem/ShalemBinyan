"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    MODEL_ID,
    normalizePlan,
    sanitizeContext,
    sanitizeHistory,
    summarizeGeminiError,
    usageKeys
} = require("./gemini-assistant");

test("uses the current cost-controlled Gemini Flash-Lite model", () => {
    assert.equal(MODEL_ID, "gemini-3.1-flash-lite");
});

test("keeps only compact assistant context and omits full private notes", () => {
    const context = sanitizeContext({
        now: "2026-08-27T14:00:00.000Z",
        localDate: "2026-08-27",
        timeZone: "America/New_York",
        couples: [{
            id: "thread-a",
            names: "Couple A",
            contact: "private@example.com · 555-0199",
            notes: "Private meeting notes",
            needsFollowUp: true
        }],
        directory: [{ id: "person-a", name: "Dr. A", type: "Therapist", phone: "555-5555", notes: "Couples specialist" }]
    });
    assert.equal(context.couples[0].names, "Couple A");
    assert.equal(context.couples[0].contact, undefined);
    assert.equal(context.couples[0].notes, undefined);
    assert.equal(context.directory[0].phone, undefined);
    assert.equal(context.directory[0].notes, "Couples specialist");
});

test("limits conversation history and message size", () => {
    const history = sanitizeHistory(Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        text: `${index}`.repeat(700)
    })));
    assert.equal(history.length, 6);
    assert.equal(history[0].text.length, 500);
    assert.equal(history[5].role, "assistant");
});

test("normalizes allowlisted skills and forces confirmation for writes", () => {
    const context = sanitizeContext({
        reminders: [{ id: "manual:reminder-a", targetId: "reminder-a", title: "Call" }]
    });
    const result = normalizePlan({
        reply: "I found it.",
        clarification: "",
        actions: [
            { skill: "complete_reminder", summary: "Complete Call", arguments: { targetId: "reminder-a" } },
            { skill: "run_arbitrary_code", summary: "No", arguments: {} }
        ]
    }, context);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].skill, "complete_reminder");
    assert.equal(result.actions[0].requiresConfirmation, true);
});

test("drops invented record IDs and malformed dates", () => {
    const result = normalizePlan({
        reply: "I prepared it.",
        clarification: "",
        actions: [{
            skill: "schedule_encounter",
            summary: "Schedule a meeting",
            arguments: { targetId: "invented", names: "Couple A", date: "next Tuesday", time: "3pm" }
        }]
    }, sanitizeContext({ couples: [{ id: "real", names: "Couple A" }] }));
    assert.deepEqual(result.actions[0].arguments, { names: "Couple A" });
});

test("creates stable UTC usage keys", () => {
    assert.deepEqual(usageKeys("user-a", new Date("2026-08-27T23:59:00Z")), {
        day: "2026-08-27",
        month: "2026-08",
        dailyId: "daily_user-a_2026-08-27",
        monthlyId: "monthly_2026-08"
    });
});

test("extracts safe Gemini quota errors without logging an API key", () => {
    const summary = summarizeGeminiError({
        status: 429,
        message: JSON.stringify({
            error: {
                status: "RESOURCE_EXHAUSTED",
                message: "Quota unavailable for key AIzaSyExampleCredentialThatMustBeRedacted."
            }
        })
    });
    assert.deepEqual(summary, {
        status: 429,
        reason: "RESOURCE_EXHAUSTED",
        message: "Quota unavailable for key [redacted]."
    });
});
