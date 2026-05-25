# PrintLoop — Brand Guidelines

> The single source of truth for how PrintLoop looks, sounds and behaves.
> Every value here is the **real design system** shipped in the product
> (`tailwind.config.js` + `src/index.css`). Build to these tokens — don't
> reinvent them.

---

## 1. Brand essence

**PrintLoop is the campus print press.** It takes something mundane —
printing a document — and gives it the confidence and craft of an editorial
broadsheet.

- **Personality:** Editorial · Utilitarian · Confident · Nigerian-campus.
- **Feels like:** a well-set newspaper meets a dependable machine.
- **Three words:** *Printed. Plainly. Properly.*
- **We are:** precise, warm, a little wry, never corporate or cute.

The aesthetic is **editorial-brutalist**: warm paper stock, ink-black type,
hard 2px rules, hard offset shadows (no soft blur), a single hot accent.

---

## 2. Logo & wordmark

**Wordmark:** `PrintLoop.` — set in **Fraunces**, extra-bold, tight
tracking. The **full stop is persimmon (`#D14B2C`) and is mandatory** — it
is the brand's signature ("a loop, closed").

```
PrintLoop.      ← "PrintLoop" in ink, "." in persimmon
```

- **Clear space:** at least the height of the capital "P" on all sides.
- **Minimum size:** 20px tall on screen. Never below legibility of the dot.
- **Secondary mark:** the fleuron **❦** in ochre (`#C7944A`) — used as an
  end-mark / divider, never as a primary logo.
- **Folio device:** small caps editorial line, e.g.
  `VOL. I · ISSUE 09 · LAGOS, NIGERIA` — a flavour element, not the logo.

**Misuse — never:** recolour the wordmark, drop or recolour the persimmon
dot, add gradients/bevels/soft shadows, stretch, outline, place on a busy
photo, or rebuild it in another typeface.

---

## 3. Colour

| Token | Hex | RGB | Role |
|---|---|---|---|
| **Ink** | `#1A1410` | 26·20·16 | Primary text, borders, dark surfaces |
| **Paper** | `#F8F4ED` | 248·244·237 | Default background |
| **Paper-light** | `#FFFEFA` | 255·254·250 | Cards, inputs, raised surfaces |
| **Persimmon** | `#D14B2C` | 209·75·44 | **Primary accent** — CTAs, active, focus, the dot |
| **Ochre** | `#C7944A` | 199·148·74 | Editorial folio / warm secondary |
| **Sage** | `#6B7A5C` | 107·122·92 | Admin surfaces, calm/positive states |
| **Fog** | `#888888` | 136·136·136 | Muted text, disabled, "done" |

**Usage discipline**
- Roughly **60 Paper / 30 Ink / 10 Persimmon**. Persimmon is a *spice*, not
  a base — one primary action per view.
- Text selection is always Persimmon-on-Paper (`::selection`).
- Sage is the **admin console** signature (sidebar/identity). Ochre carries
  editorial folios and the fleuron. Fog never carries meaning alone.
- **Don't:** introduce new accent colours, tint Paper toward grey, use pure
  `#000`/`#FFF`, or use Persimmon for large fills/long text.

**Contrast:** Ink on Paper and Paper on Ink/Persimmon/Sage pass AA for body
text. Fog is for secondary text only — never for primary content or on
Persimmon.

---

## 4. Typography

| Family | Use | Notes |
|---|---|---|
| **Fraunces** (serif) | Display, headlines, editorial voice | `.pl-serif`; **italic** for warmth/taglines |
| **Inter** (sans) | UI, body, labels, navigation | Default `body` font |
| **JetBrains Mono** | Codes, PINs, prices, numerals, IDs | `.pl-mono` — anything a human reads back |

**Signature styles**
- **Editorial label** (`.editorial-label`): `UPPERCASE`, weight 700, size
  10px, letter-spacing **0.2em** (`tracking-editorial`). The structural
  label of the whole UI.
- **Headlines:** Fraunces, bold/extra-bold, tight tracking; mix an
  *italic persimmon* word for emphasis ("release", "your way").
- **Editorial folio** (`.editorial-folio`): Fraunces italic, ochre.
- **Numerals/codes:** always JetBrains Mono (release codes, ₦ amounts,
  kiosk PINs, wallet balances).

**Scale (screen):** Display 42–48 · H1 32–40 · H2 20–24 · Body 14–16 ·
Label 10–11. Currency is **Naira `₦`** in mono, thousands-separated.

**Don't:** set body in Fraunces, set headlines in Inter, use a 4th typeface,
or letterspace body text.

---

## 5. Form language (the "feel")

This is what makes PrintLoop recognisable:

- **Borders:** solid **2px Ink** (`border-2 border-ink`). Hairlines use
  `border-ink/10–20`.
- **Hard offset shadow, never blur:** raised/interactive elements lift on
  hover with `translate(-3px,-3px)` + `box-shadow: 5px 5px 0 #1A1410`
  (primary uses an Ink shadow; dark uses a Persimmon shadow). Active
  resets to flat. **No soft/blurred drop shadows anywhere.**
- **Radius:** `rounded-md` for buttons/inputs/cards; `rounded-full` for
  chips & pills. Never fully sharp, never pill-soft everywhere.
- **Rules & grids:** editorial horizontal rules (`border-t-2 border-ink`),
  generous column grids, table headers on Ink.
- **Surfaces:** Paper page → Paper-light cards → Ink bands for section
  headers/summaries.

---

## 6. Components (use the shipped classes)

