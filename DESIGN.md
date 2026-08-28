# Binyan Shalem — Calm Threshold

## Design thesis

The site should feel like arriving at a quiet, trustworthy doorway: light enough to offer hope, structured enough to signal professional care, and gentle enough for a visitor who may be hesitant to ask for help.

## Color system

- `Mist`: `#F4FAFD` — primary page surface.
- `Morning`: `#E1F0F8` — broad atmospheric fields.
- `Sky`: `#B9D9EC` — quiet emphasis and the living circle field.
- `Harbor`: `#6F9FBD` — interactive accents and supporting details.
- `Deep Water`: `#244D68` — primary actions and headings.
- `Midnight Blue`: `#142F42` — highest-emphasis text.
- `White`: `#FFFFFF` — form and reading surfaces.
- The plum inside the supplied logo remains a brand artifact; it is not repeated as a general UI accent.

Color is applied in large, calm regions. Gradients are limited to simple sky-like tonal transitions and never used on text.

## Typography

- Primary family: Manrope, with a system sans-serif fallback.
- Headlines use compact line-height, moderate weight, and balanced wrapping.
- Body copy remains between 60 and 72 characters per line.
- Labels and navigation use sentence case rather than decorative tracking.

## Composition

- The first viewport follows the supplied reference: a strong central object, concise message, a compact action dock, and two stacked actions.
- The logo replaces the reference airplane and sits within an open atmospheric field rather than a card.
- A clean field of large blue and white circles slowly floats behind the hero, entering from beyond one edge and leaving through another without fading.
- Below the hero, principles use editorial rows and generous rules rather than repeated cards.
- Forms sit on a solid white surface with clear groups, calm spacing, and no decorative glass.
- Educational resources use their real lecture thumbnails and book covers; the image itself is the primary action, with text controls repeating the same destination.

## Components

- Primary buttons are deep blue, full-width, and softly pill-shaped.
- Secondary buttons are pale blue with dark text.
- Text links use a quiet underline and directional arrow.
- Cards are reserved for functional surfaces such as the intake form; narrative content uses open layouts and separators.
- Focus rings use Harbor blue with sufficient offset.

## Motion

- One restrained hero reveal begins with one large blue and one large white circle already present. Desktop gradually introduces six more large circles plus four medium circles, retaining an even blue/white balance. Mobile introduces one additional large white circle plus two medium circles for a maximum of five, using distinct lanes to keep overlap slight.
- Medium circles travel on broad, moderately quicker paths while the large opening pair uses a wider slow drift, keeping the field visibly alive without becoming busy.
- Continuous hero motion uses transform only, pauses when the hero or browser tab is not visible, and never spreads into the content sections.
- Hover motion is limited to slight lift and shadow changes on actionable controls.
- Reduced-motion preferences remove nonessential animation.

## Responsive behavior

- Mobile keeps the reference’s vertical, immersive reading order.
- Desktop uses the same hierarchy at greater scale instead of converting the hero into a generic split layout.
- Navigation collapses below 820px.
- Forms become one column below 700px.
- Secondary-page heroes compress on phones so the first resource or functional form begins within the opening viewport rather than after a desktop-scaled introduction.

## Additional surface system: Admin operations console

This system applies only to `admin/index.html` and its installable app shell. It does not revise the public-site Calm Threshold guidance above. The admin surface is an Operate-mode, code-led calm operations console established from surface seed `b24dcaf2`, with its conversational extension recorded as `b24dcaf2-chat` and its hosted smart-assistant extension recorded as `b24dcaf2-ai`; no approved visual comp supersedes the shipped implementation. The finish-review disposition is ship, with no remaining fixes.

The admin thesis is “a calm secretary, not a database.” After the one-time device unlock, Chat is the default workspace: it greets the owner with a live, concise workload summary and six bounded choices, accepts natural-language requests through a hosted Gemini planning layer, and asks only for the detail needed to act. A persistent top switch keeps the complete Dashboard one tap away for overview work; smart and guided Chat both invoke the same Firebase-backed records and actions as Dashboard, never a parallel data model.

### Admin visual world

