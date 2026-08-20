export const ENCOUNTERS_COLLECTION = "admin_encounters";
export const REMINDER_RESOLUTIONS_COLLECTION = "admin_reminder_resolutions";
export const CONTACT_METHODS = ["In person", "Phone", "Video", "Text", "Email", "Other"];

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

function toDate(value) {
    if (value?.toDate instanceof Function) return value.toDate();
    const date = value instanceof Date ? value : new Date(value || 0);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function dateParts(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

export function localDayKey(now = new Date()) {
    return dateParts(now).date;
}

export function normalizeEncounter(data = {}, id = "") {
    return {
        id,
        names: clean(data.names),
        contact: clean(data.contact),
        occurredDate: clean(data.occurredDate),
        occurredTime: clean(data.occurredTime),
        method: CONTACT_METHODS.includes(data.method) ? data.method : "In person",
        notes: clean(data.notes),
        needsFollowUp: data.needsFollowUp === true,
        submissionId: clean(data.submissionId),
        rootEncounterId: clean(data.rootEncounterId) || id,
        previousEncounterId: clean(data.previousEncounterId),
        archived: data.archived === true,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
    };
}

export function encounterTimestamp(encounter) {
    const dateTime = `${encounter.occurredDate || ""}T${encounter.occurredTime || "00:00"}`;
    const enteredTime = Date.parse(dateTime);
    if (!Number.isNaN(enteredTime)) return enteredTime;
    return toDate(encounter.createdAt || encounter.updatedAt).getTime();
}

export function groupEncounterThreads(encounters = []) {
    const groups = new Map();
    encounters.map((item) => normalizeEncounter(item, item.id)).forEach((encounter) => {
        const rootId = encounter.rootEncounterId || encounter.id;
        if (!groups.has(rootId)) groups.set(rootId, []);
        groups.get(rootId).push(encounter);
    });

    return [...groups.entries()].map(([rootId, meetings]) => {
        meetings.sort((a, b) => encounterTimestamp(a) - encounterTimestamp(b));
        return {
            rootId,
            meetings,
            latest: meetings.at(-1),
            archived: meetings.every(({ archived }) => archived)
        };
    }).sort((a, b) => encounterTimestamp(b.latest) - encounterTimestamp(a.latest));
}

function submissionNames(data = {}) {
    return [data.h_name, data.w_name].map(clean).filter(Boolean).join(" & ");
}

function submissionContact(data = {}) {
    return [data.h_cell, data.w_cell, data.h_email, data.w_email].map(clean).filter(Boolean).join(" · ");
}

export function buildEncounterPrefill({ encounter, submission, now = new Date() } = {}) {
    const current = dateParts(now);
    if (encounter) {
        const source = normalizeEncounter(encounter, encounter.id);
        return {
            names: source.names,
            contact: source.contact,
            occurredDate: current.date,
            occurredTime: current.time,
            method: source.method,
            notes: "",
            needsFollowUp: source.needsFollowUp,
            submissionId: source.submissionId,
            rootEncounterId: source.rootEncounterId,
            previousEncounterId: source.id
        };
    }

    if (submission) {
        return {
            names: submissionNames(submission.data) || "Intake submission",
            contact: submissionContact(submission.data),
            occurredDate: current.date,
            occurredTime: current.time,
            method: "Phone",
            notes: clean(submission.data?.issue_presenting),
            needsFollowUp: true,
            submissionId: submission.id,
            rootEncounterId: "",
            previousEncounterId: ""
        };
    }

    return {
        names: "",
        contact: "",
        occurredDate: current.date,
        occurredTime: current.time,
        method: "In person",
        notes: "",
        needsFollowUp: false,
        submissionId: "",
        rootEncounterId: "",
        previousEncounterId: ""
    };
}

function reminderTitle(encounter) {
    return `Follow up with ${encounter.names || "this contact"}`;
}

export function deriveReminders({ submissions = [], encounters = [], resolutions = [] } = {}) {
    const resolved = new Set(resolutions.map(({ targetKey }) => clean(targetKey)).filter(Boolean));
    const normalized = encounters.map((item) => normalizeEncounter(item, item.id));
    const linkedSubmissionIds = new Set(normalized.map(({ submissionId }) => submissionId).filter(Boolean));
    const reminders = [];

    submissions.forEach((submission) => {
        if (linkedSubmissionIds.has(submission.id)) return;
        const key = `submission:${submission.id}`;
        if (resolved.has(key)) return;
        reminders.push({
            key,
            type: "submission",
            targetId: submission.id,
            title: `Respond to ${submissionNames(submission.data) || "new intake"}`,
            detail: clean(submission.data?.issue_presenting) || "A new intake form is waiting for a response.",
            sortTime: Date.parse(submission.data?.timestamp || "") || 0,
            submission
        });
    });

    groupEncounterThreads(normalized).forEach((thread) => {
        const latest = thread.latest;
        if (latest.archived || !latest.needsFollowUp) return;
        const key = `encounter:${latest.id}`;
        if (resolved.has(key)) return;
        reminders.push({
            key,
            type: "encounter",
            targetId: latest.id,
            title: reminderTitle(latest),
            detail: latest.notes
                || thread.meetings.find(({ notes }) => notes)?.notes
                || "A follow-up is waiting.",
            sortTime: encounterTimestamp(latest),
            encounter: latest
        });
    });

    return reminders.sort((a, b) => b.sortTime - a.sortTime);
}
