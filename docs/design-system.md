# QuantroApex Design System

Single source of truth for all UI decisions. Every screen build references this document.

**Philosophy:** Quiet Confidence — calm, composed, no visual noise.

---

## Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `colorPrimary` | `#0A1628` | Primary text, headers, key UI elements |
| `colorAccent` | `#1B4FD8` | Action buttons, active states, highlights |
| `colorAccentMid` | `#2563EB` | Secondary interactive elements |
| `colorSurface` | `#F0F6FF` | Card backgrounds, info boxes |
| `colorBorder` | `#E2E8F0` | Dividers, input borders, table lines |
| `colorMuted` | `#64748B` | Secondary text, timestamps, labels |
| `colorSuccess` | `#16A34A` | Positive outcomes, profit indicators |
| `colorWarning` | `#D97706` | Threshold alerts, caution states |
| `colorDanger` | `#DC2626` | Loss indicators, emergency states — used sparingly |
| `colorWhite` | `#FFFFFF` | Screen backgrounds, card surfaces |

**Rule:** Use token names in code, never raw hex values. `colorDanger` is used with restraint.

---

## Typography Scale

One font family: **Inter** (fallback: system sans-serif).

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `textDisplay` | 32sp | Bold (700) | Portfolio value on dashboard |
| `textH1` | 24sp | Bold (700) | Screen titles |
| `textH2` | 20sp | Semi-bold (600) | Section headers, card titles |
| `textH3` | 18sp | Semi-bold (600) | Sub-section labels |
| `textBody` | 16sp | Regular (400) | Primary body text |
| `textSecondary` | 14sp | Regular (400) | Supporting text, metadata |
| `textCaption` | 12sp | Regular (400) | Fine print, disclaimers |

Line height: 1.5× for body, 1.2× for headings.

---

## Spacing Scale (8-point grid)

| Token | Value | Usage |
|-------|-------|-------|
| `space1` | 4px | Micro gaps — icon to label |
| `space2` | 8px | Tight spacing within components |
| `space3` | 16px | Standard component padding |
| `space4` | 24px | Section spacing, card padding |
| `space5` | 32px | Large section gaps |
| `space6` | 48px | Screen-level breathing room |

**Rule:** All spacing values are multiples of 8. Never use arbitrary pixel values.

---

## Component Library

### PrimaryButton
- Background: `colorAccent`, text: `colorWhite`
- Border radius: 12px, height: 48px
- Subtle shadow (2px max)
- Press: 100ms opacity reduction

### SecondaryButton
- Transparent background, `colorAccent` border and text
- Same dimensions as PrimaryButton

### GhostButton
- No border, `colorMuted` text — low-emphasis actions

### InputField
- Background: `colorWhite`, border: `colorBorder`
- Border radius: 12px, height: 48px, text: `textBody`

### Card
- Background: `colorWhite`, border: `colorBorder`
- Border radius: 12px, padding: `space4`
- Subtle shadow (2px max)

### ActivityFeedEntry
- Card variant with left accent bar
- Asset badge, plain-English text, timestamp in `textCaption colorMuted`

### StrategyCard
- Card variant with risk badge, asset class chip
- Sparkline area, user count in `textCaption`

### MetricTile
- Label: `textCaption colorMuted`
- Value: `textH2 colorPrimary`

### StatusBadge
- Small pill, coloured background matching status
- Text: `textCaption colorWhite`

### BottomSheet
- White surface, drag handle, `space4` padding

---

## Motion & Animation

| Action | Duration | Easing |
|--------|----------|--------|
| Screen transitions | 200ms | fade |
| Bottom sheet open | 250ms | ease-out |
| Activity feed entry | 150ms | fade-in |
| Button press | 100ms | opacity reduction |

**Never:** looping animations, celebratory motion, attention-seeking transitions.

---

## Experience Level Density

| Setting | Newcomer | Intermediate | Professional |
|---------|----------|--------------|--------------|
| Card padding | space4 | space3 | space3 |
| Information density | Low | Medium | High |
| Tooltip visibility | Always | On tap | Hidden |
| AI reasoning detail | Full plain-English | Summarised | Technical + expandable |
| Metric display | Key 3 only | Standard set | Full suite |

Implemented via `appDensity` on user profile — components read and adapt.

---

## Quiet Confidence Quick Reference

| Never do this | Always do this instead |
|---------------|------------------------|
| Red banner alerts for losses | Muted red text number only |
| Green celebration for profits | Green text number — composed |
| Gradient backgrounds | Flat white or flat colorSurface |
| Heavy drop shadows | Subtle 1px border, 2px shadow max |
| Full-screen loading spinners | Skeleton placeholders |
| Pop-up notifications within app | Inline status in activity feed |
| Decorative icons | Functional icons only (Material Symbols) |
| Bold colour for simulation mode | Subtle muted badge |
| Aggressive CTAs | Calm single-word buttons |
| Multiple competing actions | One primary action per screen |

---

## Iconography

- Library: Material Symbols
- Sizes: 20px inline, 24px navigation, 32px feature
- Colour: always matches accompanying text
