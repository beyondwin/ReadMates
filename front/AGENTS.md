# ReadMates Frontend

This package is a Vite React SPA with Cloudflare Pages Functions for BFF and OAuth proxy routes.

## Implementation Architecture

Frontend code should follow the route-first boundary described in `../docs/development/architecture.md`.

- Route modules own loader/action behavior, API calls, model composition, route error/loading state, and UI prop assembly.
- Feature code should be split by responsibility into `api`, `model`, `route`, and `ui` when a feature is touched.
- `api` modules own feature-specific BFF request/response contracts.
- `model` modules are pure calculation and mapping code. They must not import React, React Router, or API clients.
- `ui` modules render from props and callbacks. They must not call `fetch`, import `shared/api`, import feature API modules, or import route modules.
- New code must not depend on the removed `shared/api/readmates` compatibility module. Use feature-owned API modules or `shared/api` primitives.
- Keep `src/app -> src/pages -> features -> shared` as the intended dependency direction.

Known legacy exceptions are documented in `../docs/development/architecture.md`. Do not add new exceptions for route modules, feature boundaries, or shared UI imports without updating the architecture document and boundary tests.

## Design Context

### Users
ReadMates serves a small, invitation-based reading club with three primary audiences:

- Real offline/online reading-club hosts who need to run sessions, invite members, confirm attendance, publish public records, and manage feedback documents without operational friction.
- Small-group members who prepare for sessions, RSVP, track reading progress, write questions, leave reviews, and revisit the club archive across desktop and mobile web.
- External visitors who read the public introduction and published session records before deciding whether the club feels trustworthy and worth following.

The product is used before, during, and after reading sessions. Members need a quiet, direct preparation flow; hosts need a precise operating surface; visitors need a literary public record that communicates the club's standards without over-explaining.

### Brand Personality
Priority words:

1. Thoughtful
2. Archival
3. Calm

Emotional priorities:

1. Private-library atmosphere
2. Intellectual tension
3. Warmth
4. Calm
5. Trust
6. Operational efficiency

The interface should feel like a private reading room with a serious notebook on the desk: warm, precise, restrained, and quietly intelligent. It should not feel cute, generic, overly casual, or like a template SaaS product.

### Aesthetic Direction
Push the existing `Modern editorial · warm neutral · ink blue` system in a more literary and more premium direction.

Use warm paper-like surfaces, ink-toned hierarchy, editorial spacing, and book/archive metaphors with restraint. Let typography, alignment, rhythm, and content density create the sense of craft. Public pages should feel like a refined literary journal; member pages should feel like a personal reading desk; host pages should feel like an efficient operating ledger rather than a common analytics dashboard.

Desktop web and mobile web are both first-class experiences. Desktop should use space, structure, and reading rhythm well. Mobile should be adapted for quick, thumb-friendly workflows and should never feel like a shrunken desktop page.

Explicit anti-references:

- AI-looking design patterns
- Generic SaaS dashboards
- Notion-style pages
- Decorative gradients, glowing dark-mode accents, glassmorphism, and excessive cards
- Overly brown cafe/bookstore nostalgia
- Visual choices that make the product feel like a generic productivity app instead of a reading club with records and rituals

### Design Principles
1. Private Library, Not SaaS Dashboard
   Operational surfaces can be efficient and data-rich, but they should still feel like ReadMates. Prefer ledgers, reading desks, session documents, and quiet editorial hierarchy over generic KPI tiles and dashboard tropes.

2. Records Have Gravity
   Session summaries, questions, reviews, feedback documents, and book metadata are the product's core material. Give records enough hierarchy, whitespace, and typographic care that they feel worth preserving.

3. Tension Through Restraint
   Create intellectual tension with precise spacing, strong type hierarchy, asymmetry, sharp content grouping, and deliberate contrast. Avoid loud decoration, gradient text, glowing accents, stock illustrations, and ornamental UI that does not carry meaning.

4. Warm Trust, Clear Action
   The interface should feel warm and calm, but never vague. Every role state, permission limit, RSVP state, save state, and host operation needs a clear next action and a visible result.

5. Mobile Is a Native Reading Companion
   Mobile web must be intuitive, readable, and operationally complete. Adapt layouts for the mobile context instead of merely shrinking desktop screens. Keep primary actions reachable, labels concrete, and session status immediately understandable.

6. Accessible by Default
   Target WCAG AA contrast, visible keyboard focus, semantic structure, reduced-motion support, and resilient text wrapping in Korean and English. Do not rely on color alone for state. Preserve readability before visual novelty.

7. Premium Means Specific
   Premium here means careful, literary, and precise. Use the existing warm neutral and ink-blue foundation, but improve specificity through better composition, copy, rhythm, and component behavior rather than adding generic luxury styling.
