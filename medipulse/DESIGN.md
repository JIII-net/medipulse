---
name: 4MED
description: The clinic card a Philippine clinic secretary fills in and rubber-stamps, as a patient-management system.
colors:
  ink: "#13305E"
  ink-deep: "#0E3F82"
  link: "#1F56A0"
  stamp: "#5B3FA8"
  void: "#B8322F"
  void-deep: "#8E2420"
  sky: "#CFE3F5"
  mint: "#CDEBD9"
  butter: "#F6E7A8"
  lilac: "#DDD5F0"
  blush: "#F4D6D2"
  paper: "#FFFFFF"
  ground: "#F2F3EF"
  ink-body: "#1E3A66"
  ink-soft: "#2C4670"
  ink-2: "#46597A"
  ink-3: "#566884"
  muted: "#6E7D94"
  line: "#DDE2E8"
  line-strong: "#C3CBD6"
  warn-ink: "#6E4700"
  warn-line: "#C98A0B"
  available: "#2F8A57"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "68px"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.11
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'wdth' 100"
  body-sm:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
    fontVariation: "'wdth' 100"
  button:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.43
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 80"
  queue:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 62"
  stamp:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 70"
rounded:
  stamp: "4px"
  md: "6px"
  lg: "6px"
  xl: "6px"
  2xl: "8px"
  3xl: "10px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  card: "20px"
  modal: "24px"
  section: "64px"
  section-lg: "80px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.paper}"
  button-primary-lg:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "14px 24px"
  button-ghost:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-sm:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-ghost-sm:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-quiet:
    textColor: "{colors.link}"
    typography: "{typography.body-sm}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  input-sm:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "20px"
  modal-card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "24px"
  card-stock-header:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "14px 20px"
  stamp:
    textColor: "{colors.stamp}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    padding: "0.28em 0.6em 0.24em"
  stamp-void:
    textColor: "{colors.void}"
  stamp-ink:
    textColor: "{colors.ink}"
  stamp-link:
    textColor: "{colors.link}"
  pending-mark:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
  rail-item:
    textColor: "{colors.ink-body}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  rail-item-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  filter-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  filter-pill-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
  tab:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
---

# Design System: 4MED

## Overview

**Creative North Star: "The Clinic Card"**

Every booking is a clinic card: the tinted appointment card and torn-off queue stub a Philippine clinic secretary fills in by hand and rubber-stamps. The whole product, from the landing page to the Clinic App rail to the printed prescription, is built from that card's materials: flat coloured card stock, one navy ink, printed field names with written-in lines beneath them, a dashed perforation where the stub tears off, and a violet stamp-pad impression for every state that has actually happened. The system refuses the white-and-blue rounded-card SaaS dashboard and the dark neon "futuristic" medical look; it should never feel cold and sterile, playful, or dense.

Density is that of a well-kept paper form: generous enough for a patient on a mid-range phone, structured enough that a front desk can scan a day's queue for hours. Hierarchy comes from width and weight of a single grotesque, not from colour or decoration. Each profession has its own card stock (doctor sky, dentist mint, ophthalmologist butter, psychiatrist lilac, psychologist blush), so a dentist's Clinic App rail is mint and a cardiologist's booking card is sky, the way clinics in a medical arts building hand out differently coloured cards.

The world is light only (`color-scheme: light`). The fixed 4MED logo (blue-and-silver medical cross with a sky ring) is a brand asset and keeps its own gradients; nothing else in the system is modulated.

**Key Characteristics:**
- One navy ink for text, rules, primary buttons and charts; every neutral is that ink at lower strength.
- Flat, unmodulated card-stock tints that own whole regions (card headers, the rail, section bands), keyed to profession.
- State is inked: angled violet stamps for what has happened, a printed blank for what is still waiting.
- Archivo at every size, with the width axis carrying the voice (condensed queue numbers and stamps, wide-open body).
- Hairlines and perforations as the only separators; no gradients, glows or glass.
- One gesture of motion that matters: the stamp coming down, pressing, and the ink settling.

