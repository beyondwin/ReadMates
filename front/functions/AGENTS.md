# ReadMates BFF And OAuth Functions

This guide adds to `../../AGENTS.md` and `../AGENTS.md`. Before editing, read `../../docs/agents/execution.md`, `../../docs/agents/front.md`, and `../../docs/agents/server.md`.

Treat this directory as a browser-facing security boundary. Preserve same-origin BFF routing, strip internal `x-readmates-*` headers and secrets, derive club context from trusted input, and keep return paths safe.

Use `../../docs/development/acceptance-matrix.md` for auth, club-context, header, cookie, redirect, error, and E2E states. Never expose secrets through `VITE_*` configuration.
