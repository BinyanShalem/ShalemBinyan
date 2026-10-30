const COPY = {
    submission: ["Intake notification", "An intake form was submitted or still needs a response."],
    scheduled: ["Scheduled meeting reminder", "This meeting reached its scheduled reminder time."],
    encounter: ["Follow-up reminder", "This meeting was marked as needing a follow-up."],
    manual: ["Personal reminder", "This personal reminder reached its reminder time."],
    donation: ["Donation form submitted", "A donation form was filled out. This is not a payment confirmation."]
};

export function readNotificationRoute(href) {
    const params = new URL(href, "https://local.invalid").searchParams;
    const kind = params.get("notice");
    if (!["items", "test", "legacy"].includes(kind)) return null;
    const keys = [...new Set(params.getAll("item"))].filter((key) =>
        /^(submission|scheduled|encounter|manual|donation):[^/\u0000-\u001f]{1,180}$/.test(key)
    ).slice(0, 6);
    const items = keys.map((key) => {
        const separator = key.indexOf(":");
        return { key, type: key.slice(0, separator), id: key.slice(separator + 1) };
    });
    const count = Math.max(items.length, Math.min(10000, Number.parseInt(params.get("count"), 10) || 0));
    const single = items.length === 1 && count <= 1;
    const [title, reason] = kind === "test"
        ? ["Notifications are working", "This was a test notification for this device. There is no task to complete."]
        : single ? COPY[items[0].type]
            : items.length ? [`${count} reminders need your attention`, "These are the items included in the notification you opened."]
                : ["Notification opened", params.get("reason")?.slice(0, 300) || "This older notification links to the workspace, but does not identify a specific record."];
    return { kind, items, count, title, reason, donations: params.get("view") === "donations" || (items.length > 0 && items.every(({ type }) => type === "donation")) };
}

export function resolveNotificationItem(item, state) {
    const collection = ({ submission: "submissions", donation: "donations", manual: "manualReminders", scheduled: "encounters", encounter: "encounters" })[item.type];
    const [label, reason] = COPY[item.type];
    if (state.errors?.[collection]) return { ...item, label, reason, status: "error" };
    if (!state.loaded[collection]) return { ...item, label, reason, status: "loading" };
    const record = state[collection].find(({ id }) => id === item.id);
    if (!record) return { ...item, label, reason, status: "missing" };
    const title = item.type === "submission"
        ? [record.data.h_name, record.data.w_name].filter(Boolean).join(" & ") || "Intake form"
        : item.type === "donation" ? record.name
            : item.type === "manual" ? record.title : record.names;
    return { ...item, label, reason, status: "ready", record, title };
}
