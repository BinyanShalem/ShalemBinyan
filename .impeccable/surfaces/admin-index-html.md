---
version: 1
slug: "admin-index-html"
primary_target: "admin/index.html"
related_targets: ["content-resource-tools.mjs","firestore.rules","admin/manifest.webmanifest","admin/service-worker.js"]
---

Mode: Operate

Status: Shipped. Finish-review disposition: ship; all five requested fixes are resolved.

Surface seed: `b24dcaf2`.

Purpose: Give the site owner one calm workspace to review and publish link-only shalom bayit resources, remove admin-created resources, review intake submissions, and permanently delete a submission after confirmation.

Visual authority: Code-led implementation with no approved comp. Preserve the established plum admin identity; this surface is an additional Operate-mode system and does not inherit or replace the public site’s Calm Threshold composition.

Visual world: Calm operations console. Deep plum (`#3f1f33`) frames access and navigation; operational plum (`#6f3157`) carries primary action; soft plum (`#f1e6ed`) supports guidance. The working canvas is quiet gray-green (`#f1f4f2`) with white surfaces, near-black ink (`#17232c`), muted copy (`#64717a`), subtle lines (`#d8dfdd`), and strong input lines (`#c5cfcc`). Sage (`#dcebe4` / `#235c46`) communicates reassurance, blue (`#e6f0f5` / `#2e627d`) identifies review and information states, success uses `#176b45` on `#e3f2ea`, errors use `#9a2d33` on `#f9e6e7`, and focus uses `#9a527b`.

Typography: Inter, weights 400–700, with the shipped system-sans fallback stack. The workspace base is `15px / 1.5`; headings are compact with slight negative tracking, labels are sentence case and high-clarity, and navigation counts use tabular numerals.

Structure: One-time device unlock, then a shell with Content library and Submissions tabs. Desktop uses a persistent navigation rail, sticky workspace header, and centered content area. Content leads with a supported-source publishing composer, an editable review-before-publish state, and the app-created resource list. Submissions presents newest-first confidential intake cards with named headings, timestamps, stable submission IDs, complete field details, and confirmed deletion.

Primary task path: Unlock once → choose Content or Submissions → complete the selected workflow → receive explicit success, error, loading, or empty feedback. Content specifically follows paste → recognize → review and edit → publish; the review state is a required checkpoint rather than a decorative preview.

Desktop layout: The full-height rail is `272px`, tightening to `232px` below `1050px`; the sticky header is `82px` high and the workspace is capped at `1320px`. The composer splits guidance and input at `0.72fr / 1.28fr`. Review splits sticky media and the editor at `0.62fr / 1.38fr`. Submission details use three columns, then two below `1050px`.

Responsive behavior: Below `820px`, the rail becomes a fixed, thumb-reachable two-tab bottom bar with safe-area insets; brand/footer content and tab counts leave the compact bar. Focused form controls move the bar below the keyboard area. Below `720px`, login panels, composer, review, and submission fields stack; preview media stops sticking. Below `520px`, review fields and action groups become one column, buttons become full-width, removal actions get their own row, and header utility buttons collapse to icons. Preserve every workflow from `320px` upward.

Component language: Use white working groups with one low ambient shadow, neutral dividers for dense lists, `10–11px` control corners, `13–16px` surface corners, and pills only for counts, provider labels, and assurance notes. Primary buttons are plum/white with modest lift; secondary buttons are white with a neutral border; quiet buttons hold install and lock utilities; destructive buttons use restrained red. Inputs use off-white fill, strong neutral border, plum caret, and a four-pixel translucent plum focus halo. Primary controls retain at least a `44px` touch height.

Navigation behavior: Tabs expose selected state and panel relationships, support arrow-key cycling, persist the last selected tab in local storage, and mirror the Submissions tab in the URL. Counts update from live content. The header title and description follow the active tab.

State contract: Keep visible keyboard focus, `aria-live` status feedback, `aria-busy` loading buttons, loading and empty states, validation focus, duplicate detection, confirmed destructive actions, and explicit publish/remove/delete outcomes. The header always exposes Connected or Offline state on desktop. Reduced-motion preference collapses nonessential animation and replaces smooth preview scrolling with an immediate move.

Install and offline contract: The page is an installable PWA with browser prompt handling, iPhone/iPad “Add to Home Screen” guidance, standalone safe-area handling, icons, manifest shortcuts for Content and Submissions, and a service-worker-cached app shell. Offline shell availability does not promise offline Firebase publishing or submission mutations.

Remembered access contract: A successful password check stores a browser-local one-time unlock and establishes local Firebase auth persistence. Returning visits restore the workspace without another password when possible. “Lock app” clears both remembered unlock and tab state, signs out, returns to the password gate, and restores password focus. If storage is unavailable, the active session can continue but is not remembered.

Content contract: Baked resources remain the frontend baseline. Admin additions store links and remote metadata only and reuse the public resource renderer. Supported inputs are YouTube including Shorts/mobile URLs, the exact TorahAnytime multiline format, the first Amazon product URL, and iTorah lecture URLs. Every publishable presentation field can be edited during review; detected provider, content type, and internal ID remain locked. Photos remain baked-only.

Constraint: The owner explicitly requested that the client-side password route remain temporarily. Remembered access restores an anonymous Firebase session after the local unlock check; this is a known interim security limitation and must not be mistaken for a strong authorization boundary.

Motion: Use `160ms ease-out` transitions for state changes, a one-pixel active press response, and a restrained `1100ms` boot-mark breathing loop. Do not introduce ambient motion into the work area.
