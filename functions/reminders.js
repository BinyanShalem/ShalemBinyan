"use strict";

const DEFAULT_DAILY_MINUTES = 9 * 60;

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

function timestampMillis(value) {
    if (value?.toMillis instanceof Function) return value.toMillis();
    if (value?.toDate instanceof Function) return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
}

function clockParts(now = new Date(), timeZone = "America/New_York") {
    let parts;
    try {
        parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(now);
    } catch {
        return clockParts(now, "America/New_York");
    }
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
        day: `${values.year}-${values.month}-${values.day}`,
        minutes: Number(values.hour) * 60 + Number(values.minute)
    };
}

function timeMinutes(value, fallback = DEFAULT_DAILY_MINUTES) {
    const match = /^(\d{2}):(\d{2})$/.exec(clean(value));
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return fallback;
    return hours * 60 + minutes;
}

function normalizeEncounter(data = {}, id = "") {
    return {
        id,
        encounterType: data.encounterType === "scheduled" ? "scheduled" : "completed",
        names: clean(data.names),
        occurredDate: clean(data.occurredDate),
        occurredTime: clean(data.occurredTime),
        notes: clean(data.notes),
        needsFollowUp: data.needsFollowUp === true,
        submissionId: clean(data.submissionId),
        rootEncounterId: clean(data.rootEncounterId) || id,
        archived: data.archived === true,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
    };
}

function encounterMillis(encounter) {
    const entered = Date.parse(`${encounter.occurredDate || ""}T${encounter.occurredTime || "00:00"}`);
    if (!Number.isNaN(entered)) return entered;
    return timestampMillis(encounter.createdAt || encounter.updatedAt);
}

function groupThreads(encounters = []) {
    const groups = new Map();
    encounters.map((item) => normalizeEncounter(item, item.id)).forEach((encounter) => {
        const rootId = encounter.rootEncounterId || encounter.id;
        if (!groups.has(rootId)) groups.set(rootId, []);
        groups.get(rootId).push(encounter);
    });
    return [...groups.values()].map((meetings) => {
        meetings.sort((a, b) => encounterMillis(a) - encounterMillis(b));
        return { meetings, latest: meetings.at(-1) };
    });
}

function reminderBody(type) {
    if (type === "scheduled") return "A scheduled encounter is due today.";
    if (type === "manual") return "A personal reminder is ready.";
    if (type === "submission") return "A new intake needs a response.";
    return "A follow-up needs your attention.";
}

function deriveDueReminders({
    submissions = [],
    encounters = [],
    resolutions = [],
    manualReminders = [],
    snoozes = [],
    now = new Date(),
    timeZone = "America/New_York"
} = {}) {
    const { day, minutes } = clockParts(now, timeZone);
    const resolved = new Set(resolutions.map(({ targetKey }) => clean(targetKey)).filter(Boolean));
    const snoozed = new Map(snoozes.map(({ targetKey, snoozedThrough }) => [clean(targetKey), clean(snoozedThrough)]));
    const normalizedEncounters = encounters.map((item) => normalizeEncounter(item, item.id));
    const linkedSubmissionIds = new Set(normalizedEncounters.map(({ submissionId }) => submissionId).filter(Boolean));
    const reminders = [];

    function add(reminder) {
        if (resolved.has(reminder.key)) return;
        if ((snoozed.get(reminder.key) || "") >= day) return;
        reminders.push({ ...reminder, body: reminderBody(reminder.type) });
    }

    if (minutes >= DEFAULT_DAILY_MINUTES) {
        submissions.forEach((submission) => {
            if (linkedSubmissionIds.has(submission.id)) return;
            add({ key: `submission:${submission.id}`, type: "submission" });
        });
    }

    groupThreads(normalizedEncounters).forEach(({ latest }) => {
        if (!latest || latest.archived) return;
        if (latest.encounterType === "scheduled") {
            if (latest.occurredDate !== day) return;
            if (minutes < timeMinutes(latest.occurredTime)) return;
            add({ key: `scheduled:${latest.id}`, type: "scheduled" });
            return;
        }
        if (latest.needsFollowUp && minutes >= DEFAULT_DAILY_MINUTES) {
            add({ key: `encounter:${latest.id}`, type: "encounter" });
        }
    });

    manualReminders.forEach((reminder) => {
        if (!clean(reminder.title) || reminder.completed === true) return;
        const dueDate = clean(reminder.dueDate);
        if (dueDate && dueDate > day) return;
        const dueMinutes = dueDate && dueDate < day
            ? DEFAULT_DAILY_MINUTES
            : timeMinutes(reminder.dueTime);
        if (minutes < dueMinutes) return;
        add({ key: `manual:${reminder.id}`, type: "manual" });
    });

    return { day, reminders };
}

module.exports = {
    DEFAULT_DAILY_MINUTES,
    clockParts,
    deriveDueReminders,
    reminderBody,
    timeMinutes
};
