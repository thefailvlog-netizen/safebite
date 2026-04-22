# SafeBite — Product Requirements

> Living document. Updated as features are scoped and built.
> Owner: Mike Pacione (Product)

---

## Background

SafeBite is a B2B SaaS web platform that surfaces public restaurant inspection data to food operators. The core problem: inspection data is public but scattered — operators have no clean way to monitor their own records, benchmark against competitors, or prepare for upcoming inspections.

**Target customer:** Restaurant operators, multi-location groups, franchises, compliance managers.

**Revenue model:** Eventually a B2B subscription. MVP is focused on validation — no paywall yet.

**Data source (MVP):** Toronto DineSafe Open Data API (free, no key). Outcomes: Pass / Conditional Pass / Closed. Includes infraction details and severity.

**Geographic roadmap:** Toronto → Quebec → Alberta → rest of Canada.

---

## Access Model

| Area | Auth Required? | Notes |
|---|---|---|
| Landing page | No | Public marketing page |
| Search | No | Public — good for SEO, drives discovery |
| Restaurant detail | No | Public — any infraction history is viewable |
| Operator dashboard | Yes + Approved | Must be logged in AND approved by admin |
| Admin panel | Yes + Admin | Mike only |

**Signup flow:** Open signup — anyone can request access. Admin (Mike) must approve each account before the user can access the dashboard. Pending users see a "waiting for approval" screen after signup.

---

## Sprint 1 — MVP UI & Auth (Current)

### REQ-001 · Landing Page
**Status:** Planned
**Priority:** P0

The public-facing marketing page. First thing visitors see.

**Content:**
- Hero: headline + subheadline + primary CTA
- Headline: *"Stay ahead of your next inspection."*
- Subheadline: *"Track violations, benchmark your locations, and never be caught off guard. SafeBite pulls live inspection data so you don't have to."*
- Primary CTA: "Search a restaurant" (→ /search) + "Get early access" (→ /signup)
- Features section: 3 value props (Track your record / Benchmark locations / Get notified)
- Footer: minimal

**Acceptance criteria:**
- Renders correctly on mobile and desktop
- Both CTAs link to correct pages
- No login required to view

---

### REQ-002 · Restaurant Search Page
**Status:** Planned
**Priority:** P0

Public search page. Anyone can search for a Toronto restaurant and see its latest inspection outcome.

**Behaviour:**
- Search input: type restaurant name (min 2 chars), results appear as you type (debounced)
- Results show: establishment name, address, latest inspection date, outcome badge (Pass = green, Conditional Pass = yellow, Closed = red)
- Clicking a result navigates to the restaurant detail page
- Empty state when no results found
- No login required

**Data:** Queries `establishments` + most recent `inspections` row per establishment.

**Acceptance criteria:**
- Search is functional with real DineSafe data
- Outcome badge colour matches Pass/Conditional Pass/Closed
- Works on mobile

---

### REQ-003 · Restaurant Detail Page
**Status:** Planned
**Priority:** P0

Full inspection profile for a single establishment. Accessible via `/restaurant/[id]`.

**Content:**
- Header: name, address, category (e.g. "Restaurant"), current status
- Latest outcome badge (prominent)
- Inspection history: list of all past inspections, sorted newest first
  - Each row: date, inspection type, outcome badge
  - Expandable to show infractions for that inspection
- Infraction detail: description, severity (Minor / Significant / Crucial), action taken
- "Are you the owner?" CTA → /signup

**Acceptance criteria:**
- All inspection history loads correctly from DB
- Infractions expand/collapse per inspection
- Severity is colour-coded (Minor = yellow, Significant = orange, Crucial = red)
- Page is shareable (clean URL)

---

### REQ-004 · Authentication — Login & Signup
**Status:** Planned
**Priority:** P0

**Login page (`/login`):**
- Email + password form
- "Forgot password" link (Supabase magic link / reset flow)
- Link to signup page
- Redirects to `/dashboard` on success (or `/pending` if not yet approved)

**Signup page (`/signup`):**
- Name, email, password fields
- On submit: creates Supabase auth user + `operators` row with `is_approved = false`
- User lands on `/pending` — a simple screen: "Your account is pending approval. We'll email you when you're approved."
- Admin receives notification (email) that a new signup is waiting

