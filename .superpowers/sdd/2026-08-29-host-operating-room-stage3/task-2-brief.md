# Stage 3 Task 2 brief — server-owned current-meeting selector

- BASE: `885ad503c12f2c89d0cb4d90db54bd409d426cb8`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 2 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: implement the server-selection and composition-boundary portion of Proposed ADR-0048/0049; no new ADR.

## Required outcome

- Implement exactly the Task 2 file/contract surface, including the generic Cloudflare GET-proxy proof but no frontend query/loader/UI integration.
- Expose `GET /api/host/operating-room/current` as `{currentMeeting:{sessionId,selection,scheduleSeenAvailability}|null}` for an active URL-authoritative HOST only.
- Selection order is fixed: the single OPEN session; otherwise earliest future DRAFT by date/start/number; otherwise newest CLOSED candidate whose canonical closing-status use case still needs action; otherwise null. Exclude deleted and PUBLISHED sessions and isolate clubs.
- The session query owns ordered raw candidates and deterministic ties but never decides closing readiness. `hostworkspace` evaluates CLOSED candidates newest-first through its own outbound ports, short-circuits OPEN/DRAFT, skips resolved/published candidates, and fails closed with an explicit availability error when closing lookup is partial.
- Register `hostworkspace` in all three architecture inventory/boundary files before its inbound controller. `hostworkspace.application` and `.domain` import no other ReadMates feature, including `shared`; outbound source adapters may use foreign application input ports but never foreign adapters. Do not copy the canonical closing predicate into session or hostworkspace.
- Server owns schedule-seen availability. A future DRAFT is AVAILABLE only when member-visible and backed by the legal active-participant snapshot; the frontend must not infer it.
- Preserve the architecture baseline files byte-for-byte at SHA-256 `a8d5c9bfb32f1fe1afe372d7fd4ae7c7fa495270936276f5ef27e093765e950c` and `0a48d0ba93a0483e7e8bb8b4217883eedf0c91275d3b3f61b8f32edf233c0899`.
- Use TDD RED/GREEN for the four named server test classes and the generic GET BFF test. Run only these focused tests plus `./server/gradlew -p server architectureTest`, the exact baseline diff command, focused frontend Vitest/ESLint for `cloudflare-bff.test.ts`, diff check, and public-safety scan. Write a public-safe `task-2-report.md`, force-add ignored brief/report, and commit.

## Stop conditions

- Do not modify the architecture dependency baseline files.
- Do not implement frontend Zod/query/loader/route/UI behavior.
- Do not add migrations or duplicate closing policy.
- Do not run full server integration, full frontend, CT, E2E, or public-release gates.
