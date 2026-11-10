---
name: DevOpsPulse System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#5a4136'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#8e7164'
  outline-variant: '#e3bfb1'
  surface-tint: '#a23f00'
  primary: '#a23f00'
  on-primary: '#ffffff'
  primary-container: '#ff6700'
  on-primary-container: '#561e00'
  inverse-primary: '#ffb595'
  secondary: '#59605f'
  on-secondary: '#ffffff'
  secondary-container: '#dde4e3'
  on-secondary-container: '#5f6665'
  tertiary: '#0061a2'
  on-tertiary: '#ffffff'
  tertiary-container: '#019cff'
  on-tertiary-container: '#003156'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcd'
  primary-fixed-dim: '#ffb595'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#7c2e00'
  secondary-fixed: '#dde4e3'
  secondary-fixed-dim: '#c1c8c7'
  on-secondary-fixed: '#161d1d'
  on-secondary-fixed-variant: '#414848'
  tertiary-fixed: '#d1e4ff'
  tertiary-fixed-dim: '#9dcaff'
  on-tertiary-fixed: '#001d35'
  on-tertiary-fixed-variant: '#00497c'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  code-inline:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system is crafted for autonomous engineers, solo developers, and students who need critical observability without cognitive overload. The personality balances razor-sharp utility with tranquil confidence: serious, unpretentious, crisp, and disciplined. 

Drawing heavily from modern technical platforms like Linear and Vercel, the design embraces structured minimalism and high-density legibility. The emotional response should be one of complete operational clarity—eliminating panic during outages while celebrating uninterrupted uptime. Key visual characteristics include precise 1px hairline dividers, razor-sharp typography, deliberate white space, and purposeful high-contrast accents against a light, clinical canvas.

## Colors

The palette employs a restrained, light-dominant scheme that anchors data clarity and rapid visual triage. 

- **Primary Accent (`#ff6700` - Blaze Orange)**: Reserved strictly for primary callouts, critical active triggers, ongoing incident indicators, and focused states. Used sparingly to preserve impact.
- **Deep Ink (`#070d0d`)**: Primary text, structural headers, active tab highlights, and dark tactile buttons.
- **Surface Grays**:
  - `Canvas Background`: `#f8fafc` (Slate 50)
  - `Card / Modal Surface`: `#ffffff`
  - `Muted Container Surface`: `#f1f5f9` (Slate 100)
  - `Border / Hairline`: `#e2e8f0` (Slate 200)
  - `Subtle Divider`: `#cbd5e1` (Slate 300)
  - `Secondary Text`: `#64748b` (Slate 500)
  - `Body Text`: `#0f172a` (Slate 900)
- **Status System**:
  - **Up / Operational**: Fill `#10b981`, Subtle Tint `#ecfdf5`, Border `#a7f3d0`
  - **Degraded Performance**: Fill `#f59e0b`, Subtle Tint `#fffbeb`, Border `#fde68a`
  - **Down / Outage**: Fill `#ef4444`, Subtle Tint `#fef2f2`, Border `#fecaca`
  - **Unknown / Maintenance**: Fill `#64748b`, Subtle Tint `#f1f5f9`, Border `#e2e8f0`

All functional text pairings exceed WCAG 2.1 AA contrast thresholds against their designated surface containers.

## Typography

Typography is set exclusively in **Inter** to ensure maximum tracking efficiency, tabular digit compatibility, and clean rendering across high-DPI and standard monitors. 

- **Tracking Rules**: Negative letter-spacing is applied progressively as font sizes increase (`-0.03em` for large headers down to `0` for labels) to reproduce the compact, engineered visual tone of developer-first tooling.
- **Tabular Figures**: Latency metrics, uptime percentages, and status timestamps must enforce `font-variant-numeric: tabular-nums` to eliminate jitter across real-time polling updates.
- **Monospace Code Anchors**: Technical URLs, status error codes, and hostnames should utilize `code-inline` with subtle pill encapsulation (`#f1f5f9` fill, `#e2e8f0` border).

## Layout & Spacing

The layout is built around a rigorous 8px spatial grid, optimized for data-dense dashboards and flexible information architecture.

- **Grid Model**: 
  - **Desktop (>= 1280px)**: 12-column responsive fluid grid with `margin: 2rem` and `gutter: 1.5rem`. Max inner wrapper set to 1440px centered.
  - **Tablet (768px - 1279px)**: 8-column layout with `margin: 1.5rem` and `gutter: 1rem`.
  - **Mobile (< 768px)**: 4-column layout with `margin: 1rem` and `gutter: 1rem`. Dashboard sidebar collapses into a slide-over panel.
