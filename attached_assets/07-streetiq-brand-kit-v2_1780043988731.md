# StreetIQ — Brand Kit

The single source of truth for how StreetIQ looks, sounds, and feels. Use this when designing any new screen, panel, marketing surface, doc, or microcopy.

## Identity

- **Product name**: StreetIQ
- **Wordmark casing**: `StreetIQ` (one word, both capitals). Never "Street IQ", "StreetIq", or "STREETIQ" except in all-caps mono labels.
- **Tagline / role**: *Voice-first delivery copilot*
- **One-line pitch**: A voice-first copilot for delivery drivers with a collaborative shared knowledge layer (parking heatmap + cross-driver road alerts) and a back-office dispatch dashboard.
- **In-product assistant name**: **Otto** — the voice persona users address ("Hey Otto"). Otto is the voice; StreetIQ is the product. Microcopy distinguishes them: an event log entry reads `StreetIQ → Driver A: …`, but the spoken/written alert label reads `Otto · proactive alert`.
- **Demo context label**: `VOICE COPILOT · DEMO` (mono, uppercase, 0.18em tracking, `inkFaint`)

## Theme

**BMW only.** A single locked theme — there are no dark mode, no color variants, no tweak panels in production. (The repo's `tweaks-panel.jsx` and any alternate palettes existed in the prototype only for exploration; strip them from production.)

The aesthetic is a **cool silver-white automotive instrument cluster**, not a consumer app. Operations-console vibe: minimal, precise, dense but uncluttered. Think BMW iDrive at rest, not Uber Eats.

## Color tokens

All colors are defined as both CSS variables (`--si-*` in `artifacts/demo/src/index.css`) and a JS constant (`SI` in `artifacts/demo/src/App.tsx`). They must stay in sync — if you change one, change the other.

### Background palette (BMW silver)

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#F2F5F9` | Outer panel background (panels 01, 03) |
| `bgDeep` | `#F8FAFC` | Alternating panel background (panels 02, 04) |
| `surface` | `#FAFBFD` | Inner cards, system bars |
| `surfaceUp` | `#FFFFFF` | Primary cards (current parcel, alert, map shell) |

### Hairlines

| Token | Hex | Usage |
|---|---|---|
| `hair` | `#CFD6DF` | All borders, dividers, panel separators (always 1px) |
| `hairSoft` | `#DDE2EA` | Soft borders, secondary dividers |

### Ink (text)

| Token | Hex | Usage |
|---|---|---|
| `ink` | `#1C1B1A` | Primary text, headlines |
| `inkSoft` | `#5A5752` | Secondary text, body copy |
| `inkFaint` | `#8E8B85` | Labels, timestamps, captions, mono uppercase chrome |

### Primary accent — BMW blue (oklch hue 250)

| Token | Value | Usage |
|---|---|---|
| `accent` | `oklch(58% 0.16 250)` | Active states, Driver A indicator, panel 01 rule, links |
| `accentDeep` | `oklch(42% 0.17 250)` | Primary CTAs (`▶ Run Scripted Demo`, `Accept reroute`), filled buttons |
| `accentWash` | `oklch(94% 0.03 250)` | Accent badge backgrounds, Driver A chip wash |

### Functional accents (used sparingly, color-codes a panel or state)

| Family | Token | Value | Meaning |
|---|---|---|---|
| Amber | `amber` | `oklch(74% 0.15 75)` | Proactive alerts, "Approaching" state, panel 02 rule |
| | `amberDeep` | `oklch(56% 0.14 75)` | Alert card left rule, amber-deep text |
| | `amberWash` | `oklch(95% 0.05 75)` | Alert card background |
| Rust | `rust` | `oklch(60% 0.17 30)` | Road closures, errors, panel 03 rule |
| | `rustDeep` | `oklch(48% 0.16 30)` | Rust deep variants |
| | `rustWash` | `oklch(94% 0.04 30)` | Rust badge backgrounds |
| Ink2 (cool blue) | `ink2` | `oklch(50% 0.10 245)` | Driver B / dispatch info, panel 04 rule |
| | `ink2Deep` | `oklch(38% 0.11 245)` | Ink2 deep |
| | `ink2Wash` | `oklch(94% 0.03 245)` | Driver B chip wash |

**Color-coding contract per panel** (the 3px left rule on each header):

- Panel 01 — Voice Cockpit (Driver A) → `accent` (BMW blue)
- Panel 02 — Adaptive Map → `amber`
- Panel 03 — Dispatch → `rust`
- Panel 04 — Proactive Copilot (Driver B) → `ink2`

### Notes on oklch

The accent palette uses `oklch()` — supported in all modern browsers. If a deployment target must support older WebViews, provide hex fallbacks; otherwise keep oklch as canonical.

## Typography

Loaded via Google Fonts:

```
Space+Grotesk:wght@400;500;600;700
Inter:wght@400;500;600;700
JetBrains+Mono:wght@400;500;700
```

### Font roles

| Role | Stack | Token |
|---|---|---|
| Headlines & display | `'Space Grotesk', 'Inter', system-ui, sans-serif` | `--app-font-head` / `FONT_HEAD` |
| Body / UI | `'Inter', system-ui, sans-serif` | `--app-font-sans` / `FONT_BODY` |
| Mono (codes, timestamps, chrome labels) | `'JetBrains Mono', ui-monospace, 'Menlo', monospace` | `--app-font-mono` / `FONT_MONO` |
| Serif | `Georgia, serif` | `--app-font-serif` (rarely used) |

### Type scale (production sizes)

| Element | Family | Size | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Wordmark `StreetIQ` (top bar) | Space Grotesk | 16px | 600 | -0.01em | |
| Panel title | Space Grotesk | 17px | 500 | -0.01em | Line-height 1.15–1.4 |
| Address | Inter | 19px | 500 | normal | Current parcel card |
| ETA / numerals | JetBrains Mono | 22px | 500 | normal | Always mono for codes |
| Headline body (alerts) | Space Grotesk | 14px | 500 | normal | Line-height 1.4 |
| Body | Inter | 12–14px | 400–500 | normal | |
| Mono chrome label (`PANEL 01`, `LIVE`, `VOICE COPILOT · DEMO`) | JetBrains Mono | 10–11px | 600–700 | **0.14–0.18em**, **uppercase** | The most repeated mark in the UI |
| Caption / faint label | Inter or Mono | 10–11px | 500 | 0.04–0.18em | `inkFaint` |

### Type rules

- Headlines and panel titles: always Space Grotesk, weight 500–600, slight negative tracking (`-0.01em`).
- Any code, ID, ETA, timestamp, or `[BRACKETED LABEL]` is **JetBrains Mono**, uppercased, with positive tracking. This is the single most identifiable detail of the brand.
- Body copy is Inter. Don't mix sans families.
- Italics are reserved for proactive-alert headlines and a few captions (e.g. `"shared by 47 colleagues"`); don't use italic for emphasis in body.

## Spacing & geometry

| Property | Value |
|---|---|
| Panel padding | 18px sides, 14–16px vertical |
| Card padding | 14–18px |
| Card radius | 14px (large), 10px (medium), 6px (small) |
| Vertical rhythm | 16px between major blocks |
| Hairlines | 1px solid `hair` |
| Panel accent rule | 3px wide vertical bar, left edge of every panel header |
| Alert card left rule | 4px wide vertical bar (`amberDeep`), left edge |
| Speak button | 88px circular |
| Top sim bar | 44px tall |
| Bottom status bar | 26px tall |
| Panel header | 54px tall |
| System log strip (panel 03 bottom) | 220px tall |

### Border radius rules

- Cards: 14px (large), 10px (medium), 6px (small).
- Buttons: 4px (segmented top-bar buttons), 6px (alert action buttons).
- **Panels themselves have no rounded corners** — they're flat columns separated by 1px hairlines. No drop shadows on panels, ever.

## Layout system

### The stage

- Fixed design stage: **1600 × 900**, scaled to fit the viewport via `transform: scale()`.
- Vertical structure (top to bottom): top sim bar (44px) → 4-panel row (`flex: 1`) → bottom strip (26px).

### The 1×4 panel grid

- Four equal-width columns, each `flex: 1`, separated by `border-right: 1px solid hair` (no right border on the last column).
- Each panel is a flex column with: a 54px header + a scrollable body.
- Each panel header carries:
  - A 3px vertical accent rule at the left edge (panel-specific color, see contract above)
  - `PANEL 0N` mono label in the accent color
  - The panel title in Space Grotesk
  - An optional sub-label right-aligned in `inkFaint`

### Responsive fallback

Production renders responsive: keep the 1×4 layout above ~1280px wide; collapse to 2×2 below 767px. Defined in `index.css` `.si-panel-row` media queries.

## Components & patterns

### Top sim bar (44px)

- `StreetIQ` wordmark (left)
- `VOICE COPILOT · DEMO` mono label
- Driver A state segmented buttons: `DRIVING` / `APPROACHING` / `PARKED`
- Driver B state segmented buttons (same)
- Right side: `Reset` (ghost) · `▶ Run Scripted Demo` (primary, `accentDeep` fill)

### Bottom status strip (26px)

- Left: `CLOSED-LOOP DEMO · A SPEAKS → DISPATCH UPDATES → B IS ALERTED`
- Right: `BMW · OPS CONSOLE` (mono uppercase, `inkFaint`)

### Segmented mono buttons (top bar driver state)

```
fontFamily: FONT_MONO
fontSize: 10
letterSpacing: 0.14em
fontWeight: 600
padding: 5px 10px
background: active ? accentDeep : surface
color:      active ? #fff       : inkSoft
border: 1px solid (active ? accentDeep : hair)
borderRadius: 4
```

### Primary CTA button

```
background: accentDeep
color: #fff
fontFamily: FONT_BODY
fontWeight: 600
fontSize: 12
padding: 7px 10px
borderRadius: 6
border: none
```

### Proactive alert card (Otto)

```
background: amberWash
border: 1px solid hair
borderLeft: 4px solid amberDeep
borderRadius: 10
padding: 14–18px
```

Header line: `Otto · proactive alert` in mono, 10px, `amberDeep`, 0.18em tracking, weight 700, uppercase. Body headline: Space Grotesk, 14px, `ink`, line-height 1.4. Two buttons below: `Dismiss` (ghost) + `Accept reroute` (primary).

### Status / intent chips

Small uppercase mono pill in the relevant accent wash with deep-color text. Examples used in product: `INTENT: report_closure`, `PENDING`, `LIVE`, `DRIVING`, `APPROACHING`, `PARKED`.

### System log line (panel 03 bottom)

- Mono 11px
- `LIVE ●` indicator pulses (`si-pulse` keyframe, 1.6s ease-in-out)
- Each line: `[HH:MM:SS] · driver tag · event text`
- Driver A tag is `accentWash` background + `accentDeep` text; Driver B tag is `ink2Wash` + `ink2Deep`.

### Waveform (Driver A speak button)

- 22 vertical bars, 3px wide, BMW blue.
- Animation: `si-bar` keyframe — `transform: scaleY(0.32) → scaleY(1)`, 0.9s ease-in-out, alternate, staggered by `i * 0.05s`.
- Animates only when voice state is `listening` or `speaking`; static in `standby`.

## Animations

Defined in `index.css`:

```css
@keyframes si-bar {
  0%   { transform: scaleY(0.32); }
  100% { transform: scaleY(1); }
}
@keyframes si-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}
```

Default transition for all interactive states: `all 0.25s`. Map reveal is an instant swap (idle ↔ active) — no fade. Polylines render statically.

## Iconography & imagery

**No external images, logo files, or icon sets.** All glyphs are CSS, SVG, or text characters:

- `▶` for play / run-demo
- `●` for status dots / live indicators
- `·` (middle dot) as a separator in labels, e.g. `BMW · OPS CONSOLE`
- `→` for flow indicators in the bottom strip

The map is hand-rolled SVG (street grid + route polyline + parking heat-spots). If a real map provider (Mapbox/Leaflet) is added later, recreate the closure marker and reroute polyline as overlays.

No avatars or logos for drivers — driver names are plain text strings (`Driver A`, `Driver B`).

## Voice & tone

### Brand voice

- **Precise, calm, operations-grade.** This is an instrument panel, not a chatbot.
- **Spare.** Short labels, no marketing fluff, no exclamation points.
- **Hands-free aware.** The product is voice-first; copy should make sense when read aloud.

### Otto's voice (the assistant's spoken / written lines)

- Direct, helpful, never folksy.
- Asks one clear yes/no question at a time.
- Frames itself as a colleague reporting facts:
  - *"A colleague just reported Maple Street is closed. Want me to show an alternate route?"*
  - *"Looks like a solid spot — want me to save it for your colleagues?"*
- Never apologizes, never thanks the user, never uses emoji.

### Otto is a companion, not a supervisor

This is the load-bearing principle for everything Otto says. Otto rides shotgun with the driver — it helps them, and it never grades them.

- **Otto helps the driver; it never judges them.** Every line should read as a favor done *for* the driver or *for* their colleagues, not as oversight of their performance.
- **Never relay a driver's own behavior back as judgment.** Avoid lines like *"You're running behind"* or *"You missed your window."* Even neutral-sounding status, when pointed *at* the driver, lands as the device watching them.
- **Point intelligence forward, not back.** Aim status at the next stop, the colleague who benefits, or the customer waiting — not at the driver's record. *"Pine Road East has open parking next to your stop"* — forward and useful — not *"You spent eight minutes looking for parking."*
- **Same data, helpful framing.** A report Otto captures should feel like the driver *contributing intel* their colleagues will thank them for, never like being tracked. The parking save (*"want me to save it for your colleagues?"*) is the model: the exact same data point — driver parked here — is felt as contribution, not surveillance, purely because of who it's framed as helping.
- **No friction, no scoring.** Otto never adds steps that feel like a performance check, and never surfaces ratings, rankings, or scorecards to the driver in the cab.

**Why this matters (the evidence).** Discovery research found that when reviews were collected on a driver-held device, drivers entered five-star ratings themselves from the truck — direct behavioral evidence that any in-cab tool which adds friction or appears to judge them will be worked around (INT-1). Driver trust is fragile, and it's defeated quietly rather than complained about. Otto only earns adoption if the driver experiences it as a companion on their side. Dispatch still gets its visibility (Panel 03) — but the driver must never feel that visibility *as* surveillance, which is why the same report is always framed as the driver helping, not being monitored.

### Microcopy patterns (canonical examples)

| Surface | String |
|---|---|
| Wordmark | `StreetIQ` |
| Top-bar tagline | `VOICE COPILOT · DEMO` |
| Panel labels | `PANEL 01`, `PANEL 02`, `PANEL 03`, `PANEL 04` |
| Speak-button idle | `Tap to speak · or say "Hey Otto"` |
| Otto alert header | `Otto · proactive alert` |
| Event log (system speaking) | `StreetIQ → Driver A: approach prompt (awaiting yes/no)` |
| Map heatmap caption | *shared by 47 colleagues* (italic) |
| Bottom strip left | `CLOSED-LOOP DEMO · A SPEAKS → DISPATCH UPDATES → B IS ALERTED` |
| Bottom strip right | `BMW · OPS CONSOLE` |
| Idle panel placeholders | `Map idle` · `Awaiting intelligence` (italic) |
| Primary CTA | `▶ Run Scripted Demo` |
| Reset CTA | `Reset` (ghost) |
| Alert actions | `Dismiss` (ghost) · `Accept reroute` (primary) |

### Capitalization

- Sentence case for body copy and CTAs (`Accept reroute`, not `Accept Reroute`).
- ALL CAPS only for mono chrome labels (`PANEL 01`, `LIVE`, `DRIVING`).
- The wordmark `StreetIQ` is always cased exactly that way.

## Source files (where each piece lives)

| Concern | File |
|---|---|
| Design tokens (CSS) | `artifacts/demo/src/index.css` (`:root` block, `--si-*` variables) |
| Design tokens (JS mirror) | `artifacts/demo/src/App.tsx` (the `SI` const at the top) |
| Font constants | `artifacts/demo/src/App.tsx` (`FONT_HEAD`, `FONT_BODY`, `FONT_MONO`) |
| Panel shell component | `artifacts/demo/src/App.tsx` `PanelShell` (around line 519) |
| Top bar | `artifacts/demo/src/App.tsx` `TopBar` (around line 609) |
| Bottom strip | `artifacts/demo/src/App.tsx` (around line 770) |
| Keyframe animations | `artifacts/demo/src/index.css` (`si-bar`, `si-pulse`) |
| Original handoff README | `attached_assets/README_1778243502828.md` |
| Visual ground-truth prototype | `attached_assets/StreetIQ.html` (open locally) |
| Reference screenshot | `attached_assets/StreetIQ-BMW-after_1778243394316.png` |

## Do / don't

**Do**
- Keep panels flat, separated by 1px hairlines.
- Use mono uppercase with wide tracking for any chrome label.
- Use the per-panel accent rule (3px) and color-coding contract consistently.
- Use `accentDeep` for the single primary CTA on a surface.
- Keep Otto's voice spare, factual, and yes/no-friendly.
- Frame every Otto line as helping the driver or their colleagues — point intelligence forward, at the next stop, the colleague, or the customer.

**Don't**
- Add drop shadows on panels or cards.
- Round panel container corners.
- Add a dark mode or an alternate palette — the theme is locked.
- Mix sans families (no Helvetica/Arial fallbacks beyond `system-ui`).
- Use color outside the four families (accent / amber / rust / ink2) for semantic states.
- Introduce a logo file or icon font — stick to CSS, SVG, and text glyphs.
- Use exclamation points or emoji in Otto's lines or any UI copy.
- Make Otto relay a driver's own behavior back as judgment, or surface ratings, rankings, or scorecards to the driver in the cab — Otto is a companion, not a supervisor.
