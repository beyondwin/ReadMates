# ReadMates Design

`design/system` is the code source of truth for reusable ReadMates UI.
`design/docs` is the static catalog that renders the real package.

Rules:

- Product code imports reusable UI from `@readmates/design-system`.
- Stable components must document desktop and mobile behavior before broad adoption.
- Feature-only UI can stay in `front/features/*/ui` until it repeats across surfaces.
- Public-safe samples only: no real members, domains, deployment state, secrets, or token-shaped examples.

Install workspace dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

## Gallery catalog

`design/docs` opens with an Editorial Pattern Gallery for design and planning review.
The first stable gallery scenes are:

- Public Literary Page: public-safe club introduction, invitation, and member-only boundary examples.
- Member Reading Desk: current book, member identity, session state, and next-action examples.

Gallery samples must stay public-safe. Do not include real members, emails, invite tokens, private domains, deployment state, secrets, or token-shaped examples.

Stable package exports currently include `Button`, `Badge`, `TextField`, `TextArea`, `Surface`, `Divider`, `BookCover`, `AvatarChip`, `EmptyState`, `LockedState`, and `DocumentPanel`.

Run local checks before merging gallery or component changes:

```bash
pnpm design:check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For visual review, run:

```bash
pnpm --dir design/docs exec vite --host 0.0.0.0 --port 5174 --strictPort
```

Then inspect `http://localhost:5174` in desktop and mobile viewport widths.
