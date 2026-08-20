---
version: 1
slug: "admin-index-html"
primary_target: "admin/index.html"
related_targets: ["content-resource-tools.mjs","admin/organizer-tools.mjs","firestore.rules","admin/manifest.webmanifest","admin/service-worker.js"]
---

Mode: Operate

Status: Shipped. Finish-review disposition: ship; the organizer implementation and its durable design records agree.

Surface seed: `b24dcaf2`.

Purpose: Give the site owner one calm secretary for link-only shalom bayit resources, connected encounters, intake forms, and only the follow-up reminders that still matter. The owner should see the next natural action and record only what is worth remembering.

Visual authority: Code-led implementation with no approved comp. Preserve the established plum admin identity; this surface is an additional Operate-mode system and does not inherit or replace the public site’s Calm Threshold composition.

Visual world: Calm operations console. Deep plum (`#3f1f33`) frames access and navigation; operational plum (`#6f3157`) carries primary action; soft plum (`#f1e6ed`) supports guidance. The working canvas is quiet gray-green (`#f1f4f2`) with white surfaces, near-black ink (`#17232c`), muted copy (`#64717a`), subtle lines (`#d8dfdd`), and strong input lines (`#c5cfcc`). Sage (`#dcebe4` / `#235c46`) communicates reassurance, blue (`#e6f0f5` / `#2e627d`) identifies review and information states, success uses `#176b45` on `#e3f2ea`, errors use `#9a2d33` on `#f9e6e7`, and focus uses `#9a527b`.

Typography: Inter, weights 400–700, with the shipped system-sans fallback stack. The workspace base is `15px / 1.5`; headings are compact with slight negative tracking, labels are sentence case and high-clarity, and navigation counts use tabular numerals.

Structure: One-time device unlock, then a shell with Resources, Encounters, and Reminders tabs. Desktop uses a persistent navigation rail, sticky workspace header, and centered content area. Resources leads with a supported-source publishing composer, an editable review-before-publish state, and the app-created resource list. Encounters leads with one clear New encounter action, the compact Active / Intake forms / Archived switch, and connected meeting threads. Reminders contains only unresolved intake or latest-meeting follow-ups.

Primary task path: Unlock once → choose Resources, Encounters, or Reminders → publish a resource, log or continue a conversation, or act on a current follow-up → receive explicit success, error, loading, or empty feedback. Resources specifically follows paste → recognize → review and edit → publish; the review state is a required checkpoint rather than a decorative preview.

Desktop layout: The full-height rail is `272px`, tightening to `232px` below `1050px`; the sticky header is `82px` high and the workspace is capped at `1320px`. The resource composer splits guidance and input at `0.72fr / 1.28fr`; review splits sticky media and the editor at `0.62fr / 1.38fr`. Encounter entry uses two columns with wide identity, contact, Notes, and follow-up rows. Thread summaries place the current context opposite actions; intake details use three columns, then two below `1050px`.

Responsive behavior: Below `820px`, the rail becomes a fixed, thumb-reachable three-tab bottom bar with safe-area insets; brand/footer content and tab counts leave the compact bar. Focused text inputs and textareas move the bar below the keyboard area. Below `720px`, login and resource publishing surfaces stack and preview media stops sticking. Below `620px`, encounter entry, thread summaries, reminder overviews, and meeting entries become one column. Below `520px`, resource review fields and action groups become one column, buttons become full-width, removal actions get their own row, and header utility buttons collapse to icons. Preserve every workflow from `320px` upward.

Component language: Use white working groups with one low ambient shadow, neutral dividers for dense lists, `10–11px` control corners, `13–16px` surface corners, and pills only for counts, provider labels, metadata, follow-up state, and assurance notes. Primary buttons are plum/white with modest lift; secondary buttons are white with a neutral border; quiet buttons hold install and lock utilities; destructive buttons use restrained red. Inputs use off-white fill, strong neutral border, plum caret, and a four-pixel translucent plum focus halo. Organizer switches, encounter/reminder/intake actions, and meeting-timeline summaries retain at least a `44px` touch height.

