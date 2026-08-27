"use strict";

const { GoogleGenAI } = require("@google/genai");

const MODEL_ID = "gemini-3.1-flash-lite";
const MAX_ACTIONS = 3;
const MAX_HISTORY_ITEMS = 6;

const SKILLS = Object.freeze([
    "show_today",
    "show_encounters",
    "show_reminders",
    "show_directory",
    "show_resources",
    "show_intakes",
    "open_encounter_thread",
    "open_intake",
    "find_directory",
    "create_reminder",
    "edit_reminder",
    "delete_reminder",
    "complete_reminder",
    "snooze_reminder",
    "schedule_encounter",
    "log_encounter",
    "edit_encounter",
    "delete_encounter",
    "record_outcome",
    "archive_thread",
    "restore_thread",
    "add_directory_entry",
    "edit_directory_entry",
    "delete_directory_entry",
    "add_resource",
    "remove_resource",
    "delete_intake",
    "enable_notifications",
    "disable_notifications",
    "test_notifications"
]);

const WRITE_SKILLS = new Set([
    "create_reminder",
    "edit_reminder",
    "delete_reminder",
    "complete_reminder",
    "snooze_reminder",
    "schedule_encounter",
    "log_encounter",
    "edit_encounter",
    "delete_encounter",
    "record_outcome",
    "archive_thread",
    "restore_thread",
    "add_directory_entry",
    "edit_directory_entry",
    "delete_directory_entry",
    "add_resource",
    "remove_resource",
    "delete_intake",
    "enable_notifications",
    "disable_notifications",
    "test_notifications"
]);

const ARGUMENT_LIMITS = Object.freeze({
    targetId: 180,
    title: 240,
    name: 240,
    names: 240,
    date: 10,
    time: 5,
    method: 40,
    contact: 500,
    otherPeopleInvolved: 500,
    notes: 1500,
    type: 40,
    phone: 80,
    email: 254,
    url: 1200,
    description: 800,
    query: 240,
    resourceInput: 1500
});

const RESPONSE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        reply: {
            type: "string",
            description: "One brief, calm sentence explaining what was understood or what the admin can do next. Never claim an action already happened."
        },
        clarification: {
            type: "string",
            description: "One short question only when required information is missing. Otherwise an empty string."
        },
        actions: {
            type: "array",
            minItems: 0,
            maxItems: MAX_ACTIONS,
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    skill: { type: "string", enum: SKILLS },
                    summary: {
                        type: "string",
                        description: "A short human-readable description of this proposed action."
                    },
                    arguments: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            targetId: { type: "string" },
                            title: { type: "string" },
                            name: { type: "string" },
                            names: { type: "string" },
                            date: { type: "string", description: "Local date in YYYY-MM-DD format." },
                            time: { type: "string", description: "Local time in HH:MM 24-hour format." },
                            method: { type: "string" },
                            contact: { type: "string" },
                            otherPeopleInvolved: { type: "string" },
                            notes: { type: "string" },
                            needsFollowUp: { type: "boolean" },
                            type: { type: "string", enum: ["Therapist", "Person", "Resource", ""] },
                            phone: { type: "string" },
                            email: { type: "string" },
                            url: { type: "string" },
                            description: { type: "string" },
                            query: { type: "string" },
                            resourceInput: { type: "string" }
                        }
                    }
                },
                required: ["skill", "summary", "arguments"]
            }
        }
    },
    required: ["reply", "clarification", "actions"]
};

const SYSTEM_INSTRUCTION = `You are the private administrative assistant inside the Binyan Shalem admin PWA.
Your job is to understand short natural-language requests and select only the allowlisted skills represented by the response schema.

Rules:
- Be calm, concise, familiar, and nontechnical. Never mention JSON, schemas, Firebase, APIs, or internal IDs.
- Return no more than three actions. Keep reply and summaries short.
- Never say an action was completed. The app always previews or confirms writes after your response.
- Do not invent a name, record ID, contact detail, date, time, meeting method, note, or reminder detail.
- Resolve relative dates such as today, tomorrow, Friday, or next Tuesday using the supplied local date and timezone.
- A reminder needs only a title. A logged encounter needs only names. A scheduled encounter needs names and a date.
- Use a targetId exactly as supplied in context when a request clearly matches one existing record. Otherwise omit targetId and preserve the user's name or query.
- For questions asking to see information, use a show, open, or find skill. Never place private record details in the reply.
- For changes, extract only information the user actually gave. The app will show a prefilled review or confirmation.
- If truly required information is missing, set actions to an empty array and ask exactly one clarification question.
- If the request is conversational but not an admin task, answer briefly and offer the most relevant admin capability without inventing an action.

Skill intent:
- show_today, show_encounters, show_reminders, show_directory, show_resources, show_intakes: open those areas.
- open_encounter_thread/open_intake: use the matching context targetId.
- find_directory: place the search words in query.
- create/edit/delete/complete/snooze reminder: use reminder fields or targetId.
- schedule/log/edit/delete encounter, record_outcome, archive_thread, restore_thread: use encounter/couple fields or targetId.
- add/edit/delete directory entry: use directory fields or targetId.
- add_resource: put a supplied supported link or pasted resource text in resourceInput. remove_resource uses targetId.
- delete_intake uses targetId.
- notification skills change this device's background notification state.`;

