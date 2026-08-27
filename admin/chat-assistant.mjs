const CHAT_SECTIONS = ["today", "encounters", "reminders", "directory", "resources", "intakes"];

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

function formatDate(value, { includeWeekday = false } = {}) {
    if (!value) return "No date";
    const parsed = new Date(`${value}T12:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
        ...(includeWeekday ? { weekday: "short" } : {}),
        month: "short",
        day: "numeric",
        year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    });
}

function formatTime(value) {
    if (!value) return "";
    const parsed = new Date(`2000-01-01T${value}`);
    return Number.isNaN(parsed.getTime())
        ? value
        : parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function submissionNames(submission) {
    return [submission?.data?.h_name, submission?.data?.w_name].map(clean).filter(Boolean).join(" & ") || "Intake submission";
}

function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function labeledField(labelText, control, { optional = false, wide = false } = {}) {
    const label = element("label", `chat-field${wide ? " chat-field-wide" : ""}`);
    const caption = element("span", "chat-field-label", labelText);
    if (optional) caption.appendChild(element("small", "", "Optional"));
    label.append(caption, control);
    return label;
}

function textInput({ name, type = "text", value = "", placeholder = "", required = false, maxLength, autocomplete = "off" }) {
    const input = element("input", "chat-input");
    Object.assign(input, { name, type, value, placeholder, required, autocomplete });
    if (maxLength) input.maxLength = maxLength;
    return input;
}

function textArea({ name, value = "", placeholder = "", required = false, maxLength, rows = 3 }) {
    const input = element("textarea", "chat-input chat-textarea");
    Object.assign(input, { name, value, placeholder, required, rows });
    if (maxLength) input.maxLength = maxLength;
    return input;
}

function selectInput({ name, value = "", options = [] }) {
    const select = element("select", "chat-input");
    select.name = name;
    options.forEach((optionValue) => {
        const option = element("option", "", optionValue);
        option.value = optionValue;
        option.selected = optionValue === value;
        select.appendChild(option);
    });
    return select;
}

export function createAdminChat({
    conversation,
    composer,
    composerInput,
    menuButton,
    smartStatus = null,
    getState,
    actions,
    contactMethods = ["In person", "Phone", "Video", "Text", "Email", "Other"]
}) {
    let initialized = false;
    let pendingTextAction = null;
    let liveSummary = null;
    let currentSection = "today";
    let pendingSection = null;
    let messageId = 0;
    let smartBusy = false;
    let assistantHistory = [];

    function scrollToLatest() {
        window.requestAnimationFrame(() => {
            conversation.scrollTo({
                top: conversation.scrollHeight,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
            });
        });
    }

    function actionButton(label, handler, { tone = "primary", ariaLabel = "" } = {}) {
        const button = element("button", `chat-action chat-action-${tone}`, label);
        button.type = "button";
        if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
        button.addEventListener("click", () => handler(button));
        return button;
    }

    function actionLink(label, href, ariaLabel) {
        const link = element("a", "chat-action chat-action-secondary", label);
        link.href = href;
        link.setAttribute("aria-label", ariaLabel);
        if (href.startsWith("https://")) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
        return link;
    }

    function appendMessage(kind, { title = "", text = "", content = null, buttons = [], quiet = false } = {}) {
        const row = element("article", `chat-message-row chat-message-${kind}${quiet ? " is-quiet" : ""}`);
        row.dataset.messageId = String(++messageId);
        row.setAttribute("aria-label", kind === "user" ? "You" : "Binyan assistant");

        if (kind === "assistant") {
            const avatar = element("span", "chat-avatar");
            const image = document.createElement("img");
            image.src = "./icons/icon-192.png";
            image.alt = "";
            avatar.appendChild(image);
            row.appendChild(avatar);
        }

        const bubble = element("div", "chat-bubble");
        if (title) bubble.appendChild(element("h2", "chat-message-title", title));
        if (text) bubble.appendChild(element("p", "chat-message-copy", text));
        if (content) bubble.appendChild(content);
        if (buttons.length) {
            const actionsWrap = element("div", "chat-message-actions");
            actionsWrap.append(...buttons);
            bubble.appendChild(actionsWrap);
        }
        row.appendChild(bubble);
        conversation.appendChild(row);
        scrollToLatest();
        return { row, bubble };
    }

    function say(text, options = {}) {
        return appendMessage("assistant", { text, ...options });
    }

    function sayUser(text) {
        return appendMessage("user", { text });
    }

    function setPendingText(prompt, handler, placeholder = "Type your answer") {
        pendingTextAction = handler;
        composerInput.placeholder = placeholder;
        say(prompt, {
            buttons: [actionButton("Cancel", () => {
                pendingTextAction = null;
                composerInput.placeholder = "Message the assistant";
                showMainMenu({ announce: false });
            }, { tone: "secondary" })]
        });
        window.setTimeout(() => composerInput.focus(), 0);
    }

    function summaryText() {
        const state = getState();
        const scheduled = state.threads.filter(({ archived, latest }) => !archived && latest.encounterType === "scheduled").length;
        const reminders = state.reminders.length;
        if (!reminders && !scheduled) return "You’re all caught up. Nothing needs your attention right now.";
        const parts = [];
        if (reminders) parts.push(`${reminders} ${reminders === 1 ? "reminder" : "reminders"}`);
        if (scheduled) parts.push(`${scheduled} scheduled ${scheduled === 1 ? "meeting" : "meetings"}`);
        return `Right now you have ${parts.join(" and ")}.`;
    }

    function updateLiveSummary() {
        if (liveSummary) liveSummary.textContent = summaryText();
    }

    function menuButtons() {
        return [
            actionButton("Today", () => showToday()),
            actionButton("Encounters", () => showEncounters()),
            actionButton("Reminders", () => showReminders()),
            actionButton("Directory", () => showDirectory()),
            actionButton("Resources", () => showResources()),
            actionButton("Intake forms", () => showIntakes())
        ];
    }

    function showMainMenu({ announce = true } = {}) {
        pendingTextAction = null;
        composerInput.placeholder = "Message the assistant";
        if (announce) sayUser("Menu");
        say("What would you like to handle?", { buttons: menuButtons() });
    }

    function setSmartStatus(tone, text) {
        if (!smartStatus) return;
        smartStatus.dataset.tone = tone;
        const copy = smartStatus.querySelector("span:last-child");
        if (copy) copy.textContent = text;
    }

    function normalized(value) {
        return clean(value).toLocaleLowerCase();
    }

    function findThreadForAI(args = {}) {
        const state = getState();
        const targetId = clean(args.targetId);
        if (targetId) {
            const direct = state.threads.find((thread) => thread.rootId === targetId
                || thread.latest.id === targetId
                || thread.meetings.some(({ id }) => id === targetId));
            if (direct) return direct;
        }
        const names = normalized(args.names || args.query);
        return names
            ? state.threads.find((thread) => normalized(thread.latest.names).includes(names)
                || names.includes(normalized(thread.latest.names))) || null
            : null;
    }

    function findEncounterForAI(args = {}) {
        const state = getState();
        const targetId = clean(args.targetId);
        if (targetId) {
            const direct = state.encounters.find(({ id }) => id === targetId);
            if (direct) return direct;
        }
        return findThreadForAI(args)?.latest || null;
    }

    function findReminderForAI(args = {}) {
        const state = getState();
        const targetId = clean(args.targetId);
        const title = normalized(args.title || args.query);
        return state.reminders.find((reminder) => (targetId && [reminder.key, reminder.targetId, reminder.manualReminder?.id].includes(targetId))
            || (title && normalized(reminder.title).includes(title))) || null;
    }

    function findDirectoryEntryForAI(args = {}) {
        const state = getState();
        const targetId = clean(args.targetId);
        const query = normalized(args.query || args.name || args.names || args.title);
        return state.directoryEntries.find((entry) => (targetId && entry.id === targetId)
            || (query && normalized(entry.name).includes(query))) || null;
    }

    function findResourceForAI(args = {}) {
        const state = getState();
        const targetId = clean(args.targetId);
        const query = normalized(args.query || args.title);
        return state.resources.find((resource) => (targetId && resource.id === targetId)
            || (query && normalized(resource.title).includes(query))) || null;
    }

    function findIntakeForAI(args = {}) {
        const state = getState();
        const targetId = clean(args.targetId);
        const query = normalized(args.names || args.query);
        return state.submissions.find((submission) => (targetId && submission.id === targetId)
            || (query && normalized(submissionNames(submission)).includes(query))) || null;
    }

    function encounterDraft(args = {}) {
        const selectedMethod = contactMethods.find((method) => normalized(method) === normalized(args.method));
        return {
            names: clean(args.names),
            contact: clean(args.contact),
            otherPeopleInvolved: clean(args.otherPeopleInvolved),
            occurredDate: clean(args.date),
            occurredTime: clean(args.time),
            method: selectedMethod || "",
            notes: clean(args.notes),
            needsFollowUp: args.needsFollowUp === true
        };
    }

    function missingSmartTarget(section, label = "that item") {
        say(`I couldn’t safely match ${label}. Choose it here and I’ll keep helping.`, {
            buttons: [actionButton(`Open ${section}`, () => showSection(section)), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
        });
    }

    function smartActionLabel(skill) {
        const labels = {
            show_today: "Open Today",
            show_encounters: "Open encounters",
            show_reminders: "Open reminders",
            show_directory: "Open directory",
            show_resources: "Open resources",
            show_intakes: "Open intake forms",
            open_encounter_thread: "Open timeline",
            open_intake: "Open intake",
            find_directory: "Show results",
            create_reminder: "Review reminder",
            edit_reminder: "Review changes",
            schedule_encounter: "Review meeting",
            log_encounter: "Review meeting",
            edit_encounter: "Review changes",
            record_outcome: "Review outcome",
            add_directory_entry: "Review entry",
            edit_directory_entry: "Review changes",
            add_resource: "Review resource",
            delete_reminder: "Confirm delete",
            complete_reminder: "Confirm done",
            snooze_reminder: "Confirm tomorrow",
            delete_encounter: "Confirm delete",
            archive_thread: "Confirm archive",
            restore_thread: "Confirm restore",
            delete_directory_entry: "Confirm delete",
            remove_resource: "Confirm removal",
            delete_intake: "Confirm delete",
            enable_notifications: "Confirm enable",
            disable_notifications: "Confirm disable",
            test_notifications: "Send test"
        };
        return labels[skill] || "Continue";
    }

    function directSmartTask(action) {
        const args = action.arguments || {};
        switch (action.skill) {
            case "delete_reminder": {
                const reminder = findReminderForAI(args);
                return reminder?.type === "manual"
                    ? {
                        task: () => actions.deleteReminder(reminder.manualReminder),
                        success: `${reminder.title} was deleted.`,
                        confirmationTitle: `Delete reminder “${reminder.title}”?`,
                        confirmationMeta: "This permanently removes this personal reminder. This cannot be undone.",
                        confirmationTone: "danger"
                    }
                    : null;
            }
            case "complete_reminder": {
                const reminder = findReminderForAI(args);
                return reminder ? {
                    task: () => actions.completeReminder(reminder),
                    success: "Done — I cleared that reminder.",
                    confirmationTitle: `Mark “${reminder.title}” taken care of?`,
                    confirmationMeta: "This marks the latest follow-up as handled and removes it from active reminders."
                } : null;
            }
            case "snooze_reminder": {
                const reminder = findReminderForAI(args);
                return reminder ? {
                    task: () => actions.snoozeReminder(reminder),
                    success: "Okay — I’ll bring it back tomorrow.",
                    confirmationTitle: `Remind you tomorrow about “${reminder.title}”?`,
                    confirmationMeta: "This hides the reminder for today. It will return automatically tomorrow."
                } : null;
            }
            case "delete_encounter": {
                const encounter = findEncounterForAI(args);
                const names = clean(encounter?.names) || "this couple";
                return encounter ? {
                    task: () => actions.deleteEncounter(encounter),
                    success: "The meeting was deleted.",
                    confirmationTitle: `Delete the ${formatDate(encounter.occurredDate)} meeting with ${names}?`,
                    confirmationMeta: "This permanently removes this meeting from the timeline. This cannot be undone.",
                    confirmationTone: "danger"
                } : null;
            }
            case "archive_thread":
            case "restore_thread": {
                const thread = findThreadForAI(args);
                const archived = action.skill === "archive_thread";
                const names = clean(thread?.latest?.names) || "this couple";
                return thread ? {
                    task: () => actions.setThreadArchived(thread, archived),
                    success: archived ? "The full timeline was archived." : "The full timeline is active again.",
                    confirmationTitle: `${archived ? "Archive" : "Restore"} the full timeline for ${names}?`,
                    confirmationMeta: archived
                        ? "This moves every meeting in this timeline out of the active list. The timeline stays saved and can be restored."
                        : "This returns the full saved timeline to the active encounter list.",
                    confirmationTone: archived ? "danger" : "primary"
                } : null;
            }
            case "delete_directory_entry": {
                const entry = findDirectoryEntryForAI(args);
                return entry ? {
                    task: () => actions.deleteDirectoryEntry(entry),
                    success: `${entry.name} was deleted from your directory.`,
                    confirmationTitle: `Delete ${entry.name} from the private directory?`,
                    confirmationMeta: "This permanently removes the saved directory entry. This cannot be undone.",
                    confirmationTone: "danger"
                } : null;
            }
            case "remove_resource": {
                const resource = findResourceForAI(args);
                return resource ? {
                    task: () => actions.deleteResource(resource),
                    success: `“${resource.title}” was removed from the public library.`,
                    confirmationTitle: `Remove “${resource.title}” from the public library?`,
                    confirmationMeta: "This permanently removes the published resource. This cannot be undone.",
                    confirmationTone: "danger"
                } : null;
            }
            case "delete_intake": {
                const submission = findIntakeForAI(args);
                const names = submissionNames(submission);
                return submission ? {
                    task: () => actions.deleteSubmission(submission),
                    success: "The intake form was permanently deleted.",
                    confirmationTitle: `Delete the intake form for ${names}?`,
                    confirmationMeta: "This permanently removes the intake submission. This cannot be undone.",
                    confirmationTone: "danger"
                } : null;
            }
            case "enable_notifications":
                return {
                    task: actions.enableNotifications,
                    success: "Notifications are on. I sent a private test notification.",
                    confirmationTitle: "Enable background notifications on this device?",
                    confirmationMeta: "This subscribes this device and sends one private test notification."
                };
            case "disable_notifications":
                return {
                    task: actions.disableNotifications,
                    success: "Background notifications are off for this device.",
                    confirmationTitle: "Disable background notifications on this device?",
                    confirmationMeta: "This unsubscribes this device. In-app reminders will still remain available."
                };
            case "test_notifications":
                return {
                    task: actions.testNotifications,
                    success: "Test notification sent. It should arrive in a few seconds.",
                    confirmationTitle: "Send one private test notification to this device?",
                    confirmationMeta: "This sends only a test and does not change reminder data."
                };
            default:
                return null;
        }
    }

    function smartActionPresentation(action) {
        const direct = directSmartTask(action);
        if (direct?.confirmationTitle) {
            return {
                title: direct.confirmationTitle,
                meta: direct.confirmationMeta,
                tone: direct.confirmationTone || "primary"
            };
        }
        return {
            title: action.summary || "Review this action",
            meta: action.requiresConfirmation ? "Nothing changes until you review the details" : "Ready to open",
            tone: action.requiresConfirmation && /delete|remove|archive/.test(action.skill) ? "danger" : "primary"
        };
    }

    function runSmartAction(action, trigger) {
        const args = action.arguments || {};
        switch (action.skill) {
            case "show_today": return showToday({ announce: false });
            case "show_encounters": return showEncounters({ announce: false });
            case "show_reminders": return showReminders({ announce: false });
            case "show_directory": return showDirectory({ announce: false });
            case "show_resources": return showResources({ announce: false });
            case "show_intakes": return showIntakes({ announce: false });
            case "open_encounter_thread": {
                const thread = findThreadForAI(args);
                return thread ? showThread(thread) : missingSmartTarget("encounters", "that encounter timeline");
            }
            case "open_intake": {
                const submission = findIntakeForAI(args);
                return submission ? showIntakeDetails(submission) : missingSmartTarget("intakes", "that intake form");
            }
            case "find_directory": return showDirectory({ query: args.query || args.names || args.title, announce: false });
            case "create_reminder": return showReminderForm(null, args);
            case "edit_reminder": {
                const reminder = findReminderForAI(args);
                return reminder?.type === "manual"
                    ? showReminderForm(reminder.manualReminder, args)
                    : missingSmartTarget("reminders", "that personal reminder");
            }
            case "schedule_encounter":
            case "log_encounter": {
                const encounterType = action.skill === "schedule_encounter" ? "scheduled" : "completed";
                const thread = findThreadForAI(args);
                const submission = thread ? null : findIntakeForAI(args);
                return showEncounterForm({
                    encounterType,
                    encounter: thread?.latest || null,
                    submission,
                    draft: encounterDraft(args)
                });
            }
            case "edit_encounter": {
                const encounter = findEncounterForAI(args);
                return encounter
                    ? showEncounterForm({ existing: encounter, encounterType: encounter.encounterType, draft: encounterDraft(args) })
                    : missingSmartTarget("encounters", "that meeting");
            }
            case "record_outcome": {
                const encounter = findEncounterForAI(args);
                return encounter?.encounterType === "scheduled"
                    ? showEncounterForm({ existing: encounter, encounterType: "completed", converting: true, draft: encounterDraft(args) })
                    : missingSmartTarget("encounters", "that scheduled meeting");
            }
            case "add_directory_entry": return showDirectoryForm(null, args);
            case "edit_directory_entry": {
                const entry = findDirectoryEntryForAI(args);
                return entry ? showDirectoryForm(entry, args) : missingSmartTarget("directory", "that directory entry");
            }
            case "add_resource": return showResourcePasteForm(args.resourceInput || args.url || "");
            default: {
                const task = directSmartTask(action);
                if (!task) {
                    const section = action.skill.includes("reminder") ? "reminders"
                        : action.skill.includes("directory") ? "directory"
                            : action.skill.includes("resource") ? "resources"
                                : action.skill.includes("intake") ? "intakes" : "encounters";
                    return missingSmartTarget(section);
                }
                return runAction(trigger, task.task, {
                    busyLabel: "Saving…",
                    success: task.success
                });
            }
        }
    }

    function presentSmartPlan(plan) {
        const actionsList = Array.isArray(plan?.actions) ? plan.actions : [];
        const content = actionsList.length ? recordList(actionsList.map((action) => {
            const presentation = smartActionPresentation(action);
            return record({
                title: presentation.title,
                meta: presentation.meta,
                buttons: [actionButton(smartActionLabel(action.skill), (button) => runSmartAction(action, button), {
                    tone: presentation.tone
                })]
            });
        })) : null;
        const message = [plan?.reply, plan?.clarification].map(clean).filter(Boolean).join(" ")
            || "I’m ready for your next request.";
        say(message, {
            content,
            buttons: actionsList.length ? [actionButton("Menu", () => showMainMenu(), { tone: "secondary" })] : menuButtons()
        });
        assistantHistory = [...assistantHistory, { role: "assistant", text: message }].slice(-6);
    }

    function routeGuidedText(text) {
        const lower = normalized(text);
        if (/new reminder|add reminder|remind me/.test(lower)) showReminderForm();
        else if (/add (a )?(contact|therapist|person)|new contact/.test(lower)) showDirectoryForm();
        else if (/add (a )?resource|new resource/.test(lower)) showResourcePasteForm();
        else if (/log (a )?meeting|record (a )?meeting|met with/.test(lower)) chooseEncounterSource("completed");
        else if (/remind|todo|task/.test(lower)) showReminders({ announce: false });
        else if (/schedule|appointment/.test(lower)) chooseEncounterSource("scheduled");
        else if (/meeting|encounter|met with/.test(lower)) showEncounters({ announce: false });
        else if (/contact|directory|therapist|phone/.test(lower)) showDirectory({ announce: false });
        else if (/resource|youtube|amazon|itorah|torahanytime/.test(lower)) showResources({ announce: false });
        else if (/intake|form/.test(lower)) showIntakes({ announce: false });
        else if (/today|attention|what.*next/.test(lower)) showToday({ announce: false });
        else return false;
        return true;
    }

    async function handleSmartText(text) {
        if (smartBusy) {
            say("I’m still handling your last message. Give me one moment.");
            return;
        }
        smartBusy = true;
        const submitButton = composer.querySelector('button[type="submit"]');
        composerInput.disabled = true;
        if (submitButton) submitButton.disabled = true;
        setSmartStatus("busy", "Gemini is reading your request…");
        const thinking = say("One moment — I’m putting that into a safe, reviewable action.", { quiet: true });
        try {
            const plan = await actions.askAssistant({
                message: text,
                history: assistantHistory
            });
            thinking.row.remove();
            assistantHistory = [...assistantHistory, { role: "user", text }].slice(-6);
            setSmartStatus("ready", "Gemini ready · confirms before saving");
            presentSmartPlan(plan);
        } catch (error) {
            thinking.row.remove();
            console.warn("Smart assistant unavailable:", error);
            setSmartStatus("error", "Guided mode · Gemini needs attention");
            say(error?.userMessage || "The Smart assistant couldn’t respond, so I switched to the guided assistant.");
            if (!routeGuidedText(text)) showMainMenu({ announce: false });
        } finally {
            smartBusy = false;
            composerInput.disabled = false;
            if (submitButton) submitButton.disabled = false;
            window.setTimeout(() => composerInput.focus(), 0);
        }
    }

    function record({ title, meta = "", text = "", buttons = [], tag = "" }) {
        const item = element("section", "chat-record");
        const heading = element("div", "chat-record-heading");
        const titleNode = element("h3", "", title);
        heading.appendChild(titleNode);
        if (tag) heading.appendChild(element("span", "chat-record-tag", tag));
        item.appendChild(heading);
        if (meta) item.appendChild(element("p", "chat-record-meta", meta));
        if (text) item.appendChild(element("p", "chat-record-copy", text));
        if (buttons.length) {
            const controls = element("div", "chat-record-actions");
            controls.append(...buttons);
            item.appendChild(controls);
        }
        return item;
    }

    function recordList(items) {
        const list = element("div", "chat-record-list");
        list.append(...items);
        return list;
    }

    async function runAction(trigger, task, { busyLabel = "Working…", success = "Done.", after } = {}) {
        const idleLabel = trigger.textContent;
        trigger.disabled = true;
        trigger.textContent = busyLabel;
        try {
            const result = await task();
            say(success instanceof Function ? success(result) : success, {
                buttons: [actionButton("Back to menu", () => showMainMenu(), { tone: "secondary" })]
            });
            if (after) after(result);
            return result;
        } catch (error) {
            console.error("Chat action failed:", error);
            say(error?.userMessage || "I couldn’t save that. Check your connection and try again.", {
                buttons: [actionButton("Try another way", () => showMainMenu(), { tone: "secondary" })]
            });
            return null;
        } finally {
            if (trigger.isConnected) {
                trigger.disabled = false;
                trigger.textContent = idleLabel;
            }
        }
    }

    function confirmAction({ question, confirmLabel, onConfirm }) {
        say(question, {
            buttons: [
                actionButton(confirmLabel, (button) => onConfirm(button), { tone: "danger" }),
                actionButton("Keep it", () => say("Nothing was changed.", { buttons: menuButtons() }), { tone: "secondary" })
            ]
        });
    }

    function reminderRecord(reminder) {
        const buttons = [];
        if (reminder.type === "submission") {
            buttons.push(actionButton("Schedule meeting", () => showEncounterForm({ encounterType: "scheduled", submission: reminder.submission })));
        } else if (reminder.type === "encounter") {
            buttons.push(actionButton("Schedule follow-up", () => showEncounterForm({ encounterType: "scheduled", encounter: reminder.encounter })));
        } else if (reminder.type === "scheduled") {
            buttons.push(actionButton("Record outcome", () => showEncounterForm({ encounterType: "completed", existing: reminder.encounter, converting: true })));
        } else {
            buttons.push(actionButton("Edit", () => showReminderForm(reminder.manualReminder), { tone: "secondary" }));
        }
        buttons.push(actionButton("Tomorrow", (button) => runAction(button, () => actions.snoozeReminder(reminder), {
            busyLabel: "Snoozing…",
            success: "Okay — I’ll bring it back tomorrow."
        }), { tone: "secondary", ariaLabel: `Remind tomorrow about ${reminder.title}` }));
        if (reminder.type !== "scheduled") {
            buttons.push(actionButton("Taken care of", () => confirmAction({
                question: `Mark “${reminder.title}” as taken care of?`,
                confirmLabel: "Yes, done",
                onConfirm: (button) => runAction(button, () => actions.completeReminder(reminder), {
                    busyLabel: "Saving…",
                    success: "Done — I cleared that reminder."
                })
            }), { tone: "secondary" }));
        }

        const schedule = reminder.type === "manual"
            ? actions.formatReminderSchedule(reminder.manualReminder)
            : reminder.type === "scheduled"
                ? `Scheduled ${formatDate(reminder.encounter?.occurredDate, { includeWeekday: true })}${reminder.encounter?.occurredTime ? ` at ${formatTime(reminder.encounter.occurredTime)}` : ""}`
                : "Needs attention";
        return record({
            title: reminder.title,
            meta: schedule,
            text: reminder.detail || "",
            tag: reminder.type === "manual" ? "Personal" : reminder.type === "scheduled" ? "Scheduled" : "Follow-up",
            buttons
        });
    }

    function showToday({ announce = true } = {}) {
        currentSection = "today";
        const { reminders } = getState();
        if (announce) sayUser("What needs my attention?");
        if (!reminders.length) {
            say("You’re all caught up. I can still help you add something new.", {
                buttons: [
                    actionButton("New reminder", () => showReminderForm()),
                    actionButton("Schedule meeting", () => chooseEncounterSource("scheduled")),
                    ...menuButtons().slice(1)
                ]
            });
            return;
        }
        say(`${reminders.length} ${reminders.length === 1 ? "thing needs" : "things need"} your attention.`, {
            content: recordList(reminders.map(reminderRecord)),
            buttons: [actionButton("New reminder", () => showReminderForm()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
        });
    }

    function threadMeta(thread) {
        const meeting = thread.latest;
        const status = meeting.encounterType === "scheduled" ? "Scheduled" : meeting.needsFollowUp ? "Follow-up needed" : "Completed";
        return `${status} · ${formatDate(meeting.occurredDate)}${meeting.occurredTime ? ` at ${formatTime(meeting.occurredTime)}` : ""} · ${thread.meetings.length} ${thread.meetings.length === 1 ? "meeting" : "meetings"}`;
    }

    function showThread(thread) {
        sayUser(`Open ${thread.latest.names || "this encounter"}`);
        const meetings = [...thread.meetings].reverse().map((meeting) => {
            const scheduled = meeting.encounterType === "scheduled";
            const buttons = [
                actionButton(scheduled ? "Edit schedule" : "Edit", () => showEncounterForm({ existing: meeting, encounterType: meeting.encounterType }), { tone: "secondary" })
            ];
            if (scheduled) buttons.unshift(actionButton("Record outcome", () => showEncounterForm({ existing: meeting, encounterType: "completed", converting: true })));
            buttons.push(actionButton("Delete", () => confirmAction({
                question: `Delete this ${scheduled ? "scheduled " : ""}meeting with ${meeting.names}? This cannot be undone.`,
                confirmLabel: "Delete meeting",
                onConfirm: (button) => runAction(button, () => actions.deleteEncounter(meeting), {
                    busyLabel: "Deleting…",
                    success: "The meeting was deleted."
                })
            }), { tone: "danger" }));
            return record({
                title: scheduled ? "Scheduled meeting" : "Completed meeting",
                meta: `${formatDate(meeting.occurredDate, { includeWeekday: true })}${meeting.occurredTime ? ` · ${formatTime(meeting.occurredTime)}` : ""} · ${meeting.method}`,
                text: [meeting.contact, meeting.otherPeopleInvolved ? `With: ${meeting.otherPeopleInvolved}` : "", meeting.notes].filter(Boolean).join("\n") || "No extra details were added.",
                tag: meeting.needsFollowUp ? "Follow-up" : "",
                buttons
            });
        });
        say(`${thread.latest.names || "This couple"} has ${thread.meetings.length} ${thread.meetings.length === 1 ? "meeting" : "meetings"} in one timeline.`, {
            content: recordList(meetings),
            buttons: [
                actionButton("Log meeting", () => showEncounterForm({ encounterType: "completed", encounter: thread.latest })),
                actionButton("Schedule meeting", () => showEncounterForm({ encounterType: "scheduled", encounter: thread.latest })),
                actionButton(thread.archived ? "Restore timeline" : "Archive timeline", (button) => runAction(button, () => actions.setThreadArchived(thread, !thread.archived), {
                    busyLabel: thread.archived ? "Restoring…" : "Archiving…",
                    success: thread.archived ? "The full timeline is active again." : "The full timeline was archived."
                }), { tone: "secondary" }),
                actionButton("Back", () => showEncounters(), { tone: "secondary" })
            ]
        });
    }

    function showEncounters({ archived = false, announce = true } = {}) {
        currentSection = "encounters";
        const threads = getState().threads.filter((thread) => thread.archived === archived);
        if (announce) sayUser(archived ? "Show archived encounters" : "Show encounters");
        if (!threads.length) {
            say(archived ? "Nothing is archived." : "No active encounter timelines yet.", {
                buttons: archived
                    ? [actionButton("Active encounters", () => showEncounters()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
                    : [actionButton("Log meeting", () => chooseEncounterSource("completed")), actionButton("Schedule meeting", () => chooseEncounterSource("scheduled")), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
            });
            return;
        }
        const items = threads.map((thread) => record({
            title: thread.latest.names || "Unnamed encounter",
            meta: threadMeta(thread),
            text: thread.latest.notes || thread.meetings.find(({ notes }) => notes)?.notes || "No notes added.",
            tag: thread.latest.encounterType === "scheduled" ? "Scheduled" : "",
            buttons: [actionButton("Open timeline", () => showThread(thread))]
        }));
        say(archived ? "Here are your archived timelines." : "Here are your active couple timelines.", {
            content: recordList(items),
            buttons: [
                actionButton("Log meeting", () => chooseEncounterSource("completed")),
                actionButton("Schedule meeting", () => chooseEncounterSource("scheduled")),
                actionButton(archived ? "Active" : "Archived", () => showEncounters({ archived: !archived }), { tone: "secondary" }),
                actionButton("Menu", () => showMainMenu(), { tone: "secondary" })
            ]
        });
    }

    function chooseEncounterSource(encounterType) {
        const { threads, submissions } = getState();
        const scheduled = encounterType === "scheduled";
        sayUser(scheduled ? "Schedule a meeting" : "Log a meeting");
        const choices = threads.filter(({ archived }) => !archived).slice(0, 6).map((thread) =>
            actionButton(thread.latest.names || "Unnamed couple", () => showEncounterForm({ encounterType, encounter: thread.latest }), { tone: "secondary" })
        );
        if (scheduled) {
            submissions.filter((submission) => !threads.some(({ meetings }) => meetings.some(({ submissionId }) => submissionId === submission.id)))
                .slice(0, 4)
                .forEach((submission) => choices.push(actionButton(`${submissionNames(submission)} · intake`, () => showEncounterForm({ encounterType, submission }), { tone: "secondary" })));
        }
        choices.unshift(actionButton(scheduled ? "Someone new" : "New person or couple", () => showEncounterForm({ encounterType })));
        say(scheduled ? "Who is the meeting with? I can reuse details from an existing timeline or intake form." : "Who did you meet? I can reuse details from an existing timeline.", {
            buttons: [...choices, actionButton("Cancel", () => showMainMenu(), { tone: "secondary" })]
        });
    }

    function formShell({ title, description, submitLabel, onSubmit, secondaryButtons = [] }) {
        const wrap = element("div", "chat-form-wrap");
        const heading = element("div", "chat-form-heading");
        heading.appendChild(element("h3", "", title));
        if (description) heading.appendChild(element("p", "", description));
        const form = element("form", "chat-inline-form");
        const fields = element("div", "chat-form-grid");
        const status = element("p", "chat-form-status");
        status.hidden = true;
        const controls = element("div", "chat-form-actions");
        const submit = element("button", "chat-action chat-action-primary", submitLabel);
        submit.type = "submit";
        controls.append(submit, ...secondaryButtons);
        form.append(fields, status, controls);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            status.hidden = true;
            const idle = submit.textContent;
            submit.disabled = true;
            submit.textContent = "Saving…";
            try {
                await onSubmit(new FormData(form), form);
            } catch (error) {
                console.error("Chat form failed:", error);
                status.textContent = error?.userMessage || "I couldn’t save that. Check your connection and try again.";
                status.dataset.tone = "error";
                status.hidden = false;
            } finally {
                if (submit.isConnected) {
                    submit.disabled = false;
                    submit.textContent = idle;
                }
            }
        });
        wrap.append(heading, form);
        return { wrap, form, fields, status, submit };
    }

    function showEncounterForm({ encounterType = "completed", encounter = null, submission = null, existing = null, converting = false, draft = null } = {}) {
        const basePrefill = existing
            ? { ...existing, encounterType }
            : actions.encounterPrefill({ encounter, submission, encounterType });
        const prefill = { ...basePrefill };
        if (draft) {
            ["names", "contact", "otherPeopleInvolved", "occurredDate", "occurredTime", "method", "notes"].forEach((key) => {
                if (clean(draft[key])) prefill[key] = clean(draft[key]);
            });
            if (typeof draft.needsFollowUp === "boolean") prefill.needsFollowUp = draft.needsFollowUp;
        }
        const scheduled = encounterType === "scheduled";
        const editing = Boolean(existing);
        sayUser(editing ? (converting ? "Record meeting outcome" : "Edit meeting") : scheduled ? "Schedule meeting" : "Log meeting");
        const { wrap, fields, form } = formShell({
            title: editing
                ? converting ? `Record meeting with ${prefill.names}` : `Edit ${scheduled ? "scheduled " : ""}meeting`
                : `${scheduled ? "Schedule" : "Log"} ${prefill.names ? `with ${prefill.names}` : "a meeting"}`,
            description: scheduled
                ? "A name and date are all you need. Everything else can stay blank."
                : "A name is all you need. Add only what is worth remembering.",
            submitLabel: editing ? (converting ? "Save as completed" : "Save changes") : scheduled ? "Schedule meeting" : "Save meeting",
            onSubmit: async (data) => {
                const names = clean(data.get("names"));
                const occurredDate = clean(data.get("occurredDate"));
                if (!names) throw Object.assign(new Error("Name required"), { userMessage: "Add at least one name before saving." });
                if (scheduled && !occurredDate) throw Object.assign(new Error("Date required"), { userMessage: "Choose the scheduled date before saving." });
                const payload = {
                    encounterType,
                    names,
                    contact: clean(data.get("contact")),
                    otherPeopleInvolved: clean(data.get("otherPeopleInvolved")),
                    occurredDate,
                    occurredTime: clean(data.get("occurredTime")),
                    method: clean(data.get("method")) || "In person",
                    notes: clean(data.get("notes")),
                    needsFollowUp: !scheduled && data.get("needsFollowUp") === "on",
                    submissionId: prefill.submissionId || "",
                    rootEncounterId: prefill.rootEncounterId || "",
                    previousEncounterId: prefill.previousEncounterId || ""
                };
                const saved = await actions.saveEncounter(payload, existing);
                form.closest(".chat-message-row")?.classList.add("is-complete");
                say(editing
                    ? converting ? "The scheduled meeting is now recorded as completed." : "The meeting was updated."
                    : scheduled ? "Meeting scheduled. I’ll place it in the same couple timeline and remind you that day." : "Meeting saved in the couple timeline.", {
                    buttons: [actionButton("Open encounters", () => showEncounters()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
                });
                return saved;
            },
            secondaryButtons: [actionButton("Cancel", () => showMainMenu(), { tone: "secondary" })]
        });

        const names = textInput({ name: "names", value: prefill.names || "", placeholder: "Name or couple", required: true, maxLength: 240, autocomplete: "name" });
        fields.appendChild(labeledField("Name or couple", names, { wide: true }));
        if (scheduled || converting) {
            const date = textInput({ name: "occurredDate", type: "date", value: prefill.occurredDate || "", required: scheduled });
            const time = textInput({ name: "occurredTime", type: "time", value: prefill.occurredTime || "" });
            fields.append(labeledField(scheduled ? "Scheduled date" : "Date", date), labeledField("Time", time, { optional: true }));
        } else {
            const date = textInput({ name: "occurredDate", type: "date", value: prefill.occurredDate || "" });
            const time = textInput({ name: "occurredTime", type: "time", value: prefill.occurredTime || "" });
            fields.append(labeledField("Date", date, { optional: true }), labeledField("Time", time, { optional: true }));
        }
        fields.appendChild(labeledField("Notes", textArea({ name: "notes", value: prefill.notes || "", placeholder: "Anything worth remembering", maxLength: 5000 }), { optional: true, wide: true }));

        const details = element("details", "chat-more-fields");
        const summary = element("summary", "", "Contact and other details");
        const detailsGrid = element("div", "chat-form-grid");
        detailsGrid.append(
            labeledField("Contact info", textInput({ name: "contact", value: prefill.contact || "", placeholder: "Phone or email", maxLength: 500, autocomplete: "tel" }), { optional: true, wide: true }),
            labeledField("Other people involved", textInput({ name: "otherPeopleInvolved", value: prefill.otherPeopleInvolved || "", placeholder: "Rabbi, counselor, family member", maxLength: 500 }), { optional: true, wide: true }),
            labeledField("How you connected", selectInput({ name: "method", value: prefill.method || "In person", options: contactMethods }), { wide: true })
        );
        details.append(summary, detailsGrid);
        fields.appendChild(details);

        if (!scheduled) {
            const followup = element("label", "chat-check chat-field-wide");
            const checkbox = textInput({ name: "needsFollowUp", type: "checkbox" });
            checkbox.checked = prefill.needsFollowUp === true;
            const copy = element("span");
            copy.append(element("strong", "", "Needs a follow-up"), element("small", "", "Keep this in Reminders until it is handled."));
            followup.append(copy, checkbox);
            fields.appendChild(followup);
        }
        say("Fill in what you know. You can leave every optional field blank.", { content: wrap });
        window.setTimeout(() => names.focus(), 0);
    }

    function showReminders({ announce = true } = {}) {
        currentSection = "reminders";
        const { reminders, notificationEnabled, notificationPreferences = {}, notificationsSupported } = getState();
        if (announce) sayUser("Show reminders");
        const buttons = [actionButton("New reminder", () => showReminderForm())];
        if (notificationsSupported) {
            buttons.push(actionButton(notificationEnabled ? "Send notification test" : "Enable notifications", (button) => runAction(
                button,
                notificationEnabled ? actions.testNotifications : actions.enableNotifications,
                {
                    busyLabel: notificationEnabled ? "Sending…" : "Enabling…",
                    success: notificationEnabled ? "Test notification sent. It should arrive in a few seconds." : "Notifications are on. I sent a private test notification."
                }
            ), { tone: "secondary" }));
            if (notificationEnabled) {
                const meetingAlertsOn = notificationPreferences.notifyScheduledEncounters !== false;
                const intakeAlertsOn = notificationPreferences.notifyNewIntakes !== false;
                buttons.push(actionButton(`Meeting alerts: ${meetingAlertsOn ? "on" : "off"}`, (button) => runAction(
                    button,
                    () => actions.setNotificationPreference("notifyScheduledEncounters", !meetingAlertsOn),
                    {
                        busyLabel: "Saving…",
                        success: `Scheduled meeting notifications are ${meetingAlertsOn ? "off" : "on"} for this device.`,
                        after: () => showReminders({ announce: false })
                    }
                ), { tone: "secondary" }));
                buttons.push(actionButton(`New form alerts: ${intakeAlertsOn ? "on" : "off"}`, (button) => runAction(
                    button,
                    () => actions.setNotificationPreference("notifyNewIntakes", !intakeAlertsOn),
                    {
                        busyLabel: "Saving…",
                        success: `New intake form notifications are ${intakeAlertsOn ? "off" : "on"} for this device.`,
                        after: () => showReminders({ announce: false })
                    }
                ), { tone: "secondary" }));
                buttons.push(actionButton("Turn off notifications", (button) => runAction(button, actions.disableNotifications, {
                    busyLabel: "Turning off…",
                    success: "Background notifications are off for this device."
                }), { tone: "secondary" }));
            }
        }
        buttons.push(actionButton("Menu", () => showMainMenu(), { tone: "secondary" }));
        say(reminders.length ? `You have ${reminders.length} active ${reminders.length === 1 ? "reminder" : "reminders"}.` : "You have no active reminders.", {
            content: reminders.length ? recordList(reminders.map(reminderRecord)) : null,
            buttons
        });
    }

    function showReminderForm(reminder = null, draft = null) {
        const values = { ...(reminder || {}), ...(draft || {}) };
        if (clean(draft?.date)) values.dueDate = clean(draft.date);
        if (clean(draft?.time)) values.dueTime = clean(draft.time);
        sayUser(reminder ? `Edit ${reminder.title}` : "Add a reminder");
        const secondaryButtons = [actionButton("Cancel", () => showReminders(), { tone: "secondary" })];
        if (reminder) secondaryButtons.push(actionButton("Delete", () => confirmAction({
            question: `Delete “${reminder.title}”? This cannot be undone.`,
            confirmLabel: "Delete reminder",
            onConfirm: (button) => runAction(button, () => actions.deleteReminder(reminder), {
                busyLabel: "Deleting…",
                success: `${reminder.title} was deleted.`
            })
        }), { tone: "danger" }));
        const { wrap, fields, form } = formShell({
            title: reminder ? "Edit reminder" : "New reminder",
            description: "Only the reminder name is required.",
            submitLabel: "Save reminder",
            secondaryButtons,
            onSubmit: async (data) => {
                const title = clean(data.get("title"));
                if (!title) throw Object.assign(new Error("Title required"), { userMessage: "Add a short reminder name before saving." });
                await actions.saveReminder({
                    title,
                    dueDate: clean(data.get("dueDate")),
                    dueTime: clean(data.get("dueTime")),
                    description: clean(data.get("description"))
                }, reminder);
                form.closest(".chat-message-row")?.classList.add("is-complete");
                say(reminder ? `${title} was updated.` : `${title} was added to your reminders.`, {
                    buttons: [actionButton("View reminders", () => showReminders()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
                });
            }
        });
        const title = textInput({ name: "title", value: values.title || "", placeholder: "What should I remind you about?", required: true, maxLength: 240 });
        fields.append(
            labeledField("Reminder", title, { wide: true }),
            labeledField("Date", textInput({ name: "dueDate", type: "date", value: values.dueDate || values.date || "" }), { optional: true }),
            labeledField("Time", textInput({ name: "dueTime", type: "time", value: values.dueTime || values.time || "" }), { optional: true }),
            labeledField("Description", textArea({ name: "description", value: values.description || "", placeholder: "Anything useful when you handle it", maxLength: 3000 }), { optional: true, wide: true })
        );
        say("Here’s a short reminder form.", { content: wrap });
        window.setTimeout(() => title.focus(), 0);
    }

    function showDirectory({ filter = "All", query = "", announce = true } = {}) {
        currentSection = "directory";
        const state = getState();
        const normalizedQuery = clean(query).toLocaleLowerCase();
        const entries = state.directoryEntries.filter((entry) => {
            const typeMatches = filter === "All" || entry.type === filter;
            const searchMatches = !normalizedQuery || [entry.name, entry.phone, entry.email, entry.url, entry.notes]
                .some((value) => clean(value).toLocaleLowerCase().includes(normalizedQuery));
            return typeMatches && searchMatches;
        });
        if (announce) sayUser(query ? `Find ${query}` : filter === "All" ? "Open directory" : `Show ${filter.toLocaleLowerCase()}s`);
        const items = entries.map((entry) => {
            const buttons = [];
            const phone = clean(entry.phone).replace(/[^\d+]/g, "");
            if (/\d/.test(phone)) buttons.push(actionLink("Call", `tel:${phone}`, `Call ${entry.name}`), actionLink("Text", `sms:${phone}`, `Text ${entry.name}`));
            if (entry.email) buttons.push(actionLink("Email", `mailto:${entry.email}`, `Email ${entry.name}`));
            if (entry.url) buttons.push(actionLink("Open", entry.url, `Open ${entry.name}`));
            buttons.push(actionButton("Edit", () => showDirectoryForm(entry), { tone: "secondary" }));
            buttons.push(actionButton("Delete", () => confirmAction({
                question: `Delete ${entry.name} from your directory? This cannot be undone.`,
                confirmLabel: "Delete entry",
                onConfirm: (button) => runAction(button, () => actions.deleteDirectoryEntry(entry), {
                    busyLabel: "Deleting…",
                    success: `${entry.name} was deleted from your directory.`
                })
            }), { tone: "danger" }));
            return record({
                title: entry.name,
                tag: entry.type,
                meta: [entry.phone, entry.email].filter(Boolean).join(" · ") || (entry.url ? new URL(entry.url).hostname : "No contact details"),
                text: entry.notes,
                buttons
            });
        });
        say(entries.length ? `I found ${entries.length} ${entries.length === 1 ? "entry" : "entries"}.` : query ? `I couldn’t find “${query}” in your directory.` : "Your directory is empty here.", {
            content: entries.length ? recordList(items) : null,
            buttons: [
                actionButton("Add entry", () => showDirectoryForm()),
                actionButton("Find someone", () => setPendingText("Type a name, phone number, specialty, or note.", (value) => showDirectory({ query: value }), "Search your directory"), { tone: "secondary" }),
                actionButton("Therapists", () => showDirectory({ filter: "Therapist" }), { tone: "secondary" }),
                actionButton("People", () => showDirectory({ filter: "Person" }), { tone: "secondary" }),
                actionButton("Resources", () => showDirectory({ filter: "Resource" }), { tone: "secondary" }),
                actionButton("Menu", () => showMainMenu(), { tone: "secondary" })
            ]
        });
    }

    function showDirectoryForm(entry = null, draft = null) {
        const values = { ...(entry || {}), ...(draft || {}) };
        sayUser(entry ? `Edit ${entry.name}` : "Add a directory entry");
        const { wrap, fields, form } = formShell({
            title: entry ? "Edit directory entry" : "Add to your directory",
            description: "A name is all you need. Contact details can be added now or later.",
            submitLabel: "Save entry",
            secondaryButtons: [actionButton("Cancel", () => showDirectory(), { tone: "secondary" })],
            onSubmit: async (data) => {
                const name = clean(data.get("name"));
                if (!name) throw Object.assign(new Error("Name required"), { userMessage: "Add a name or resource title before saving." });
                await actions.saveDirectoryEntry({
                    name,
                    type: clean(data.get("type")) || "Therapist",
                    phone: clean(data.get("phone")),
                    email: clean(data.get("email")),
                    url: clean(data.get("url")),
                    notes: clean(data.get("notes"))
                }, entry);
                form.closest(".chat-message-row")?.classList.add("is-complete");
                say(`${name} was saved to your directory.`, {
                    buttons: [actionButton("Open directory", () => showDirectory()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
                });
            }
        });
        const name = textInput({ name: "name", value: values.name || values.names || values.title || "", placeholder: "Name or resource", required: true, maxLength: 240 });
        fields.append(
            labeledField("Name or resource", name, { wide: true }),
            labeledField("Type", selectInput({ name: "type", value: values.type || "Therapist", options: ["Therapist", "Person", "Resource"] }), { wide: true })
        );
        const details = element("details", "chat-more-fields chat-field-wide");
        details.appendChild(element("summary", "", "Contact details and note"));
        const grid = element("div", "chat-form-grid");
        grid.append(
            labeledField("Phone", textInput({ name: "phone", type: "tel", value: values.phone || "", placeholder: "Phone number", maxLength: 80, autocomplete: "tel" }), { optional: true }),
            labeledField("Email", textInput({ name: "email", type: "email", value: values.email || "", placeholder: "name@example.com", maxLength: 254, autocomplete: "email" }), { optional: true }),
            labeledField("Website", textInput({ name: "url", type: "text", value: values.url || "", placeholder: "example.com", maxLength: 2048 }), { optional: true, wide: true }),
            labeledField("Quick note", textArea({ name: "notes", value: values.notes || values.description || "", placeholder: "Specialty, how you know them, or why this is useful", maxLength: 3000 }), { optional: true, wide: true })
        );
        details.appendChild(grid);
        fields.appendChild(details);
        say("Fill in whatever you have.", { content: wrap });
        window.setTimeout(() => name.focus(), 0);
    }

    function showResources({ announce = true } = {}) {
        currentSection = "resources";
        const resources = getState().resources;
        if (announce) sayUser("Open resources");
        const items = resources.map((resource) => record({
            title: resource.title,
            tag: actions.resourceTypeLabel(resource),
            meta: [actions.resourceProviderName(resource), resource.speaker].filter(Boolean).join(" · "),
            buttons: [
                actionLink("Open", resource.primaryUrl, `Open ${resource.title}`),
                actionButton("Remove", () => confirmAction({
                    question: `Remove “${resource.title}” from the public library?`,
                    confirmLabel: "Remove resource",
                    onConfirm: (button) => runAction(button, () => actions.deleteResource(resource), {
                        busyLabel: "Removing…",
                        success: `“${resource.title}” was removed from the public library.`
                    })
                }), { tone: "danger" })
            ]
        }));
        say(resources.length ? `${resources.length} ${resources.length === 1 ? "resource was" : "resources were"} published from this app.` : "No admin-created resources have been published yet.", {
            content: resources.length ? recordList(items) : null,
            buttons: [actionButton("Add resource", () => showResourcePasteForm()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
        });
    }

    function showResourcePasteForm(draft = "") {
        sayUser("Add a resource");
        const { wrap, fields, form, submit } = formShell({
            title: "Paste a resource link",
            description: "YouTube, TorahAnytime, Amazon, and iTorah are supported.",
            submitLabel: "Review resource",
            secondaryButtons: [actionButton("Cancel", () => showResources(), { tone: "secondary" })],
            onSubmit: async (data) => {
                const pasted = clean(data.get("pasted"));
                if (!pasted) throw Object.assign(new Error("Link required"), { userMessage: "Paste a supported link or TorahAnytime text first." });
                submit.textContent = "Reading link…";
                const resource = await actions.prepareResource(pasted);
                form.closest(".chat-message-row")?.classList.add("is-complete");
                showResourceReview(resource);
            }
        });
        const pasted = textArea({ name: "pasted", value: draft, placeholder: "Paste the link or complete TorahAnytime text", required: true, rows: 5 });
        fields.appendChild(labeledField("Resource link or text", pasted, { wide: true }));
        say("Send me the link and I’ll prepare the details for review.", { content: wrap });
        window.setTimeout(() => pasted.focus(), 0);
    }

    function showResourceReview(resource) {
        const { wrap, fields, form } = formShell({
            title: "Review before publishing",
            description: `${actions.resourceProviderName(resource)} content recognized. Change anything the public should see differently.`,
            submitLabel: "Publish resource",
            secondaryButtons: [actionButton("Start over", () => showResourcePasteForm(), { tone: "secondary" })],
            onSubmit: async (data) => {
                const edits = Object.fromEntries([...data.entries()].map(([key, value]) => [key, clean(value)]));
                const saved = await actions.publishResource(resource, edits);
                form.closest(".chat-message-row")?.classList.add("is-complete");
                say(`“${saved.title}” is now in the public resource library.`, {
                    buttons: [actionButton("View resources", () => showResources()), actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
                });
            }
        });
        fields.append(
            labeledField("Title", textInput({ name: "title", value: resource.title, required: true, maxLength: 240 }), { wide: true }),
            labeledField("Speaker or author", textInput({ name: "speaker", value: resource.speaker, maxLength: 180 }), { optional: true }),
            labeledField("Button label", textInput({ name: "primaryLabel", value: resource.primaryLabel, required: true, maxLength: 80 })),
            labeledField("Destination URL", textInput({ name: "primaryUrl", type: "url", value: resource.primaryUrl, required: true, maxLength: 2048 }), { wide: true }),
            labeledField("Image URL", textInput({ name: "imageUrl", type: "url", value: resource.imageUrl, required: true, maxLength: 2048 }), { wide: true }),
            labeledField("Image description", textInput({ name: "imageAlt", value: resource.imageAlt, maxLength: 300 }), { optional: true, wide: true })
        );
        if (resource.source === "youtube") {
            fields.appendChild(labeledField("Playback URL", textInput({ name: "embedUrl", type: "url", value: resource.embedUrl, maxLength: 2048 }), { optional: true, wide: true }));
        }
        if (resource.source === "torahanytime") {
            fields.append(
                labeledField("Dial-in number", textInput({ name: "dialIn", type: "tel", value: resource.dialIn, maxLength: 40 }), { optional: true }),
                labeledField("Press extension", textInput({ name: "extension", value: resource.extension, maxLength: 20 }), { optional: true })
            );
        }
        const preview = record({
            title: resource.title,
            meta: `${actions.resourceTypeLabel(resource)} · ${actions.resourceProviderName(resource)}`,
            text: resource.speaker || "",
            buttons: [actionLink("Test link", resource.primaryUrl, `Test ${resource.title}`)]
        });
        wrap.prepend(preview);
        say("I prepared the public details. Review them once, then publish.", { content: wrap });
    }

    function showIntakes({ announce = true } = {}) {
        currentSection = "intakes";
        const submissions = getState().submissions;
        if (announce) sayUser("Show intake forms");
        const items = submissions.map((submission) => {
            const data = submission.data || {};
            const submitted = Date.parse(data.timestamp || "");
            return record({
                title: submissionNames(submission),
                meta: Number.isNaN(submitted) ? "Date unavailable" : new Date(submitted).toLocaleString(),
                text: [data.issue_presenting, data.anyone_else_involved ? `Others involved: ${data.anyone_else_involved}` : ""].filter(Boolean).join("\n"),
                buttons: [
                    actionButton("View details", () => showIntakeDetails(submission)),
                    actionButton("Schedule meeting", () => showEncounterForm({ encounterType: "scheduled", submission })),
                    actionButton("Delete", () => confirmAction({
                        question: `Permanently delete the intake for ${submissionNames(submission)}? This cannot be undone.`,
                        confirmLabel: "Delete intake",
                        onConfirm: (button) => runAction(button, () => actions.deleteSubmission(submission), {
                            busyLabel: "Deleting…",
                            success: "The intake form was permanently deleted."
                        })
                    }), { tone: "danger" })
                ]
            });
        });
        say(submissions.length ? `${submissions.length} ${submissions.length === 1 ? "intake form is" : "intake forms are"} available.` : "There are no intake forms right now.", {
            content: submissions.length ? recordList(items) : null,
            buttons: [actionButton("Menu", () => showMainMenu(), { tone: "secondary" })]
        });
    }

    function showIntakeDetails(submission) {
        sayUser(`Open ${submissionNames(submission)}`);
        const list = element("dl", "chat-detail-list");
        Object.entries(submission.data || {}).forEach(([key, value]) => {
            if (["uid", "timestamp"].includes(key) || value === "" || value === null || value === undefined) return;
            const group = element("div");
            group.append(
                element("dt", "", actions.submissionLabel(key)),
                element("dd", "", actions.submissionValue(key, value))
            );
            list.appendChild(group);
        });
        say(`Here are the details from ${submissionNames(submission)}’s intake.`, {
            content: list,
            buttons: [
                actionButton("Schedule meeting", () => showEncounterForm({ encounterType: "scheduled", submission })),
                actionButton("Back to intakes", () => showIntakes(), { tone: "secondary" })
            ]
        });
    }

    function handleFreeText(value) {
        const text = clean(value);
        if (!text) return;
        sayUser(text);
        if (pendingTextAction) {
            const action = pendingTextAction;
            pendingTextAction = null;
            composerInput.placeholder = "Message the assistant";
            action(text);
            return;
        }
        const lower = text.toLocaleLowerCase();
        if (/^(menu|help|home)$/.test(lower)) return showMainMenu({ announce: false });
        if (/^(today|encounters?|reminders?|directory|resources?|intake forms?|intakes)$/.test(lower)) {
            routeGuidedText(text);
            return;
        }
        if (actions.askAssistant) {
            handleSmartText(text);
            return;
        }
        if (!routeGuidedText(text)) {
            say("I work best with a short command or one of these buttons. Try “new reminder,” “schedule meeting,” “find a contact,” or choose below.", { buttons: menuButtons() });
        }
    }

    composer.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = composerInput.value;
        composerInput.value = "";
        handleFreeText(value);
    });
    menuButton.addEventListener("click", () => showMainMenu());

    function start({ section = "today" } = {}) {
        if (!initialized) {
            initialized = true;
            conversation.replaceChildren();
            const greeting = say("Hi — write naturally or use a button. I’ll understand the request, reuse what you already entered, and show every change before saving.", {
                title: "How can I help?",
                buttons: menuButtons()
            });
            liveSummary = element("p", "chat-live-summary", summaryText());
            greeting.bubble.insertBefore(liveSummary, greeting.bubble.querySelector(".chat-message-actions"));
        }
        if (CHAT_SECTIONS.includes(section) && section !== currentSection) showSection(section, { announce: false });
        updateLiveSummary();
    }

    function showSection(section, { announce = true } = {}) {
        const state = getState();
        const ready = section === "resources" ? state.resourcesLoaded : section === "today" ? true : state.organizerLoaded;
        currentSection = section;
        if (!ready) {
            pendingSection = section;
            if (announce) sayUser(`Open ${section === "intakes" ? "intake forms" : section}`);
            say("I’m loading the latest information. I’ll show it here as soon as it is ready.");
            return;
        }
        pendingSection = null;
        const routes = {
            today: showToday,
            encounters: showEncounters,
            reminders: showReminders,
            directory: showDirectory,
            resources: showResources,
            intakes: showIntakes
        };
        (routes[section] || showToday)({ announce });
    }

    function refresh() {
        updateLiveSummary();
        if (pendingSection) {
            const state = getState();
            const ready = pendingSection === "resources" ? state.resourcesLoaded : state.organizerLoaded;
            if (ready) {
                const section = pendingSection;
                pendingSection = null;
                showSection(section, { announce: false });
            }
        }
    }

    return { start, refresh, showSection, showMainMenu };
}