## Colors

One navy ink on white paper and a warm off-white ground, five flat card stocks, one violet stamp-pad ink, and one void red.

### Primary
- **Logo Navy Ink** (#13305E): the ink of the whole system. All headings and primary text, primary and small buttons, active nav and tab underlines, selected states, chart strokes, checkbox accent, the "Done" stamp tone, and the print stylesheet's text and rules.
- **Pressed Ink** (#0E3F82): hover state of every filled ink button. Never used at rest.
- **Ballpoint Blue** (#1F56A0): links and quiet text buttons, the focus ring, the caret, and the "With doctor" / "Called" / "Part paid" stamp tone (in-progress states that are not yet complete).

### Secondary
- **Stamp-Pad Violet** (#5B3FA8): inked state only. Paid, Confirmed, Checked in, Signed, Active stamps, and the printed document's approval stamp. Also the violet-family entry in chart condition palettes.

### Tertiary
- **Void Red** (#B8322F): Cancelled, No-show, Skipped, Void, Failed, Payment rejected, Past due stamps; destructive text actions ("Cancel visit"); the IOP alert line on the eye chart.
- **Deep Void** (#8E2420): error text on blush washes, where Void Red alone would fall short of AA.

### Card Stock
- **Consult Sky** (#CFE3F5): doctor card stock and the default rail tint for secretaries and admins; also the text-selection colour, the input focus ring, the info notice wash, the highlighted "now in consult" queue row (at 40%), and the theme-color.
- **Dental Mint** (#CDEBD9): dentist card stock; the "Now serving" stub; the success notice wash.
- **Eye Butter** (#F6E7A8): ophthalmologist card stock; the warning notice and payment-due band wash.
- **Mind Lilac** (#DDD5F0): psychiatrist card stock.
- **Counsel Blush** (#F4D6D2): psychologist card stock (an addition beyond the original four, required because psychologists are a distinct profession that does not prescribe); doubles as the error notice wash.

### Neutral
- **Card Paper** (#FFFFFF): every card body, panel, input, modal and table surface.
- **Waiting-Room Ground** (#F2F3EF): the page ground behind cards, the sticky headers, the perforation notches, disabled input fill.
- **Ink on Stock** (#1E3A66): body and secondary text set on tinted card stock (rail items, card-header subtitles).
- **Soft Ink** (#2C4670): secondary body text on paper and ground (lead paragraphs, descriptions).
- **Label Ink** (#46597A): printed field labels, metadata, inactive tabs, pending marks.
- **Faint Ink** (#566884): placeholders and the faintest readable text.
- **Pencil Grey** (#6E7D94): icons and chevrons only; at 4.18:1 on paper it is not a text colour.
- **Hairline** (#DDE2E8): row dividers, header rules, tab baselines.
- **Card Edge** (#C3CBD6): panel and input borders, perforation dashes, scrollbar thumb, empty-state dashed outlines.

### Signal
- **Warning Ink** (#6E4700) on butter with a **Warning Edge** (#C98A0B) border at 40%: payment-held and warning notices.
- **Available Green** (#2F8A57): the "available now" dot on avatars and in the directory. A dot only, never text or a fill.

### Named Rules
**The One Ink Rule.** Text, borders, rules and filled buttons are navy ink or ink at lower strength (hue ~259). There is no black and no off-hue grey anywhere in the system.

**The Card Stock Rule.** A tint is a flat, unmodulated field that owns a whole region: a card header, the rail, a section band. The profession-to-tint mapping is fixed (doctor sky, dentist mint, ophthalmologist butter, psychiatrist lilac, psychologist blush) and resolved through one helper, never hand-picked per screen.

**The Stamp-Pad Rule.** Violet is reserved for inked state. It is never a button, link, heading or decorative accent; if it appears, something has happened.

## Typography

**Display Font:** Archivo (variable, wdth 62–125, wght 400–800), with system-ui fallback
**Body Font:** Archivo, with system-ui fallback
**Label/Mono Font:** Archivo, semi-condensed with tabular figures; there is no code font
**Print:** Archivo, with "Helvetica Neue", Arial fallback for print windows that cannot reach Google Fonts

**Character:** One grotesque at every size, its voice set by the width axis: wide-open at 100% for reading, 88% and tightly tracked for headings, 80% uppercase for printed field names, 70% for stamps, 62% for queue numbers. The result reads like a printed form filled in with one pen.

### Hierarchy
- **Display** (800, 44px phone / 60px from 640px / 68px from 1024px, line-height 1.02, wdth 88): the landing headline only.
- **Headline** (700, 30px phone / 36px from 640px, line-height ~1.1, wdth 88): page and section titles (landing sections, "Find a doctor", dashboard greeting).
- **Title** (700, 18–20px, wdth 88): card-header names, panel headings, empty-state titles (up to 24px).
- **Body** (400, 16px, line-height 1.5): reading text; lead paragraphs step to 18px. Measure is held near 34rem on the landing and max-w-2xl in sections.
- **Body Small** (400, 14px): the Clinic App's working size for table cells, metadata, notices, buttons.
- **Label** (600, 11.5px, letter-spacing 0.1em, uppercase, wdth 80): the printed field name above a written-in value, and table column heads.
- **Queue Number** (800, wdth 62, line-height 0.9, tabular): queue numbers, counts, prices and appointment times; 30px in sample rows, 36–40px on the board and cards, 84–96px on the clinic card stub and "Now serving".
- **Stamp** (800, wdth 70, 0.1em, uppercase): 12px in rows, 14.5px in strips, 20px when a stamp is the moment.

### Named Rules
**The One Grotesque Rule.** Archivo only. A new voice is a new width or weight on the same family, never a second typeface.

**The Tabular Figures Rule.** Any number a person compares down a column (times, queue numbers, fees, counts, dates in inputs) is set in tabular figures.

**The Field Name Rule.** Uppercase tracked labels name a field whose value follows (Patient, Schedule, Queue no., table heads). They are never used as decorative eyebrows above headlines.

## Layout

Content sits in a centred column of 72rem (1152px) with 20px side gutters on phones and 24px from 640px. Landing sections breathe at 64–80px vertical padding; full-bleed bands (white "How a visit moves", sky "front desk") are bounded by hairlines top and bottom rather than by cards. The hero is a two-column grid (copy left, live clinic card right) that stacks below 1024px.

The Clinic App is a fixed 240px card-stock rail (from 768px) beside a ground-coloured main column; below 768px the rail becomes a 288px off-canvas drawer over an ink scrim at 40%. The dashboard follows a strict top-down order: dated header with primary actions right, a single ruled strip of today's counts (queue-number figures beside their labels), then a two-column grid of the appointment board and a 320px aside holding "Now serving" and shortcuts.

Spacing rhythm is Tailwind's 4px grid used in a narrow band: 8–12px inside controls, 16px between related elements, 20px card padding and grid gaps, 24px modal padding and between major blocks. Tables run edge to edge inside their panel with 20px cell gutters. Grids go one, two, then three columns (directory, pricing) at 768 and 1024px. Touch targets in the patient flow stay at least 44px (drawer toggle, primary buttons).

## Elevation & Depth

The system is flat. Depth is paper on ground: a white card with a 1px edge on the off-white ground, or a tinted stock header on a white card body. Stacking is shown physically, not with shadow: the hero's next-patient card sits behind, offset and turned 2–3 degrees. Hover lifts are positional (a 4px rise on directory cards and the selected plan), never a growing shadow.

### Shadow Vocabulary
- **Modal Lift** (`box-shadow: 0 24px 60px -20px rgba(19,48,94,0.5)`): modals and dialogs only, so a card lifted off the desk reads above an ink scrim.

### Named Rules
**The Flat Card Stock Rule.** Surfaces at rest carry no shadow. The modal lift is the single shadow in the system; nothing else glows, blurs or floats.

## Shapes

Small, firm corners: 6px on buttons, inputs, panels, cards, avatars and nav items; 4px on stamps; 8–10px on some larger module containers. Bottom-sheet modals on phones round only their top corners. Borders are 1px: Card Edge on paper, ink at 15–20% where a card meets a tint. Dividers are 1px Hairline rules; the printed documents use a 2px-over-1px ink double rule under the letterhead.

The signature silhouette is the stub. A 2px dashed Card Edge perforation splits a card from its tear-off stub (queue number, appointment time, "Open the queue"), with 16px half-circle notches cut out at each end in the ground colour so the card reads as punched. Write-in lines (1px solid ink under a value) mark what a person has filled in. The only circles are the perforation notches and the availability dot.

### Named Rules
**The Perforation Rule.** A dashed perforation with notches appears only where a stub genuinely detaches: the queue number, the time, or the action that takes you to the queue. It is never a generic section divider.

## Components

### Buttons
Confident ink on paper, like a stamped form's submit box.
- **Shape:** gently squared (6px).
- **Primary:** ink fill, white text, 14px semibold, 10px x 16px; large variant 16px text at 14px x 24px for landing and checkout; small variant 8px x 14px for module toolbars.
- **Hover / Focus / Active:** fill deepens to Pressed Ink; active presses down 1px; focus shows a 2px Ballpoint Blue outline at 2px offset; disabled drops to 50% opacity.
- **Ghost:** transparent with a 1px ink border at 70%; hover inverts to an ink fill with white text. The small ghost sits on white with a Card Edge border that turns ink on hover.
- **Quiet:** Ballpoint Blue text with an underline on hover, for "Open calendar" style links.
- **On ink:** on the ink closing band, the primary inverts to white fill and ink text (hover sky), and the ghost to a white 60% border.

### Chips (filter pills)
- **Style:** white with a Card Edge border and Soft Ink text, 6px corners, 6px x 12px.
- **State:** active turns to an ink fill with white text and `aria-pressed`. Pills filter; they never show status.

### Cards / Containers
- **Corner Style:** 6px (some module containers 8–10px).
- **Background:** white body; a profession card-stock header (14–20px x 20px) separated by an ink-15% rule.
- **Shadow Strategy:** none at rest; see Elevation & Depth.
- **Border:** 1px Card Edge, or ink at 20% on cards that carry a tinted header.
- **Internal Padding:** 20px panels, 24px modals.
- **Empty states:** a dashed Card Edge outline with a title and one line of guidance.

### Inputs / Fields
- **Style:** white field, 1px Card Edge border, 6px corners, 10px x 14px (small: 8px x 12px, 14px text), Faint Ink placeholder.
- **Focus:** border turns ink and a 2px Consult Sky ring appears; no outline offset.
- **Error / Disabled:** disabled fields fade to 60% on the ground fill. Errors surface as a notice beside the field rather than a red field.
- **Labels:** the printed field-name label, 6px above the field.

### Navigation
- **Site nav:** a 64px sticky bar on the ground with a hairline base; links are 14px Soft Ink, and the current page sits on a 2px ink underline in semibold.
- **Clinic App rail:** the practitioner's card stock as a full-height rail; logo and wordmark, the clinic name as a field label, then 15px items with 17px icons. Inactive items are Ink on Stock with a white-50% hover; the active item is a white slip with ink semibold text. A dashed ink-40% rule separates the user block and log out.
- **Tabs:** underline tabs on a full-width hairline; active is ink semibold on a 2px ink underline, inactive Label Ink, 24px apart, horizontally scrollable.

### Notices
Flat tinted strips (6px, 12px x 16px, 14px text, optional 16px icon): info on sky, ok on mint, warning on butter with Warning Ink text, error on blush with Deep Void text. Each tint is held at 60–70% strength.

### Stamp and Pending Mark (signature)
The rubber stamp is the system's state vocabulary. A stamp is uppercase condensed text inside a 2px border with a 1px outline at 2px offset (double-ruled, like a real rubber stamp), tilted -3 degrees by default (-4 at medium, -6 at large with a 3px border), multiply-blended at 94% opacity so it inks over whatever is beneath. Tones: violet for completed actions, Ballpoint Blue for in-progress, ink for finished-and-filed (Done, Sent), void red for cancelled or failed. A state still waiting on someone (Booked, Awaiting payment, Not signed, Draft, Trial) is a **pending mark**: a 14px dashed lead line and 12.5px Label Ink text, a printed blank rather than an impression.

**The Ink-or-Blank Rule.** Every status is either a stamp (an action happened) or a pending mark (still waiting). There are no coloured pill badges. New statuses join the shared vocabulary in one place, never a local style.

**The Press-Once Rule.** The stamp-press animation (420ms: comes down from 1.9x and 9 degrees further turned, overshoots to 0.93, ink settles to 94%) plays only when a status changes in place, never on first render. The landing's sample card is the one place it loops, as a demonstration. Reduced motion shows the stamp already inked.

### Clinic Card (signature)
The appointment as a card: a profession-tinted header with the practitioner's name, a white body of field labels over write-in values, the stamps that have landed so far, a vertical perforation, and a stub holding the queue number or time in condensed queue figures. It deals in with a 600ms rise and slight turn. The same structure appears as the landing hero, the patient's upcoming visits, the booking confirmation, and the "Now serving" stub.

### Queue Board
A fixed-column table ranked by time: large queue numbers left (unassigned shown as a dash in Card Edge), name and metadata, then payment and visit status stamped right-aligned. The row in consult takes a sky wash; cancelled rows fade to 60%. Rows change state in place.

### Profession Charts
Dental and eye-exam charts use a fixed light condition palette: each condition is a pale fill, a saturated border in the same hue, and deep text in that hue (for example caries: blush fill, void border, deep-void text). The selected tooth or eye is outlined in ink. Charts keep a fixed scale across visits so history compares honestly.

### Printed Documents
Prescriptions, certificates, consent forms and receipts share one stylesheet: Archivo in ink on a 680px page, letterhead with the logo mark, a double ink rule, uppercase field labels, hairline table rows with tabular figures, an "Rx" marker per item, a signature line, and a violet approval stamp at -6 degrees.

## Do's and Don'ts

### Do:
- **Do** set every text, border and filled button in navy ink (#13305E) or one of its lower-strength inks; use Pencil Grey (#6E7D94) for icons only.
- **Do** give each card a profession card-stock header resolved from the practitioner's profession: doctor sky, dentist mint, ophthalmologist butter, psychiatrist lilac, psychologist blush.
- **Do** show every status through the shared stamp-or-pending vocabulary, with violet for done, blue for in progress, ink for filed, void red for cancelled or failed.
- **Do** set queue numbers, times, fees and counts in the condensed (wdth 62) tabular queue figures.
- **Do** put printed field labels (11.5px, 600, 0.1em, uppercase, wdth 80) above write-in values on any card that records an appointment or a patient.
- **Do** separate with 1px hairlines (#DDE2E8) and 1px Card Edge borders (#C3CBD6); reserve the notched dashed perforation for stubs.
- **Do** keep corners at 6px for controls and cards and 4px for stamps.
- **Do** honour reduced motion: the stamp lands already inked, cards appear without dealing in.

### Don't:
- **Don't** use gradients, glows, glass or backdrop blur anywhere outside the fixed logo.
- **Don't** add shadows to resting surfaces; the modal lift (`0 24px 60px -20px rgba(19,48,94,0.5)`) is the only shadow.
- **Don't** use Stamp-Pad Violet (#5B3FA8) for buttons, links, headings or decoration.
- **Don't** show status as a coloured pill badge or a coloured dot (the availability dot excepted).
- **Don't** introduce a second typeface or a monospace font; change Archivo's width or weight instead.
- **Don't** use uppercase field labels as eyebrows or kickers above headlines.
- **Don't** set a void-red stamp on lilac or blush stock (4.2–4.35:1); void stamps land on paper.
- **Don't** add a dark theme or a dark neon "futuristic" medical look; the world is light card stock.
