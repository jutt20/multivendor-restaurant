# Multi-Vendor QR Ordering Platform - Design Guidelines

## Design Approach

**Hybrid Strategy**: Reference-based for landing page (Shopify/Stripe merchant SaaS aesthetic) + Design system approach for application panels (Linear/Notion-inspired with Material Design information density)

**Rationale**: The landing page must attract and convert restaurant owners (experience-focused), while the panels prioritize efficiency and data management (utility-focused).

---

## Color Palette

### Landing Page
- **Primary Brand**: 249 115% 22% (vibrant orange - food/hospitality energy)
- **Secondary**: 217 91% 60% (trust blue)
- **Dark Mode Primary**: 24 100% 95% (warm off-white)
- **Dark Mode Background**: 240 10% 4% (deep charcoal)

### Application Panels
- **Vendor Panel Primary**: 142 76% 36% (success green - revenue/growth)
- **Captain Panel Primary**: 217 91% 60% (operational blue)
- **Admin Panel Primary**: 262 83% 58% (authority purple)
- **Accent (Sparingly)**: 38 92% 50% (alert/action orange)
- **Neutrals**: 
  - Light mode: 240 5% 96% (background), 240 6% 10% (text)
  - Dark mode: 240 10% 4% (background), 0 0% 98% (text)

### Semantic Colors (Both Modes)
- Success: 142 76% 36% / 142 71% 45%
- Warning: 38 92% 50% / 48 96% 53%
- Error: 0 84% 60% / 0 91% 71%
- Info: 217 91% 60% / 199 89% 48%

---

## Typography

**Font Stack**: 
- Headings: Inter (600-700 weight) via Google Fonts
- Body: Inter (400-500 weight)
- Monospace: JetBrains Mono (for table IDs, QR codes, API keys)

**Scale**:
- Hero (Landing): text-5xl md:text-6xl lg:text-7xl
- Page Headers: text-3xl md:text-4xl
- Section Headers: text-2xl md:text-3xl
- Card Titles: text-lg font-semibold
- Body: text-base
- Caption/Meta: text-sm text-muted-foreground

---

## Layout System

**Spacing Units**: Tailwind primitives - 2, 3, 4, 6, 8, 12, 16, 20, 24 for consistent rhythm

**Container Strategy**:
- Landing page: max-w-7xl for sections, max-w-prose for text content
- Application panels: Full-width layouts with sidebar navigation (w-64)
- Dashboard cards: p-6, gap-6 grid layouts
- Forms: max-w-2xl centered

**Grid Patterns**:
- Landing features: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Dashboard stats: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
- Table management: Responsive data tables with horizontal scroll on mobile
- Order cards: grid-cols-1 lg:grid-cols-2 xl:grid-cols-3

---

## Component Library

### Navigation
**Landing**: Transparent header with backdrop-blur, sticky positioning, logo left, CTA buttons right
**Panels**: Collapsible sidebar (w-64) with role-specific color accent, icon+label nav items, active state with background highlight

### Buttons
- Primary: Solid with role-specific color, rounded-lg, px-6 py-3
- Secondary: Outline variant with subtle hover
- Icon buttons: p-2 rounded-md for actions
- On images: variant="outline" with backdrop-blur-md bg-white/10

### Cards
- Shadow: shadow-sm with hover:shadow-md transition
- Border: border border-border rounded-lg
- Padding: p-6 standard, p-4 for compact variants
- Headers: flex justify-between items-center mb-4

### Forms
- Input fields: rounded-md border-border px-3 py-2, focus ring with role color
- Labels: text-sm font-medium mb-2
- File uploads: Dropzone with drag-drop, preview thumbnails
- Multi-step: Progress indicator with circles and connecting lines

### Tables
- Striped rows for readability (even:bg-muted/50)
- Sticky headers on scroll
- Row actions: Dropdown menu (⋮) aligned right
- Status badges: Inline colored pills with dot indicator
- Sortable columns: Arrow icons in headers

### Data Display
- Stat cards: Large number (text-3xl font-bold), label below, trend indicator (↑/↓)
- Order timeline: Vertical stepper with status checkpoints
- QR code display: Bordered card with download/print actions, table ID label

### Modals & Overlays
- Backdrop: bg-black/50 backdrop-blur-sm
- Content: max-w-lg md:max-w-2xl, rounded-xl, shadow-2xl
- Headers: pb-4 border-b, close button (×) top-right

---

## Page-Specific Designs

### Landing Page
**Structure** (6-7 sections):
1. **Hero** (h-screen): Split layout - left: headline + vendor benefits + dual CTAs (Register/Login), right: large hero image (restaurant dashboard mockup or happy restaurant owner)
2. **How It Works**: 3-step visual process with icons
3. **Features Grid**: 2x3 cards with icons, titles, descriptions (QR ordering, table management, captain assignment, menu control, real-time orders, analytics)
4. **Vendor Benefits**: 2-column alternating image+text sections showcasing revenue growth, efficiency gains
5. **Trust Signals**: Logos of partner restaurants (if available) or stat highlights (X vendors, Y orders processed)
6. **Pricing/CTA**: Simple plan card or "Get Started Free" with form preview
7. **Footer**: Multi-column (company, product, support, legal), newsletter signup, social links

**Images Needed**:
- Hero: Restaurant owner reviewing tablet with orders (large, impactful)
- Features: Dashboard screenshots, QR code in use, captain using mobile interface
- Benefits: Real restaurant environments, busy dining scenes

### Vendor Panel
**Dashboard**: 4-stat cards row, recent orders table, revenue chart (area graph), quick actions sidebar
**Table Management**: Grid view of tables with QR thumbnails, create table button (prominent), assign captain dropdown per table
**Captain Management**: Table with captain details, assigned tables count, create/edit modals
**Menu Management**: Category sidebar + item cards grid, drag-to-reorder, toggle switches for availability
**Orders**: Filterable table/list with status workflow, order detail slideout panel

### Captain Panel
**Dashboard**: Assigned tables as large cards showing current order summary, status color-coding
**Table Detail**: Full order breakdown, mark items served checkboxes, request assistance button

### Admin Panel
**Vendors**: Approval queue (pending applications with document preview), active vendors table with status toggles
**Platform Stats**: System-wide metrics, order volume charts, commission reports
**Settings**: API key management, content CMS for landing page

---

## Interactions & Micro-animations

**Minimize animations**, use sparingly:
- Button hover: Subtle scale (1.02) or shadow increase
- Card hover: Shadow elevation
- Loading states: Skeleton screens (not spinners) for data-heavy views
- Status updates: Brief success toast notifications (bottom-right)
- Navigation: Instant transitions, no page-level animations

---

## Role Differentiation

**Visual Cues**:
- Sidebar accent color matches role (green/blue/purple)
- Logo badge with role label in header
- Dashboard header background uses subtle role color tint
- Different favicons for each panel

---

## Accessibility & Dark Mode

- Full dark mode support with consistent implementation across ALL inputs, forms, tables
- Color contrast minimum 4.5:1 for text
- Focus indicators: 2px ring with role color
- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons
- Screen reader announcements for status changes

---

## Mobile Responsiveness

**Critical for Captain Panel** (floor usage):
- Touch-friendly tap targets (min 44px)
- Bottom navigation bar for primary actions
- Swipeable table cards
- Large, readable order details
- Quick status update buttons

**Landing & Other Panels**:
- Hamburger menu at md breakpoint
- Stacked layouts for mobile
- Horizontal scrolling tables with sticky first column

---

This design creates a professional, trustworthy platform for vendors while maintaining operational efficiency for captains and admins through role-specific, utility-focused interfaces.