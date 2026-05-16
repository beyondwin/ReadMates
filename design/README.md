# ReadMates Design

`design/system` is the code source of truth for reusable ReadMates UI.
`design/docs` is the static catalog that renders the real package.

Rules:

- Product code imports reusable UI from `@readmates/design-system`.
- Stable components must document desktop and mobile behavior before broad adoption.
- Feature-only UI can stay in `front/features/*/ui` until it repeats across surfaces.
- Public-safe samples only: no real members, domains, deployment state, secrets, or token-shaped examples.