- **Vertical Rhythm**: Micro-padding across inputs and control bars relies on `space-xs` (4px) and `space-sm` (8px). Structural cards and chart widgets leverage `space-md` (16px) internally, scaling up to `space-lg` (24px) for expansive analytical overviews.

## Elevation & Depth

This design system avoids blurry drop-shadows and skeuomorphic illusions in favor of **low-contrast outlines, hair-thin borders, and clean tonal layering**.

- **Hairline Definition**: All cards, inputs, and popovers maintain a precise `1px solid #e2e8f0` border. Separators between list items and table rows use standard hairline borders without drop-shadow offsets.
- **Tonal Elevation**:
  - `Level 0 (Base Canvas)`: `#f8fafc`
  - `Level 1 (Panels & Cards)`: Pure `#ffffff` framed by `#e2e8f0`.
  - `Level 2 (Dropdowns, Tooltips, Flyouts)`: Pure `#ffffff` with a crisp `0 4px 12px rgba(15, 23, 42, 0.05)` shadow and a `1px solid #cbd5e1` edge to guarantee separation from underlying white cards.
  - `Level 3 (Modal Dialogs)`: `#ffffff` overlaying a backdrop blur (`backdrop-filter: blur(4px)`) tinted with `rgba(15, 23, 42, 0.40)`.
- **Focus Elevation**: Interactive items receive an offset double-ring on focus: `0 0 0 2px #ffffff, 0 0 0 4px #ff6700`.

## Shapes

The geometric form language is strict, modern, and compact:

- **Interactive Controls (Inputs, Buttons, Dropdowns, Toggles)**: Strict 8px border-radius (`0.5rem`). This provides balanced affordance while staying crisp and architectural.
- **Content Cards & Containers**: Fixed 12px border-radius (`0.75rem`) to frame chart regions, monitor groups, and incident timelines.
- **Badges & Status Chips**: Micro-pill styling (9999px border-radius) or 6px rounded rectangles for compact, tag-style classification.
- **Bar Graphs & Latency Segments**: Strict 2px corner radius on individual uptime pulse bars to preserve clean vertical alignment in high-density time spans.

## Components

### Buttons
- **Primary**: Solid `#070d0d` background, white label, 8px radius, height 36px (compact) or 40px (default). Hover: `#0f172a`. Active: `#000000`.
- **Accent (Critical / Trigger)**: Solid `#ff6700` background, white label, 8px radius. Hover: `#e05a00`.
- **Secondary / Outline**: White background, 1px border `#e2e8f0`, label `#0f172a`. Hover: background `#f1f5f9`, border `#cbd5e1`.
- **Ghost**: Transparent background, text `#64748b`. Hover: background `#f1f5f9`, text `#0f172a`.
- **Destructive**: Outline with `#ef4444` text and border or solid `#ef4444` fill for irreversible incident teardowns.

### Status Badges & Chips
- Status badges always pair a geometric icon or solid dot with concise text.
- **Up**: Dot `#10b981`, background `#ecfdf5`, text `#065f46`, border `1px solid #a7f3d0`.
- **Degraded**: Dot `#f59e0b`, background `#fffbeb`, text `#92400e`, border `1px solid #fde68a`.
- **Down**: Dot `#ef4444`, background `#fef2f2`, text `#991b1b`, border `1px solid #fecaca`.
- **Unknown / Paused**: Dot `#64748b`, background `#f1f5f9`, text `#334155`, border `1px solid #e2e8f0`.

### Cards & Monitor Panels
- Container: Surface `#ffffff`, border `1px solid #e2e8f0`, radius 12px, padding 20px.
- Internal layout: Top row holds the monitor label, hostname, and active status chip. Center row holds live response latency and 90-day uptime bars. Bottom row displays last incident timestamp and quick action triggers.

### Inputs & Form Controls
- Height 38px, border `1px solid #e2e8f0`, radius 8px, background `#ffffff`, text `#0f172a`, placeholder text `#94a3b8`.
- Focus state: Outline none, border `#ff6700`, box-shadow `0 0 0 3px rgba(255, 103, 0, 0.15)`.
- Checkboxes: 16x16px square, radius 4px, border `#cbd5e1`, checked state `#070d0d` with white icon.

### Uptime Timeline Strip
- Composed of 60 to 90 vertical bars, 3px width, 24px height, 2px corner radius, separated by 2px gaps.
- Color dynamically indicates state: Green (`#10b981`), Amber (`#f59e0b`), Red (`#ef4444`), Empty/Inactive (`#e2e8f0`).
- Tooltip appears on bar hover detailing date, uptime percentage, and recorded average latency.

### Incident Banner
- High-priority operational banner docked below navigation.
- Alert mode: `#fef2f2` background, `1px solid #fecaca` border, left accent rail 4px `#ef4444`. Incident title in `#991b1b`, with an immediate link to real-time logs.