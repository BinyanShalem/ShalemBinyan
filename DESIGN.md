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
