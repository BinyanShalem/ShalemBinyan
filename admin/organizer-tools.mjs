export const ENCOUNTERS_COLLECTION = "admin_encounters";
export const REMINDER_RESOLUTIONS_COLLECTION = "admin_reminder_resolutions";
export const MANUAL_REMINDERS_COLLECTION = "admin_manual_reminders";
export const REMINDER_SNOOZES_COLLECTION = "admin_reminder_snoozes";
export const PUSH_SUBSCRIPTIONS_COLLECTION = "admin_push_subscriptions";
export const CONTACT_METHODS = ["In person", "Phone", "Video", "Text", "Email", "Other"];
export const ENCOUNTER_TYPES = ["completed", "scheduled"];

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
        encounterType: data.encounterType === "scheduled" ? "scheduled" : "completed",
        names: clean(data.names),
        contact: clean(data.contact),
        otherPeopleInvolved: clean(data.otherPeopleInvolved),
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

export function normalizeManualReminder(data = {}, id = "") {
    return {
        id,
        title: clean(data.title),
        description: clean(data.description),
        dueDate: clean(data.dueDate),
        dueTime: clean(data.dueTime),
        completed: data.completed === true,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
    };
}

export function normalizeReminderSnooze(data = {}, id = "") {
    return {
        id,
        targetKey: clean(data.targetKey),
        snoozedThrough: clean(data.snoozedThrough),
        updatedAt: data.updatedAt || null
    };
}

export function manualReminderTimestamp(reminder, now = new Date()) {
    const normalized = normalizeManualReminder(reminder, reminder?.id);
    if (!normalized.dueDate && !normalized.dueTime) return null;
    const date = normalized.dueDate || localDayKey(now);
    const time = normalized.dueTime || "00:00";
    const timestamp = Date.parse(`${date}T${time}`);
    return Number.isNaN(timestamp) ? null : timestamp;
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

function identityText(value) {
    return clean(value).toLocaleLowerCase().replace(/\s+/g, " ");
}

function identityContact(value) {
    return identityText(value).replace(/[^a-z0-9@.+]/g, "");
}

export function findCoupleThread(encounters = [], { submissionId = "", names = "", contact = "" } = {}) {
    const threads = groupEncounterThreads(encounters);
    const cleanSubmissionId = clean(submissionId);
    if (cleanSubmissionId) {
        const linked = threads.find(({ meetings }) => meetings.some((meeting) => meeting.submissionId === cleanSubmissionId));
        if (linked) return linked;
    }

    const normalizedNames = identityText(names);
    const normalizedContact = identityContact(contact);
    return threads.find(({ meetings }) => meetings.some((meeting) => {
        const contactMatches = normalizedContact && identityContact(meeting.contact) === normalizedContact;
        const namesMatch = normalizedNames && identityText(meeting.names) === normalizedNames;
        return Boolean(contactMatches || namesMatch);
    })) || null;
}

function submissionNames(data = {}) {
    return [data.h_name, data.w_name].map(clean).filter(Boolean).join(" & ");
}

function submissionContact(data = {}) {
    return [data.h_cell, data.w_cell, data.h_email, data.w_email].map(clean).filter(Boolean).join(" · ");
}

function submissionOtherPeople(data = {}) {
    return [
        clean(data.anyone_else_involved),
        clean(data.anyone_else_involvement) ? `Involvement: ${clean(data.anyone_else_involvement)}` : "",
        clean(data.anyone_else_contact) ? `Contact: ${clean(data.anyone_else_contact)}` : ""
    ].filter(Boolean).join(" · ");
}

export function buildEncounterPrefill({ encounter, submission, encounterType = "completed", now = new Date() } = {}) {
    const current = dateParts(now);
    const type = encounterType === "scheduled" ? "scheduled" : "completed";
    const eventDate = type === "scheduled" ? "" : current.date;
    const eventTime = type === "scheduled" ? "" : current.time;
    if (encounter) {
        const source = normalizeEncounter(encounter, encounter.id);
        return {
            encounterType: type,
            names: source.names,
            contact: source.contact,
            otherPeopleInvolved: source.otherPeopleInvolved,
            occurredDate: eventDate,
            occurredTime: eventTime,
            method: source.method,
            notes: "",
            needsFollowUp: type === "completed" && source.needsFollowUp,
            submissionId: source.submissionId,
            rootEncounterId: source.rootEncounterId,
            previousEncounterId: source.id
        };
    }

    if (submission) {
        return {
            encounterType: type,
            names: submissionNames(submission.data) || "Intake submission",
            contact: submissionContact(submission.data),
            otherPeopleInvolved: submissionOtherPeople(submission.data),
            occurredDate: eventDate,
            occurredTime: eventTime,
            method: "Phone",
            notes: clean(submission.data?.issue_presenting),
            needsFollowUp: type === "completed",
            submissionId: submission.id,
            rootEncounterId: "",
            previousEncounterId: ""
        };
    }

    return {
        encounterType: type,
        names: "",
        contact: "",
        otherPeopleInvolved: "",
        occurredDate: eventDate,
        occurredTime: eventTime,
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

export function deriveReminders({
    submissions = [],
    encounters = [],
    resolutions = [],
    manualReminders = [],
    snoozes = [],
    now = new Date()
} = {}) {
    const resolved = new Set(resolutions.map(({ targetKey }) => clean(targetKey)).filter(Boolean));
    const today = localDayKey(now);
    const snoozed = new Map(snoozes
        .map((item) => normalizeReminderSnooze(item, item.id))
        .map(({ targetKey, snoozedThrough }) => [targetKey, snoozedThrough]));
    const normalized = encounters.map((item) => normalizeEncounter(item, item.id));
    const linkedSubmissionIds = new Set(normalized.map(({ submissionId }) => submissionId).filter(Boolean));
    const reminders = [];

    submissions.forEach((submission) => {
        if (linkedSubmissionIds.has(submission.id)) return;
        const key = `submission:${submission.id}`;
        if (resolved.has(key)) return;
        if ((snoozed.get(key) || "") >= today) return;
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
        if (latest.archived) return;
        if (latest.encounterType === "scheduled") {
            if (!latest.occurredDate || latest.occurredDate > today) return;
            const key = `scheduled:${latest.id}`;
            if (resolved.has(key)) return;
            if ((snoozed.get(key) || "") >= today) return;
            reminders.push({
                key,
                type: "scheduled",
                targetId: latest.id,
                title: `Meeting with ${latest.names || "this contact"}`,
                detail: latest.notes || `Scheduled ${latest.method.toLocaleLowerCase()}.`,
                sortTime: encounterTimestamp(latest),
                encounter: latest
            });
            return;
        }
        if (!latest.needsFollowUp) return;
        const key = `encounter:${latest.id}`;
        if (resolved.has(key)) return;
        if ((snoozed.get(key) || "") >= today) return;
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

    manualReminders.map((item) => normalizeManualReminder(item, item.id)).forEach((reminder) => {
        if (!reminder.title || reminder.completed) return;
        const key = `manual:${reminder.id}`;
        if ((snoozed.get(key) || "") >= today) return;
        const dueTimestamp = manualReminderTimestamp(reminder);
        reminders.push({
            key,
            type: "manual",
            targetId: reminder.id,
            title: reminder.title,
            detail: reminder.description,
            dueDate: reminder.dueDate,
            dueTime: reminder.dueTime,
            dueTimestamp,
            sortTime: dueTimestamp ?? toDate(reminder.createdAt || reminder.updatedAt).getTime(),
            manualReminder: reminder
        });
    });

    return reminders.sort((a, b) => b.sortTime - a.sortTime);
}
