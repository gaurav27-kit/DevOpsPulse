# DevOpsPulse Design Tokens & Route Mapping

Extracted directly from `frontend/design-reference/stitch_devopspulse_monitoring_dashboard/` and `devopspulse_system/DESIGN.md`.

---

## 1. Route to Design Inventory Mapping

| App Route | Page Component | Design Reference Folder / Screen | Notes |
|---|---|---|---|
| `/login` | `LoginPage.jsx` | `login_devopspulse` | Full match (card auth form, brand mark, live pill, inline error banner) |
| `/register` | `RegisterPage.jsx` | `register_devopspulse` | Full match (card registration form, terms hint, password confirmation) |
| `/dashboard` | `DashboardPage.jsx` | `dashboard_devopspulse`, `dashboard_empty_state_devopspulse`, `mobile_dashboard_devopspulse` | Full match (stat cards, range selector 24h/7d/30d, incident alert rail, onboarding empty state, mobile layout) |
| `/applications` | `ApplicationsPage.jsx` | `applications_devopspulse`, `applications_no_results_devopspulse`, `applications_mobile_devopspulse` | Full match (summary stat cards, search/filter bar, active filter pills, data table, empty filtered state, mobile layout) |
| `/applications/new` | `ApplicationCreatePage.jsx` | `add_application_devopspulse` | Full match (form card with target endpoint, environment, check interval, timeout, duplicate URL warning banner) |
| `/applications/:id/edit` | `ApplicationEditPage.jsx` | *(Derived from `add_application_devopspulse`)* | No dedicated design folder. Uses same form layout, pre-populating fields and updating action buttons |
| `/applications/:id` | `ApplicationDetailsPage.jsx` | *(Derived from `incident_details...` & `dashboard...`)* | No dedicated design folder. Follows page header with status badge, actions (Check Now, Edit, Delete), uptime metric cards, response time chart, health check history table |
| `/incidents` | `IncidentsPage.jsx` | `incidents_devopspulse`, `incidents_empty_state_devopspulse` | Full match (summary cards MTTR/active, filter toolbar, active outage rail, incidents table, clean empty state) |
| `/incidents/:id` | `IncidentDetailsPage.jsx` | `incident_details_orders_api_is_down_devopspulse`, `resolve_incident_modal_devopspulse` | Full match (critical incident banner, severity & status badges, metadata facts grid, timeline stream, action buttons, resolve modal) |
| `/deployments` | `DeploymentsPage.jsx` | `deployments_devopspulse`, `deployments_mobile_devopspulse` | Full match (summary cards, webhook sync rail, deployments table, commit SHA pills, environment badges, status chips) |
| `/deployments/new` | `DeploymentCreatePage.jsx` | `record_deployment_devopspulse` | Full match (audit event notice banner, manual entry indicator, application select, version, branch, commit SHA, dates) |
| `*` (404) | `NotFoundPage.jsx` | *(Derived from design system)* | No dedicated design folder. Uses centered clean card on `bg-surface`, `#131b2e` heading, muted explanation, and primary button |

### Designs With No App Route
- `devopspulse_system/DESIGN.md`: Design system documentation (token specifications, not a route).

---

## 2. Extracted Design Tokens

### A. Color Palette (Exact Hex Values & Roles)

#### Canvas & Surfaces
| Token | Hex Value | Role / Usage |
|---|---|---|
| `surface` / `background` | `#faf8ff` | App canvas background (Light clinical canvas) |
| `surface-bright` | `#faf8ff` | Focus / bright highlight surface |
| `surface-dim` | `#d2d9f4` | Dimmed surface state |
| `surface-container-lowest` | `#ffffff` | Primary card background, modal dialog surface, white input background |
| `surface-container-low` | `#f2f3ff` | Secondary background, filter bar background, table row hover, badge tint |
| `surface-container` | `#eaedff` | Subtle divider lines, pill container fill, inactive segments |
| `surface-container-high` | `#e2e7ff` | Active navigation pill, breadcrumb highlight, table header fill |
| `surface-container-highest` | `#dae2fd` | Border / hairline containers, subtle chip backgrounds |
| `inverse-surface` | `#283044` | Dark tooltips, modal backdrop tint, inverse blocks |
| `inverse-on-surface` | `#eef0ff` | Text on dark inverse surfaces |

#### Text & Foreground (Ink)
| Token | Hex Value | Role / Usage |
|---|---|---|
| `on-surface` / Deep Ink | `#131b2e` / `#070d0d` | Primary headings, table text, high-emphasis body text |
| `on-surface-variant` | `#5a4136` | Secondary body text, field labels, metadata timestamps |
| `secondary` | `#59605f` | Muted descriptions, placeholder icons, inactive tabs |
| `outline` | `#8e7164` | Standard input borders, card outlines |
| `outline-variant` | `#e3bfb1` | Soft dividers, breadcrumb separators |

