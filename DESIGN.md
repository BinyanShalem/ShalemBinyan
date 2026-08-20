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

This system applies only to `admin/index.html` and its installable app shell. It does not revise the public-site Calm Threshold guidance above. The admin surface is an Operate-mode, code-led calm operations console established from surface seed `b24dcaf2`; no approved visual comp supersedes the shipped implementation.

The admin thesis is “a calm secretary, not a database.” After the one-time device unlock, the owner chooses Resources, Encounters, or Reminders, records only what is worth remembering, and sees the next natural action. The default workspace stays compact and explicit rather than exposing storage concepts or a general-purpose record editor.

### Admin visual world

- Preserve the established plum identity, but use it as structural chrome and state emphasis rather than decoration.
- The canvas is a quiet gray-green field (`#F1F4F2`) with white working surfaces, near-black ink (`#17232C`), muted copy (`#64717A`), subtle lines (`#D8DFDD`), and stronger input lines (`#C5CFCC`).
- Operational plum uses `#6F3157` for primary actions, `#3F1F33` for the rail and highest-emphasis plum, `#F1E6ED` for soft fields, and `#9A527B` for focus outlines.
- Sage (`#DCEBE4` / `#235C46`) marks reassurance and review-ready guidance. Soft blue (`#E6F0F5` / `#2E627D`) separates the editable review state and informational feedback. Success uses `#176B45` on `#E3F2EA`; errors use `#9A2D33` on `#F9E6E7`.
- Use Inter with the shipped 400–700 weights. The base workspace is compact at `15px / 1.5`; headings use tight negative tracking, sentence case, and controlled measure. Counts use tabular numerals.

### Admin layout and depth

- Desktop uses a full-height plum navigation rail (`272px`, reduced to `232px` below `1050px`), a sticky white header, and a centered workspace capped at `1320px`.
- The rail has three counted destinations: Resources, Encounters, and Reminders. The Encounters first viewport leads with one clear “New encounter” action, a compact Active / Intake forms / Archived switch, and connected meeting threads rather than a flat record table.
- Resources retains its two-column supported-source composer and the recognized-media / editable-fields review surface before publish. Encounter entry uses a compact two-column form on wider screens and a single column on phones; the thread list and reminder cards use white working surfaces on the shared canvas.
- At `820px` and below, the rail becomes a fixed, safe-area-aware three-tab bottom bar. Tab counts leave the compact bar, while the labels and icons remain. Focused text inputs and textareas move the bar below the keyboard area. At `720px`, login and resource publishing surfaces stack; at `620px`, encounter summaries, encounter fields, reminder overviews, and meeting entries become single-column; at `520px`, resource review fields and action groups become single-column and full-width. Every workflow remains usable from `320px` upward.
- Depth is sparse and structural. White working groups sit on the canvas with one low ambient shadow (`0 1px 2px rgba(28, 39, 43, 0.06), 0 10px 28px rgba(28, 39, 43, 0.07)`); dividers organize dense lists. Corners stay practical: `10–11px` controls, `13–16px` working surfaces, pills only for counts, provider labels, and assurance notes.

### Admin components and behavior

- Navigation uses line icons, explicit selected state, resource / active-encounter / reminder counts, arrow-key tab movement, remembered tab selection, and URL state for direct Encounters and Reminders access. Phones preserve the same three destinations as bottom tabs.
- Primary buttons are plum with white text and a modest shadow; secondary buttons are white with a strong neutral border; quiet buttons carry install and lock actions; destructive actions use restrained red borders and confirmation before deletion. All primary touch targets are at least `44px` high.
- Inputs use an off-white fill, an `11px` radius, plum caret, stronger hover border, and a four-pixel translucent plum focus halo. Global keyboard focus remains a visible three-pixel plum outline with offset.
- Resource publishing follows paste → recognize → review/edit → publish. Provider, content type, and internal ID remain locked; every public presentation field remains editable. Loading buttons expose busy state, and success, information, error, loading, empty, duplicate, removal, and deletion outcomes are explicit and live-announced.
- Organizer controls use the same practical touch floor: Active / Intake forms / Archived switches, encounter and reminder actions, intake actions, and the meeting-timeline summary are at least `44px` high. “New encounter” is the dominant organizer action; action labels use natural language such as “Add meeting,” “Remind tomorrow,” and “Taken care of.”
- Encounter entry is intentionally minimal and Notes-led. A name is the only required value; contact, date, time, contact method, Notes, and the follow-up switch are optional. Notes invite “Anything worth remembering,” keeping the owner out of database-shaped data entry. Saving creates a meeting, then immediately recomputes the organizer and reminder states.
- Repeated meetings stay connected as one encounter thread. Its summary uses the latest meeting, a useful recent note, method/date chips, meeting count, and latest follow-up state; an expandable timeline preserves every meeting. “Add meeting” carries forward shared names, contact, method, thread identity, intake link, and current follow-up decision, supplies the current date and time, and leaves Notes empty for only what changed.
- “Log encounter” from an intake form pre-fills the couple’s names, available phone/email details, the presenting issue into Notes, the current date and time, Phone as the starting method, and follow-up on. Once any encounter links to that intake, the separate intake reminder disappears. Intake forms remain available in the Encounters switcher until explicitly deleted.
- Reminders show only the latest relevant decision. Every unlinked and unresolved intake can create one reminder; each active encounter thread can create at most one, based only on its newest meeting. A newer meeting therefore supersedes an older follow-up flag instead of producing a duplicate. Archived threads and latest meetings without follow-up are excluded.
- “Remind tomorrow” suppresses that reminder for the rest of the current local day in browser-local storage and lets it return on the next day. “Taken care of” asks for confirmation, then either clears the latest meeting’s follow-up flag or stores a durable resolution for an intake reminder.
- Archiving applies to the entire connected encounter thread and removes it from active encounters and reminder consideration; restoring returns the full thread to Active. Individual meeting deletion remains a confirmed, irreversible action inside the expanded timeline.
- Notifications are optional and honest about their lifecycle: after permission is granted and organizer data has loaded, the installed shell may send one reminder nudge per local day when the app is opened, active, or returns to the foreground and unresolved reminders exist. This is not background push. Selecting the notification opens or focuses the app at Reminders; blocked or unsupported notifications never hide the in-app reminder list.
- The one-time device unlock is remembered in browser-local storage and restores an anonymous Firebase session. “Lock app” clears the remembered unlock and tab, signs out, and returns focus to the password gate. This convenience is not a strong authorization boundary.
- The installable shell exposes browser and iOS installation guidance, standalone safe-area handling, cached app-shell assets, three manifest shortcuts, and a visible Connected/Offline state. Offline shell access does not imply that Firebase publishing, encounter, intake, or reminder mutations work without a connection.
- Local organizer preview is conspicuously labeled “Preview data” in the header. It supplies representative intake and threaded-encounter data and keeps organizer mutations local so review states cannot be mistaken for live records.
- Motion is limited to `160ms` state transitions, a one-pixel pressed response, smooth movement to the review surface, and the boot mark’s restrained breathing. Reduced-motion preferences collapse nonessential animation and replace smooth review scrolling with an immediate move.
