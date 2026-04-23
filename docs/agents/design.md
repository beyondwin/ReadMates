# Design Agent Guide

Read this for UI, layout, copy, and visual polish.

ReadMates should feel thoughtful, archival, calm: a private reading room and precise operating ledger, not a generic SaaS dashboard.

For broader design context, keep this guide aligned with `.impeccable.md`.

Design direction:

- Use warm paper-like surfaces, ink-toned hierarchy, editorial spacing, and restrained book/archive cues.
- Public pages should feel like a refined literary journal.
- Member pages should feel like a personal reading desk.
- Host pages should feel like an efficient operating ledger.
- Desktop and mobile are both first-class; mobile must be thumb-friendly and operationally complete.

Avoid:

- AI-looking patterns, generic SaaS dashboards, Notion-style layouts.
- Decorative gradients, glow, glassmorphism, excessive cards, and stock-like visuals.
- Overly brown cafe/bookstore nostalgia.
- Copy that over-explains UI behavior inside the app.

Interaction and accessibility:

- Keep actions concrete, states visible, and permission limits understandable.
- Preserve Korean and English wrapping; never let text overlap or overflow controls.
- Target WCAG AA contrast, semantic structure, visible focus, and reduced-motion compatibility.
- Do not rely on color alone for state.

Before finishing visual work, inspect responsive behavior and run the relevant frontend checks in `docs/agents/front.md`.