#### Primary & Accents
| Token | Hex Value | Role / Usage |
|---|---|---|
| `primary-container` | `#ff6700` | Blaze Orange: Action triggers, "Add Application", ping indicators, focus rings |
| `primary` | `#a23f00` | High-contrast accessible orange: Links, active icon fills, breadcrumb highlights |
| `on-primary` | `#ffffff` | Text on primary buttons |
| `on-primary-container` | `#561e00` | High-contrast text on primary-container |
| `primary-fixed` | `#ffdbcd` | Soft orange pill background for "Investigating" / "Degraded" |
| `on-primary-fixed` | `#351000` | Dark text on primary-fixed |
| `on-primary-fixed-variant` | `#7c2e00` | Medium-dark text on primary-fixed badges |
| `tertiary` | `#0061a2` | Clean technical blue: Service URLs, git branch links, verification badges |
| `tertiary-container` | `#019cff` | Vibrant sky blue for live pulses |
| `on-tertiary` | `#ffffff` | Text on tertiary buttons |

#### Status & Feedback System
| Status | Dot / Accent Fill | Container / Subtle Tint | Text Color | Border Hairline |
|---|---|---|---|---|
| **Up / Operational** | `#10b981` | `#ecfdf5` | `#065f46` (Pass 7.29:1) | `#a7f3d0` |
| **Degraded** | `#f59e0b` | `#fffbeb` | `#92400e` (Pass 6.84:1) | `#fde68a` |
| **Down / Outage** | `#ef4444` | `#fef2f2` | `#991b1b` (Pass 7.60:1) | `#fecaca` |
| **Unknown / Paused** | `#64748b` | `#f1f5f9` | `#334155` (Pass 9.45:1) | `#e2e8f0` |
| **Error / Alert Banner** | `#ba1a1a` | `#ffdad6` | `#93000a` (Pass 7.24:1) | `#ba1a1a` |

---

### B. Typography & Font Hierarchy

- **Font Family**: `Inter` exclusively (loaded offline via `@fontsource-variable/inter`). Tabular metrics use `font-variant-numeric: tabular-nums`.

| Token | Size | Line Height | Letter Spacing | Font Weight | Context |
|---|---|---|---|---|---|
| `display-lg` | 36px (2.25rem) | 44px | -0.03em | 600 (Semibold) | Metric numbers (e.g., "99.2%", "245ms", "4") |
| `headline-lg` | 28px (1.75rem) | 36px | -0.025em | 600 (Semibold) | Page main titles (e.g., "Applications", "Orders API is down") |
| `headline-lg-mobile` | 22px (1.375rem) | 28px | -0.02em | 600 (Semibold) | Mobile screen page titles |
| `headline-md` | 20px (1.25rem) | 28px | -0.02em | 600 (Semibold) | Card titles, section headers, modal headings |
| `headline-sm` | 16px (1rem) | 24px | -0.015em | 600 (Semibold) | Sub-headings, compact headers |
| `body-lg` | 15px (0.9375rem) | 24px | -0.01em | 400 (Regular) | Introductory copy, modal descriptions |
| `body-md` | 14px (0.875rem) | 20px | -0.005em | 400 (Regular) | Default body text, table cell contents, form inputs |
| `body-sm` | 13px (0.8125rem) | 18px | 0em | 400 (Regular) | Helper text, secondary descriptions, metadata |
| `label-md` | 13px (0.8125rem) | 18px | 0em | 500 (Medium) | Input labels, button text, table column headers |
| `label-sm` | 12px (0.75rem) | 16px | +0.01em | 500 (Medium) | Small status badges, uppercase section category titles |
| `code-inline` | 12px (0.75rem) | 16px | -0.01em | 500 (Medium) | Commit SHAs, URLs, status codes, environment tags |

---

### C. Shapes & Border Radii

| Token | CSS Value | Usage |
|---|---|---|
| `rounded-sm` | `0.125rem` (2px) | Uptime bar segments, micro accents |
| `rounded` (DEFAULT) | `0.25rem` (4px) | Checkboxes, inline code badges |
| `rounded-md` | `0.375rem` (6px) | Compact action buttons, filter tags |
| `rounded-lg` | `0.5rem` (8px) | Form inputs, select dropdowns, action buttons |
| `rounded-xl` | `0.75rem` (12px) | Content cards, stat cards, modal dialogs, banners |
| `rounded-full` | `9999px` | Status badges, pills, round avatar icons |

---

### D. Spacing & Dimensions

- **Spatial Grid**: Strict 8px (0.5rem) increments
- **Sidebar Width**: Fixed `w-64` (16rem / 256px) on desktop (collapsible / hidden on mobile)
- **Top Header Height**: Fixed `h-16` (4rem / 64px) with `backdrop-blur-xl`
- **Page Margin**: `px-margin-mobile` (1rem / 16px) on mobile, `px-margin` (2rem / 32px) on desktop; max-w 1440px / 1520px
- **Card Padding**:
  - Compact Stat Cards: `p-space-md` (1rem / 16px)
  - Bento / Main Cards: `p-space-lg` (1.5rem / 24px)
- **Input Dimensions**: Height 38px–40px (touch targets $\ge$ 40px)

---

### E. Borders, Hairlines & Shadows

