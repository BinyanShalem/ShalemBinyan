---
version: 1
slug: "donate-index-html"
primary_target: "donate/index.html"
related_targets: ["donation-tools.mjs","admin/index.html","functions/index.js","firestore.rules"]
---

Mode: Operate / Persuade

Status: Shipped. Finish-review disposition: ship, with no remaining fixes. Code-led extension of the production Calm Threshold system; no approved visual comp was supplied.

Purpose: Let a supporter state an intended gift once, understand that the first step does not charge them, and continue to the correct payment destination without ambiguity.

Visual authority: Preserve the production public-site morning-blue world, Manrope typography, deep-water controls, open composition, and quiet white functional surfaces. The donation page may use a desktop split because giving details and the native form are one continuous task; phones return to the established vertical reading order.

Primary path: Enter name and amount → choose one-time or monthly → choose an eligible payment method → submit an unconfirmed intent → continue to Banquest or charitable-account instructions. Venmo and Zelle remain visible as disabled future options. Monthly always resolves to credit card and the Banquest surface asks the donor to select Monthly again.

Payment destinations: Credit card embeds `https://pay.banquest.com/binyanshalem` with the amount and donor name in the query. Charitable-account and donor-advised-fund gifts show Sephardic Congregation of Long Branch, Tax ID `47-5112423`, and memo `Binyan Shalem`. Venmo and Zelle remain visible but clearly unavailable; the donor may continue by credit card.

State contract: Validate name and a positive amount, offer `101`, `301`, `501`, `1,000`, `2,600`, `5,000`, `10,000`, and `Other`, and keep the visible selection synchronized with typed values. Keep one-time as the default, permanently disable unavailable methods, and disable every non-card route for monthly gifts with an explicit `Unavailable for monthly` cue. Expose busy and error states and focus the resulting destination heading. Submission creates a `donation_intents` record with `adminViewed: false`; this record is an expression of intent, never proof of payment.

Responsive behavior: Desktop keeps a calm support statement in a pinned morning-blue field beside the form. Below the production navigation breakpoint, the hero compresses and the form becomes a single vertical surface with two-column suggested amounts and full-width touch targets. Preserve comfortable use at `320px` and above.

Admin handoff: Every new intent triggers generic private push copy and deep-links to `/admin/?view=donations`. The PWA Donations center lists new and reviewed intents, states `Payment not confirmed` on every card, shows an unread count on its money-symbol button, and supports individual or bulk review without changing payment truth.

Constraint: Payment completion happens outside Firebase. The admin must verify gifts separately with Banquest or the relevant giving organization.

Motion: Use only restrained state transitions and respect reduced-motion preferences.