Navigation behavior: The Resources / Encounters / Reminders tabs expose selected state and panel relationships, support arrow-key cycling, persist the last selected tab in local storage, and mirror Encounters or Reminders in the URL. Counts represent admin-created resources, active encounter threads, and current reminders. The header title and description follow the active tab; mobile keeps all three destinations as bottom tabs.

State contract: Keep visible keyboard focus, `aria-live` status feedback, `aria-busy` loading buttons, loading and empty states, validation focus, duplicate detection, confirmed destructive actions, and explicit publish/remove/save/archive/restore/remind/resolve/delete outcomes. The desktop header exposes Connected or Offline state. Local organizer review at `?preview=1` on localhost carries a visible “Preview data” label, representative intake and threaded-encounter records, and local-only organizer mutations. Reduced-motion preference collapses nonessential animation and replaces smooth review and encounter-form scrolling with an immediate move.

Install and offline contract: The page is an installable PWA with browser prompt handling, iPhone/iPad “Add to Home Screen” guidance, standalone safe-area handling, icons, manifest shortcuts for Resources, Encounters, and Reminders, and a service-worker-cached app shell. Offline shell availability does not promise offline Firebase publishing, encounter, intake, or reminder mutations.

Remembered access contract: A successful password check stores a browser-local one-time unlock and establishes local Firebase auth persistence. Returning visits restore the workspace without another password when possible. “Lock app” clears both remembered unlock and tab state, signs out, returns to the password gate, and restores password focus. If storage is unavailable, the active session can continue but is not remembered.

Resources contract: Baked resources remain the frontend baseline. Admin additions store links and remote metadata only and reuse the public resource renderer. Supported inputs are YouTube including Shorts/mobile URLs, the exact TorahAnytime multiline format, the first Amazon product URL, and iTorah lecture URLs. Every publishable presentation field can be edited during review; detected provider, content type, and internal ID remain locked. Photos remain baked-only.

Encounter contract: A name is enough to save; contact, date, time, contact method, Notes, and follow-up are optional. The Notes prompt is “Anything worth remembering.” A new meeting carries the current thread’s names, contact, method, intake link, thread identity, and follow-up decision, supplies the current date and time, and leaves Notes blank for only what changed. The UI groups meetings by root encounter, summarizes the latest meeting, and keeps the complete history in an expandable timeline. Archiving or restoring updates the whole thread; individual meeting deletion stays confirmed and irreversible.

Intake handoff contract: Intake forms are a view inside Encounters, not a top-level tab. “Log encounter” pre-fills names, all available phone/email details, the presenting issue into Notes, current date and time, Phone as the starting method, and follow-up on. Once an encounter links to an intake, its intake reminder is suppressed, but the source intake remains visible until explicitly deleted.

Reminder contract: Every unlinked, unresolved intake may create one reminder. Every active encounter thread may create at most one reminder, derived only from its newest meeting; older follow-up flags never survive as duplicate work. Archived threads and latest meetings without follow-up stay out of Reminders. “Remind tomorrow” hides an item for the rest of the current local day in device storage. Confirmed “Taken care of” clears the latest meeting’s follow-up flag or writes a durable intake resolution. Reminder order is newest relevant item first.

Notification contract: After permission is granted and organizer data is loaded, the app may issue one notification per local day when it is opened, active, or returns to the foreground and reminders exist. It is an active/open-app nudge, not background push. Selecting it opens or focuses the Reminders tab. Unsupported or blocked notification permission changes only the explanation and control state; reminders remain visible in the app.

Constraint: The owner explicitly requested that the client-side password route remain temporarily. Remembered access restores an anonymous Firebase session after the local unlock check; this is a known interim security limitation and must not be mistaken for a strong authorization boundary.

Motion: Use `160ms ease-out` transitions for state changes, a one-pixel active press response, and a restrained `1100ms` boot-mark breathing loop. Do not introduce ambient motion into the work area.
