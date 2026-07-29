# PPL Tracker — Design System

Every color below was sampled from the owner's own `PPL_Workout_plan.pdf`. He designed
that document deliberately; the app should feel like the same artifact, not a different
product that happens to hold the same data. Do not substitute "nicer" colors.

---

## 1. Palette

### Day identity (from the PDF card headers)

| Day | Hex | Use |
|---|---|---|
| Push | `#3264d8` | Card headers, active nav, primary buttons on push days |
| Pull | `#0f7c72` | Same, pull days |
| Legs | `#b40d42` | Same, leg days |

The whole screen re-tints by day. This is the fastest possible answer to "what am I
training today" — recognisable before a word is read.

### Muscle role badges (from the PDF target rows)

| Role | Background | Text |
|---|---|---|
| Main | `#fde2e2` | `#4b1528` |
| Syn | `#fff0cc` | `#412402` |
| Stab | `#ddf4ea` | `#04342c` |

Pale fills with dark text, exactly as printed. These stay light-on-dark in the app —
they read as inset labels, which is correct.

### Prescription semantics (from the PDF boxes)

| Meaning | Hex | Source in PDF |
|---|---|---|
| Power / Strength | `#dbe7ff` | the SETS box on power rows |
| Hypertrophy | `#d9f2df` | the LOAD box on hyper rows |
| Progression | `#d9f2df` w/ text `#1f7a3e` | the "+5 lb when maxxed" box |
| Rest | `#fbe4c7` w/ text `#b85a00` | the REST box |

**Power and Hypertrophy must be visually distinguishable at a glance** — blue vs green,
carried on a 3px left border of the block, on the block's label, and on its load pills.

### App surfaces

| Token | Hex | Use |
|---|---|---|
| `SURFACE.base` | `#0b0d10` | Page background |
| `SURFACE.raised` | `#14181d` | Standard cards |
| `SURFACE.elevated` | `#1b212a` | Emphasised panels, overlay headers |
| `SURFACE.sunken` | `#08090b` | Inset wells (charts, entry lists) |
| `BORDER.subtle` | `#232a32` | Default hairline between elements |
| `BORDER.strong` | `#39424e` | Section boundaries, slot separators |
| `--text` primary | `#e8ecf1` | |
| `--text-dim` secondary | `#b9c2cc` | |
| `--text-mute` tertiary | `#7b8794` | |
| illustration plate | `#ffffff` | |

Dark-first. The artwork is line art on white, so it always sits on a white plate — never
try to knock it out or invert it.

**Elevation rules:**
- Never place a raised surface on another raised surface.
- Cards always have a `1px BORDER.subtle` border.
- Emphasised panels (elevated) use `BORDER.strong`.
- No drop shadows — elevation is conveyed by color value only.
- Inset wells (charts, diary entry lists) use `SURFACE.sunken` with `BORDER.subtle`.

### Section pattern

Every logical group of content follows this structure:

1. **Section header** — uppercase, `PALETTE.mute`, font-size 11px, letter-spacing 0.08–0.1em, 24px above, 8px below.
2. **Section body** — on the appropriate elevation surface.

```tsx
// Section header example
<div style={{ fontSize: 11, fontWeight: 600, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 24, marginBottom: 8 }}>
  Section Name
</div>
```

### Safe area

All page-level and overlay headers must include the iOS status bar inset:

- **Regular page headers** (scroll views): `paddingTop: 'max(env(safe-area-inset-top), 12px)'`
- **Fixed / full-screen overlay headers** (`position: fixed; inset: 0`): `paddingTop: 'max(env(safe-area-inset-top), 0px)'`

Do not apply `padding-top: env(safe-area-inset-top)` to `body` — each page header owns its own inset.

---

## 2. Typography

- Numbers — weights, reps, timers, e1RM — always monospace with tabular figures.
  Digits must not shift width as they change. This is the single highest-impact
  typographic decision in the app.
- Body and labels — system sans.
- Two weights only: 400 and 500. No 600, no 700.
- **Sentence case everywhere.** No ALL CAPS labels, no Title Case.
- Minimum 12px. Muscle badge text 11px is the only exception.

---

## 3. Naming — required changes

| Wrong | Right |
|---|---|
| "Hyper" | **"Hypertrophy"** — spell it out, there is room |
| "Main set" / "Back-off set" | **Delete entirely.** These are not the owner's vocabulary and appear nowhere in his plan. |

Block labels come from the plan and only from the plan: **Power, Hypertrophy, Strength,
RDL, High row, Weighted, Bodyweight, Work, Burnout.** If a label in the seed data isn't
in that list or in `plan-content.ts`, it's wrong.

`Main` survives only as the muscle-role badge, which is the owner's own term for the
primary target. Do not overload the word for anything else.

---

## 4. Touch and layout

Research-backed constraints for one-handed gym use:

- **Tap targets minimum 48×48px.** Steppers 48, primary log button 50.
- **Primary action at the bottom** of the card, inside the natural thumb arc.
- **Bottom navigation**, 3–5 destinations, never a hamburger.
- **One decision per screen.** The expanded exercise card should answer "what do I lift
  right now" without scrolling.
- Numeric inputs directly tappable for keyboard entry — steppers for adjustment, not the
  only route.

---

## 5. Exercise card anatomy

Top to bottom, expanded state:

1. **Header** in the day color: index, name, and `n of m sets` progress.
2. **Illustration** on a white plate.
3. **Prescription blocks**, one per block, each with:
   - 3px left border in the block's semantic color (blue power / green hypertrophy)
   - label + `sets × reps · rest` on one line
   - load pills: computed working weight, plus progression rule where one exists
   - last session's actual sets in mono, dimmed
4. **Stepper + log button.** Button label states the whole action: `Log set 4 · 185 lb × 5`.
5. **Muscle badges** — Main / Syn / Stab rows.
6. **Watch form** and **Form cues** as equal secondary buttons. Form text is collapsed by
   default; it's reference, not something read every set.

Collapsed row: thumbnail, name, next-set prescription, last session's top set.

---

## 6. Motion and feedback

- Rest timer is the only animated element. Ring or bar, day-colored.
- **Audible cue on timer completion — `navigator.vibrate` does not work in iOS Safari.**
  A short WebAudio tone. Never rely on vibration alone.
- Logging a set: the row appears immediately, no spinner, no transition longer than 150ms.
- Reduce motion: respect `prefers-reduced-motion`.

---

## 7. Restraint

- One accent per screen — the day color. Everything else is neutral.
- No gradients, no glows, no shadows beyond focus rings.
- Charts use the day color plus one neutral. Never a rainbow.
- Empty states name the next action ("Log your first set"), never apologise.