| Element | Class | Spec |
|---|---|---|
| Primary button | `pl-btn-primary` | Persimmon/Paper, lift + Ink hard-shadow |
| Dark button | `pl-btn-dark` | Ink/Paper, lift + Persimmon hard-shadow |
| Ghost button | `pl-btn-ghost` | Transparent/Ink border |
| Input | `pl-input` | 2px Ink, focus = lift + Persimmon hard-shadow; `.error` = Persimmon border |
| Card | `pl-card` | Paper-light, 2px Ink, hover lift |
| Chip (choice) | `pl-chip` / `pl-chip-active` | Pill, active = Persimmon |
| Status pill | `pl-pill` (+`-ready`/`-done`) | Tiny uppercase, tracked; **carries a text label** (never colour-only) |
| Section label | `editorial-label` | The universal structural caption |
| Slider | `pl-slider` | Persimmon accent |

**Buttons:** exactly **one** `pl-btn-primary` per view (the main action).
Everything else is dark or ghost.

**Patterns:** newspaper **marquee** ticker (status/announcements),
**masthead** (wordmark + nav, Ink rule under), **footer** sign-off, Ink
**summary bands**, mono **release-code** blocks, **QR** as a shareable
artdefact (always paired with the code text + link).

---

## 7. Motion

Motion is **functional and brief** — confirm, don't decorate.

| Animation | Where |
|---|---|
| `marquee` (32s linear) | Announcement ticker |
| `pulse-ring` (Persimmon) | The current step in a flow |
| `blink` | Live "● online" indicators |
| `pulse-soft` | Subtle live dots |
| `fadein` (0.5s, 4px rise) | Page/section entrance |

No parallax, no bounce, no long transitions. Hover = the 150ms hard-shadow
lift. Respect reduced-motion.

---

## 8. Voice & tone

PrintLoop writes like a confident broadsheet that happens to run a printer.

- **Register:** editorial, plain, a touch formal-with-a-wink. Sign off
  *"Yours faithfully — PrintLoop."* Folios like *"VOL. I · ISSUE 09 ·
  LAGOS"*.
- **Headlines:** short, active, one italic persimmon emphasis word.
  > "Many files, each **your way**." · "Upload, price, preview, **release**."
- **Microcopy:** italic serif for warmth/reassurance
  ("Unprinted jobs are auto-refunded to your wallet."); UPPERCASE labels for
  structure.
- **Do:** be precise about money, time and pages; use ₦; say what happens
  next.
- **Don't:** exclamation-spam, emoji in product UI, jargon, corporate
  filler ("seamless", "synergy"), or scare the user.
- **Errors:** factual + the fix. "Wallet short by ₦450 — top up or pay with
  Paystack." Never blame the user.

---

## 9. Accessibility

- Maintain AA contrast (Ink/Paper, Paper/Persimmon, Paper/Sage). Fog =
  secondary only.
- **Never colour-only:** status always has a text label (pills do this).
- Focus is highly visible by design (lift + Persimmon hard-shadow) — keep
  it; don't remove outlines without the equivalent.
- Touch/click targets ≥ 40px (kiosk ≥ 56px — gloved hands, glance use).
- Honour `prefers-reduced-motion` (disable marquee/pulse).

---

## 10. Surface applications

- **Customer web app:** Paper canvas, editorial masthead + marquee, one
  Persimmon CTA per step, mono codes, sticky footer sign-off.
- **Admin console:** **standalone, no customer chrome.** Sage identity
  sidebar, Ink tables, Persimmon for destructive/primary confirms. Denser,
  more utilitarian.
- **Kiosk:** dark **Ink** background, oversized **mono** code entry,
  Persimmon validate/release, huge tap targets, minimal words, status dot.
- **Shareable QR:** white-padded PNG, code in mono beneath, link included —
  it's a brand artefact that travels.
- **Electron kiosk:** fullscreen, chrome-free; the app *is* the brand.

---

## 11. Quick token reference (for build)

```
Colours   ink #1A1410 · paper #F8F4ED · paper-light #FFFEFA
          persimmon #D14B2C · ochre #C7944A · sage #6B7A5C · fog #888888
Type      serif "Fraunces"  ·  sans "Inter"  ·  mono "JetBrains Mono"
Tracking  editorial = 0.2em (uppercase labels)
Shadow    hard offset only: 5px 5px 0 ink  (+ translate -3px,-3px on hover)
Border    2px solid ink   ·   Radius md (full for chips/pills)
Currency  ₦ (NGN), mono, thousands-separated
Classes   .pl-serif .pl-mono .editorial-label .editorial-folio .editorial-rule
          .pl-btn-primary .pl-btn-dark .pl-btn-ghost .pl-input .pl-card
          .pl-chip[-active] .pl-pill[-ready|-done] .pl-slider
Logo      "PrintLoop." — Fraunces extra-bold, persimmon full stop (required)
Sign-off  "Yours faithfully — PrintLoop."   End-mark ❦ (ochre)
```

---

## 12. Misuse — never

- Recolour or de-dot the wordmark.
- Add soft/blurred shadows, gradients, glows, or bevels.
- Introduce colours outside the seven tokens.
- Use Fraunces for body or Inter for display.
- More than one primary (Persimmon) action in a view.
- Pure black/white, grey-tinted paper, or low-contrast Fog text.
- Emoji or exclamation-driven copy in product UI.
- Give a status by colour alone.

---
*Grounded in the shipped system (`tailwind.config.js`, `src/index.css`).
If the code and this document disagree, fix the mismatch — don't fork the
brand.*