**Acceptance criteria:**
- Signup creates a user in Supabase Auth + operators table
- Unapproved users cannot access `/dashboard` (redirected to `/pending`)
- Login works with email/password

---

### REQ-005 · Operator Dashboard (Placeholder)
**Status:** Planned
**Priority:** P1

Gated behind login + approval. For Sprint 1 this is a placeholder — the shell of the dashboard with a welcome message and "coming soon" content blocks for claims, alerts, and benchmarking.

**Acceptance criteria:**
- Unauthenticated users are redirected to `/login`
- Approved users see the dashboard
- Unapproved users are redirected to `/pending`

---

### REQ-006 · Admin Panel — User Management
**Status:** Planned
**Priority:** P0

Accessible only to Mike (`is_admin = true`). Located at `/admin`.

**Features:**
- User list: all signups with name, email, signup date, approval status
- Approve button: sets `is_approved = true`, sends welcome email to user
- Deny/remove button: deletes or disables account
- Badge counts: pending / approved / total

**Admin user:** Mike Pacione (`thefailvlog@gmail.com`) — `is_admin = true`, `is_approved = true`, set via DB migration.

**Acceptance criteria:**
- Non-admins who try to access `/admin` are redirected to `/dashboard`
- Approving a user immediately grants them dashboard access
- Admin can see all pending signups

---

## Backlog (Future Sprints)

### REQ-007 · Operator Dashboard — Claim a Restaurant
Operator searches for their restaurant, submits a claim, admin verifies. Once claimed, the restaurant appears in the operator's dashboard.

### REQ-008 · Notifications — New Inspection Alert
When a new inspection is synced for a claimed restaurant, the operator receives an email.

### REQ-009 · Benchmarking
Compare an establishment's pass/fail rate against similar restaurants (same category, same neighbourhood).

### REQ-010 · Pre-Inspection Readiness
Surface the most common infractions for an establishment's category. Help operators know what to watch for.

### REQ-011 · Multi-Location Support
Operators can claim more than one establishment. Dashboard aggregates across all locations.

### REQ-012 · Export
Download inspection history as PDF or CSV.

### REQ-013 · Geographic Expansion — Quebec
Ingest MAPAQ bulk CSV (provincial). Second data source after Toronto DineSafe.

### REQ-014 · Geographic Expansion — Alberta
Ingest AHS provincial portal + Calgary Socrata data.

---

## Security Backlog

Low-priority items flagged during Sprint 1 security audit. Not urgent for MVP but must be addressed before any paid/public launch.

### SEC-001 · Forgot Password Flow
**Priority:** P1 (before public launch)

The login page has a dead "Forgot password?" label with no implementation. Users who lose access have no self-serve recovery — Mike has to manually reset via Supabase Dashboard. Wire up Supabase's built-in password reset flow (`supabase.auth.resetPasswordForEmail()`).

**Acceptance criteria:**
- "Forgot password?" link on login page sends a reset email
- User clicks link in email, lands on a reset page, sets a new password
- Works end-to-end without admin involvement

---

### SEC-002 · Rate Limiting on Public Search API
**Priority:** P2 (before public launch)

`/api/search` is unauthenticated and hits the database on every request. No throttle exists. At scale, automated scraping or a traffic spike could exhaust Supabase connection pool limits on the free tier.

**Options:**
- Add `Cache-Control: public, s-maxage=60` response headers as a first step
- Vercel Edge rate limiting by IP for harder protection
- Revisit once real traffic exists — premature optimization otherwise

---

### SEC-003 · Service Role Key Rotation
**Priority:** P3 (maintenance, not urgent)

The Supabase service role key is a JWT that expires in 2092 (~66 years). It grants full database access with no RLS. Should be rotated periodically or any time access changes (new collaborator, suspected exposure, etc.).

**When to action:**
- Before bringing on any contractors or external collaborators
- If the key is ever accidentally committed to git or shared
- Annually as good hygiene

---

## Open Questions

| # | Question | Status |
|---|---|---|
| 1 | Operator verification method for claims: honor system vs. document upload? | Open |
| 2 | Pricing tiers: what's included in free vs. paid? | Open — post-validation |
| 3 | Welcome email content for approved users | Open |

---

*Last updated: 2026-04-22*