- **Hairline Border**: `1px solid #e2e8f0` (or `ring-1 ring-surface-container`)
- **Card Shadow**: `shadow-sm` (`0 1px 2px 0 rgba(0, 0, 0, 0.05)`)
- **Card Hover Shadow**: `shadow-md` (`0 4px 6px -1px rgba(0, 0, 0, 0.1)`)
- **Dropdown / Flyout**: `shadow-[0_4px_12px_rgba(15,23,42,0.05)]`
- **Modal Dialog**: `shadow-2xl` (`0 25px 50px -12px rgba(0, 0, 0, 0.25)`)
- **Focus Rings**: `focus:ring-2 focus:ring-offset-2 focus:ring-[#ff6700]` (or offset double-ring: `0 0 0 2px #ffffff, 0 0 0 4px #ff6700`)

---

## 3. WCAG 2.1 AA Contrast Ratio Audit

All text/background combinations evaluated against the 4.5:1 minimum threshold for regular text (3:1 for large/bold text):

### Verified Compliant Pairs (PASS $\ge$ 4.5:1)
1. **Body Text**: `#0f172a` on `#ffffff` $\rightarrow$ **17.85:1** (PASS)
2. **Body Text on Canvas**: `#131b2e` on `#faf8ff` $\rightarrow$ **16.29:1** (PASS)
3. **Body Text on Low Surface**: `#131b2e` on `#f2f3ff` $\rightarrow$ **15.56:1** (PASS)
4. **Secondary Text**: `#5a4136` on `#ffffff` $\rightarrow$ **9.36:1** (PASS)
5. **Secondary Text on Canvas**: `#5a4136` on `#faf8ff` $\rightarrow$ **8.88:1** (PASS)
6. **Muted Gray Text**: `#59605f` on `#ffffff` $\rightarrow$ **6.44:1** (PASS)
7. **Slate Text**: `#475569` on `#ffffff` $\rightarrow$ **7.58:1** (PASS)
8. **Slate Text on Canvas**: `#475569` on `#f8fafc` $\rightarrow$ **7.24:1** (PASS)
9. **Primary Dark Button**: `#ffffff` on `#070d0d` $\rightarrow$ **19.58:1** (PASS)
10. **Secondary Button**: `#0f172a` on `#ffffff` $\rightarrow$ **17.85:1** (PASS)
11. **Technical Blue Links**: `#0061a2` on `#ffffff` $\rightarrow$ **6.50:1** (PASS)
12. **Operational Badge Text**: `#065f46` on `#ecfdf5` $\rightarrow$ **7.29:1** (PASS)
13. **Degraded Badge Text**: `#92400e` on `#fffbeb` $\rightarrow$ **6.84:1** (PASS)
14. **Down Badge Text**: `#991b1b` on `#fef2f2` $\rightarrow$ **7.60:1** (PASS)
15. **Unknown Badge Text**: `#334155` on `#f1f5f9` $\rightarrow$ **9.45:1** (PASS)
16. **Error Banner Text**: `#93000a` on `#ffdad6` $\rightarrow$ **7.24:1** (PASS)
17. **Table Header Text**: `#5a4136` on `#ffffff` $\rightarrow$ **9.36:1** (PASS)
18. **Table Header Text**: `#131b2e` on `#e2e7ff` $\rightarrow$ **13.98:1** (PASS)

### Pairs Below 4.5:1 & Designated Corrections
| Evaluated Pair | Context in Exported HTML | Raw Contrast Ratio | Issue | Corrected Color & Ratio |
|---|---|---|---|---|
| `#ff6700` on `#ffffff` | Primary container orange text on white | **2.92:1** (FAIL) | Insufficient contrast for text | Use **`#a23f00`** (`primary` token) $\rightarrow$ **6.47:1** (PASS) or **`#c2410c`** (orange-700) $\rightarrow$ **5.18:1** (PASS) |
| `#019cff` on `#ffffff` | Tertiary container light blue text on white | **2.92:1** (FAIL) | Insufficient contrast for text | Use **`#0061a2`** (`tertiary` token) $\rightarrow$ **6.50:1** (PASS) |
| `#ffffff` on `#ff6700` | White text on Blaze Orange button | **2.92:1** (FAIL) | White on bright orange fails AA | Use dark ink **`#070d0d`** on `#ff6700` $\rightarrow$ **6.71:1** (PASS), or use **`#a23f00`** with white text $\rightarrow$ **6.47:1** (PASS) |
| `#ffffff` on `#ef4444` | White text on standard red badge fill | **3.76:1** (FAIL) | Red-500 fill is too light for white text | Use **`#ba1a1a`** (`error` token) $\rightarrow$ **6.46:1** (PASS) or **`#b91c1c`** (red-700) $\rightarrow$ **6.47:1** (PASS) |
| `#94a3b8` on `#ffffff` | Slate-400 placeholder text on white input | **2.56:1** (FAIL) | Fails accessibility for placeholder | Use **`#64748b`** (Slate-500) $\rightarrow$ **4.76:1** (PASS) |