- Preserve the established plum identity, but use it as structural chrome and state emphasis rather than decoration.
- The canvas is a quiet gray-green field (`#F1F4F2`) with white working surfaces, near-black ink (`#17232C`), muted copy (`#64717A`), subtle lines (`#D8DFDD`), and stronger input lines (`#C5CFCC`).
- Operational plum uses `#6F3157` for primary actions, `#3F1F33` for the rail and highest-emphasis plum, `#F1E6ED` for soft fields, and `#9A527B` for focus outlines.
- Sage (`#DCEBE4` / `#235C46`) marks reassurance and review-ready guidance. Soft blue (`#E6F0F5` / `#2E627D`) separates the editable review state and informational feedback. Success uses `#176B45` on `#E3F2EA`; errors use `#9A2D33` on `#F9E6E7`.
- Use Inter with the shipped 400–700 weights. The inherited Google Fonts loading pattern is an intentional, established admin exception. The base workspace is compact at `15px / 1.5`; headings use tight negative tracking, sentence case, and controlled measure. Counts use tabular numerals.

### Admin layout and depth

- Desktop uses a full-height plum navigation rail (`272px`, reduced to `232px` below `1050px`), a fully opaque sticky white header, and a centered workspace capped at `1320px`. In Chat, the sticky header carries the persistent Chat / Dashboard switch and the conversation is bounded in a centered `960px` frame rather than stretched across the work area.
- The rail has four counted destinations: Resources, Encounters, Directory, and Reminders. The Encounters first viewport leads with one clear “New encounter” menu whose two choices are “Log a meeting” and “Schedule a meeting,” a compact Active / Intake forms / Archived switch, and connected couple timelines rather than a flat record table. Directory is deliberately distinct: a private contact book for therapists, people, and practical resources rather than another organizer queue.
- Resources retains its two-column supported-source composer and the recognized-media / editable-fields review surface before publish. Encounter entry uses a compact two-column form on wider screens and a single column on phones; the couple-timeline list and reminder cards use white working surfaces on the shared canvas. Directory uses an inline minimal-entry editor above a grouped alphabetical list, with search and category filters kept adjacent to the list they control. Reminders pairs one “New reminder” action and inline editor with separate personal-reminder and automatic-follow-up groups.
- At `820px` and below, the rail becomes a fixed, safe-area-aware four-tab bottom bar. Tab counts leave the compact bar, while the labels and icons remain. Focused text inputs and textareas move the bar below the keyboard area. Chat instead becomes the primary full-screen app: its frame loses desktop rounding and shadow, its persistent composer remains above the bottom safe area, and the switch remains in the sticky header. At `720px`, login and resource publishing surfaces stack; at `620px`, encounter summaries, encounter fields, reminder overviews, meeting entries, directory rows, reminder editor, and chat forms become single-column. Opening the reminder editor aligns its top directly beneath the compact `68px` sticky header and safe-area inset instead of hiding it behind the chrome. At `520px`, resource review fields and action groups become single-column and full-width. Every workflow remains usable from `320px` upward.
- Depth is sparse and structural. White working groups sit on the canvas with one low ambient shadow (`0 1px 2px rgba(28, 39, 43, 0.06), 0 10px 28px rgba(28, 39, 43, 0.07)`); dividers organize dense lists. Corners stay practical: `10–11px` controls, `13–16px` working surfaces, pills only for counts, provider labels, and assurance notes.

### Admin components and behavior