function cleanText(value, maxLength = 500) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

function sanitizeRows(rows, fieldLimits, limit) {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, limit).map((row) => {
        const result = {};
        Object.entries(fieldLimits).forEach(([field, maxLength]) => {
            if (typeof row?.[field] === "boolean") result[field] = row[field];
            else {
                const value = cleanText(row?.[field], maxLength);
                if (value) result[field] = value;
            }
        });
        return result;
    }).filter((row) => Object.keys(row).length);
}

function sanitizeContext(input = {}) {
    return {
        now: cleanText(input.now, 40),
        localDate: cleanText(input.localDate, 10),
        timeZone: cleanText(input.timeZone, 80),
        couples: sanitizeRows(input.couples, {
            id: 180, names: 240, latestEncounterId: 180,
            status: 40, date: 10, time: 5, method: 40, needsFollowUp: 5
        }, 30),
        reminders: sanitizeRows(input.reminders, {
            id: 180, targetId: 180, type: 40, title: 240, date: 10, time: 5
        }, 30),
        directory: sanitizeRows(input.directory, {
            id: 180, name: 240, type: 40, notes: 160
        }, 30),
        resources: sanitizeRows(input.resources, {
            id: 180, title: 240, type: 80, provider: 80
        }, 30),
        intakes: sanitizeRows(input.intakes, {
            id: 180, names: 240, submitted: 40
        }, 30)
    };
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-MAX_HISTORY_ITEMS).map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        text: cleanText(item?.text, 500)
    })).filter(({ text }) => text);
}

function sanitizeArguments(input = {}) {
    const result = {};
    Object.entries(ARGUMENT_LIMITS).forEach(([field, limit]) => {
        const value = cleanText(input?.[field], limit);
        if (value) result[field] = value;
    });
    if (typeof input?.needsFollowUp === "boolean") result.needsFollowUp = input.needsFollowUp;
    if (result.date && !/^\d{4}-\d{2}-\d{2}$/.test(result.date)) delete result.date;
    if (result.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time)) delete result.time;
    if (result.type && !["Therapist", "Person", "Resource"].includes(result.type)) delete result.type;
    return result;
}

function knownContextIds(context) {
    return new Set([
        ...context.couples.flatMap(({ id, latestEncounterId }) => [id, latestEncounterId]),
        ...context.reminders.flatMap(({ id, targetId }) => [id, targetId]),
        ...context.directory.map(({ id }) => id),
        ...context.resources.map(({ id }) => id),
        ...context.intakes.map(({ id }) => id)
    ].filter(Boolean));
}

function normalizePlan(raw, context) {
    const knownIds = knownContextIds(context);
    const actions = Array.isArray(raw?.actions) ? raw.actions.slice(0, MAX_ACTIONS).flatMap((action) => {
        const skill = cleanText(action?.skill, 60);
        if (!SKILLS.includes(skill)) return [];
        const args = sanitizeArguments(action?.arguments);
        if (args.targetId && !knownIds.has(args.targetId)) delete args.targetId;
        return [{
            skill,
            summary: cleanText(action?.summary, 280) || "Review this action",
            arguments: args,
            requiresConfirmation: WRITE_SKILLS.has(skill)
        }];
    }) : [];
    return {
        reply: cleanText(raw?.reply, 600) || (actions.length ? "I prepared that for you to review." : "I can help with that."),
        clarification: cleanText(raw?.clarification, 280),
        actions
    };
}

function requestPayload(message, context, history) {
    return JSON.stringify({
        request: cleanText(message, 500),
        context,
        recentConversation: history
    });
}

async function generateAssistantPlan({ apiKey, message, context: rawContext, history = [] }) {
    const cleanMessage = cleanText(message, 500);
    if (!cleanMessage) throw new TypeError("A message is required.");
    const context = sanitizeContext(rawContext);
    const ai = new GoogleGenAI({ apiKey: cleanText(apiKey, 500) });
    const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: requestPayload(cleanMessage, context, sanitizeHistory(history)),
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.1,
            maxOutputTokens: 900,
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_SCHEMA
        }
    });
    return normalizePlan(JSON.parse(response.text || "{}"), context);
}

function usageKeys(uid, now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    return {
        day,
        month,
        dailyId: `daily_${uid}_${day}`,
        monthlyId: `monthly_${month}`
    };
}

module.exports = {
    MAX_ACTIONS,
    MODEL_ID,
    SKILLS,
    WRITE_SKILLS,
    generateAssistantPlan,
    normalizePlan,
    sanitizeContext,
    sanitizeHistory,
    usageKeys
};