- Navigation uses line icons, explicit selected state, resource / active-encounter / directory / reminder counts, arrow-key tab movement, remembered tab selection, and URL state for direct Encounters, Directory, and Reminders access. Phones preserve the same four destinations as bottom tabs. Chat is the unlocked default; its sticky mode switch exposes Dashboard as a persistent, named escape hatch, while existing `tab` deep links route the conversation to Resources, Encounters, Directory, Reminders, or Intake forms.
- Primary buttons are plum with white text and a modest shadow; secondary buttons are white with a strong neutral border; quiet buttons carry install and lock actions; destructive actions use restrained red borders and confirmation before deletion. All primary touch targets are at least `44px` high.
- Inputs use an off-white fill, an `11px` radius, plum caret, stronger hover border, and a four-pixel translucent plum focus halo. Global keyboard focus remains a visible three-pixel plum outline with offset.
- Chat combines a hosted Gemini planner with deterministic guided assistance: use a familiar assistant / user bubble distinction, a thumb-reachable persistent composer, concise system guidance, and tappable reply or action buttons. Its six first-menu routes are Today, Encounters, Reminders, Directory, Resources, and Intake forms. Natural language may propose only the shipped allowlisted skills; the deterministic routes remain the visible menu and automatic failure fallback.
- Guided chat forms stay inline in the conversation, lead with the minimum required fields, progressively disclose optional details, and autofocus the next required entry. Reuse known recent couple-timeline or intake information before asking the owner to type it again. View, add, edit, delete, archive, complete, snooze, schedule, record outcomes, and notification controls must invoke the same records and mutations as Dashboard.
- The Gemini layer plans but never writes directly. Create and edit requests open prefilled local review forms. Direct changes resolve their exact target from current local state and show the target, effect, and irreversible wording where relevant before the confirming click; AI-authored summaries never serve as the sole destructive confirmation. The Firebase callable requires the existing anonymous Firebase session and accepts compact record summaries only; the server rebuilds their permitted shape so full encounter notes, intake issue text, phone/email fields, and couple contact fields cannot enter the prompt, then drops any model-returned target ID that was not present in that compact context. It keeps at most six short in-memory conversation turns, stores no chat text, and enforces 30 requests per Firebase user per UTC day plus 500 project-wide requests per UTC month. The API key remains a server-side Firebase Secret Manager secret documented in `GEMINI_SETUP.md`.
- Chat bubbles use the shared white/plum/sage language with practical 44px action targets; assistant bubbles have a soft asymmetric lower-left corner and user bubbles mirror it. Consecutive messages stack tightly, long text wraps inside its bubble, and the composer grows from one to five lines before scrolling internally. Enter sends while Shift+Enter adds a line on hardware keyboards. Opening Chat never summons the keyboard until the owner chooses a field, Gemini processing keeps the active composer stable instead of closing and reopening it, and phones retain the native system keyboard. The mobile chat shell stays in stable normal layout without following visual-viewport scroll events; iOS or Android performs its native keyboard pan/resize while the history alone scrolls inside the frame and the composer remains a separate row. Closing the keyboard restores the full-height layout naturally. A visible Clear chat control resets only transient conversation, draft, and guided-flow state—never Firebase records—and ignores any late response from the cleared exchange. Preserve visible focus, live status and validation feedback, meaningful system / assistant / user states, and distinct ready, thinking, guided-fallback, and error status communication, plus reduced-motion-safe scrolling and bubble entry.
- Resource publishing follows paste → recognize → review/edit → publish. Provider, content type, and internal ID remain locked; every public presentation field remains editable. Loading buttons expose busy state, and success, information, error, loading, empty, duplicate, removal, and deletion outcomes are explicit and live-announced.
- Organizer controls use the same practical touch floor: Active / Intake forms / Archived switches, encounter and reminder actions, intake actions, meeting-timeline summaries, focusable meeting-row targets, and dialog actions are at least `44px` high. “New encounter” is the dominant organizer action; its compact choice menu distinguishes “Log a meeting” from “Schedule a meeting” without adding another top-level view.
- Directory entry is intentionally light: name is required; type is Therapist, Person, or Resource; phone, email, website, and a quick note are optional. Entries remain easy to scan through alphabetical grouping, search, and category filters. Available contact fields become direct Call, Text, Email, or Open actions, while Edit and confirmed Delete remain explicit secondary actions.
- Directory category filters use a darker inactive label (`#46535C`) against the soft neutral filter field so small text remains readable. Closing, canceling, saving, or deleting from the inline editor restores keyboard focus to the invoking control when it still exists, with the Add entry action as the stable fallback.
- Encounter entry is intentionally minimal and Notes-led. A completed meeting requires only a name; contact, Other people involved, date, time, contact method, Notes, and follow-up are optional. A scheduled meeting uses the same fields but requires its scheduled date, hides the irrelevant follow-up switch, and starts with date/time blank so the appointment is deliberate. Legacy encounters normalize as completed. Notes invite “Anything worth remembering,” keeping the owner out of database-shaped data entry.
- Completed and scheduled meetings share exactly one continuous couple timeline. Intake submission identity is the strongest link; exact couple names or contact details safely reconnect manually entered meetings when no intake link exists. New timeline entries carry names, contact, other people involved, method, timeline identity, and intake link forward, while date/time and Notes stay specific to the new entry.
- Each timeline row is one focusable click target that opens a native dialog with that entry’s complete fields and position in the couple timeline. Scheduled rows use blue status cues and offer “Edit schedule” or “Record outcome”; recording an outcome converts that same record to completed and exposes Notes and follow-up, avoiding a duplicate meeting. On phones, the dialog becomes a full-width bottom sheet.
- Intake forms offer only “Schedule encounter.” They pre-fill the couple’s names, available phone/email details, Other people involved from `anyone_else_involved`, the presenting issue into Notes, and Phone as the starting method, while leaving the required scheduled date and optional time for the admin. Scheduling from the same form always appends to its existing couple timeline. Once any encounter links to that intake, the separate intake reminder disappears; the source intake remains visible until explicitly deleted.
- Reminders is both a personal list and an automatic appointment/follow-up queue. One “New reminder” action opens the inline editor; active personal items appear first under “Your reminders,” and due appointments plus unresolved intake or encounter work appear separately under “Appointments & follow-ups.” Personal reminders sort by soonest timing, with untimed items after timed items and newest untimed items first; automatic work retains newest-relevant-first ordering.
- Personal reminders persist in `admin_manual_reminders`. Reminder name is required; date, time, and description are optional. No timing reads “Anytime”; time without a date reads “Every day” at that local time; a date can stand alone or pair with a time, with Today, Tomorrow, calendar-date, and Overdue labels as appropriate. Timing organizes the personal list and controls when background delivery becomes eligible.
- Personal reminder cards use pale-gold timing emphasis and expose Edit, “Remind tomorrow,” and “Taken care of.” Edit reuses the inline editor and reveals a confirmed, irreversible Delete action. Closing, canceling, or saving returns focus to the invoking control when it still exists; deletion returns focus to the stable “New reminder” action. “Remind tomorrow” suppresses any reminder for the rest of the current local day in browser-local storage, while confirmed “Taken care of” durably marks a personal reminder complete, clears the latest meeting’s follow-up flag, or stores an intake resolution according to reminder type.
- Automatic organizer work still shows only the latest relevant decision per couple. Every unlinked and unresolved intake can create one scheduling prompt. Each active couple timeline can create at most one automatic item based on its newest entry: a completed meeting only when follow-up is on, or a scheduled meeting once its local calendar date arrives. The optional scheduled time remains display context and never delays date eligibility. Future appointments suppress older follow-up flags without reminding early; recording the outcome changes that same entry to completed. Archived timelines are excluded.
- Archiving applies to the entire connected couple timeline and removes it from active encounters and reminder consideration; restoring returns the full timeline to Active. Individual meeting deletion remains a confirmed, irreversible action inside the expanded timeline.
- Notifications are optional, device-specific background push. Enabling them creates a browser Push subscription owned by the current Firebase user and immediately sends a private test notification; turning them off or locking the app removes that subscription. Two per-device Reminders switches control scheduled-meeting alerts and new-intake alerts, with both on by default; Chat exposes the same settings as direct buttons. A new intake sends an immediate private alert when its form is submitted, then remains eligible for the daily unresolved-intake reminder after 9:00 AM on later days. A Firebase scheduled function checks other due work every fifteen minutes in the device’s recorded IANA time zone. Completed encounter follow-ups become eligible daily at 9:00 AM; scheduled encounters become eligible on their calendar date at their optional time or 9:00 AM; personal reminders respect their optional date and time, then repeat daily until completed. Durable snoozes suppress both in-app and background delivery through the current local day, and per-device delivery receipts prevent duplicate sends. Lock-screen copy never includes names, contact details, or notes. Selecting a notification opens or focuses Reminders; blocked or unsupported notifications never hide the in-app list.
- The one-time device unlock is remembered in browser-local storage and restores an anonymous Firebase session. “Lock app” clears the remembered unlock and tab, signs out, and returns focus to the password gate. This convenience is not a strong authorization boundary.
- The installable shell exposes browser and iOS installation guidance, standalone safe-area handling, cached app-shell assets, four manifest shortcuts, and a visible Connected/Offline state. Offline shell access does not imply that Firebase publishing, encounter, directory, intake, or reminder mutations work without a connection.
- Local organizer preview is conspicuously labeled “Preview data” in the header. It supplies representative intake and couple-timeline data and keeps organizer mutations local so review states cannot be mistaken for live records.
- Motion is limited to `160ms` state transitions, a one-pixel pressed response, smooth movement to the review surface, and the boot mark’s restrained breathing. Chat may use its single `180ms` bubble entry to make a new state legible, never as ambient decoration. Reduced-motion preferences collapse nonessential animation and replace smooth review, encounter-form, reminder-editor, and chat scrolling with an immediate move.
