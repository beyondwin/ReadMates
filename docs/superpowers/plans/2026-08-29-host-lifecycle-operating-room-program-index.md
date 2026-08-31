# ReadMates Host Lifecycle Operating Room Implementation Program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 07–17 시안과 최신 설계만 기준으로, 호스트가 현재 모임의 준비·현장·마감을 운영하고 모임 밖 업무까지 놓치지 않는 새 호스트 워크스페이스를 server/BFF/front/docs 전체에 구현한다.

**Architecture:** 일정 확인은 먼저 server source of truth로 만든 뒤 generic Pages Functions BFF를 통해 member와 host read model에 노출한다. 이후 공용 club shell의 host composition을 4개 업무 영역으로 전환하고, route-first frontend 경계(`api → queries → route → ui`, 계산은 pure `model`) 안에서 운영실과 작업함을 조합한다. 기존 session/notification/membership/record 기능은 그대로 재사용하며, 새로운 cross-domain 작업함 상태만 별도 `hostworkspace` feature가 소유한다.

**Tech Stack:** Kotlin 2/Spring Boot/JdbcTemplate/MySQL/Flyway, Cloudflare Pages Functions BFF, React 19/Vite/React Router/TanStack Query/Zod/Vitest/Playwright CT·E2E, Pretendard Variable.

**Spec:** `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`, ADR-0048, ADR-0049, 승인 자산 `docs/development/host-redesign-mockups/07`–`17`.

ADR impact: update — ADR-0048, ADR-0049

## Global Constraints

- 이 프로그램만 최신 구현 권위다. `2026-08-27-host-*` 및 ADR-0046 기반 계획은 역사 기록이며 실행하지 않는다.
- 시각 자산은 참고 이미지다. PNG를 배경으로 깔거나 crop해 UI로 사용하지 않는다.
- 글꼴은 bundled Pretendard Variable만 사용한다. serif/handwriting/외부 font를 추가하지 않는다.
- 사람·계정 identity는 `front/shared/ui/book-club-avatar.ts`와 `AvatarChip`의 실제 WebP artwork만 사용한다. 이니셜 avatar나 새 동물 이미지를 만들지 않는다.
- 최신 일정 확인, 최근 클럽 접속, 참석 응답, 실제 출석, 알림 전달은 독립 사실이다. 서로 추정하거나 대리하지 않는다.
- future DRAFT는 운영실에서 선택할 수 있지만 member-visible participant snapshot이 없으면 schedule-seen은 unavailable이다. 프런트가 DRAFT를 UNSEEN으로 추정하지 않는다.
- URL의 club slug가 권위다. query key와 mutation invalidation은 club scope를 포함한다.
- mutation은 기존 revision guard/idempotency/receipt/reconciliation 규칙을 약화하지 않는다.
- 새 PUT/DELETE는 `SecurityConfig.kt`의 exact CSRF ignore와 trusted-BFF security test를 함께 갱신한다.
- 새 `com.readmates.hostworkspace` inbound/application 경계는 `ServerArchitectureBoundaryTest.kt`, `ServerArchitectureInventory.kt`, `ServerArchitectureInventoryTest.kt`에 등록한다.
- 서버 focused command는 disabled `test`가 아니라 `unitTest`, `integrationTest`, `architectureTest` 중 실제 test suite owner를 사용한다.
- 이 checkout에는 `corepack` binary가 없으므로 frontend launcher는 `npx --yes corepack@0.35.0 pnpm`으로 고정한다. 각 Stage Task 0에서 다시 확인하고, 환경이 달라져 native Corepack을 썼다면 ledger에 실제 명령을 기록한다.
- Zod 변경은 `npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures` 뒤 `front/tests/unit/__fixtures__/zod-schemas/` clean diff와 `com/readmates/contract` integration tests로 검증한다.
- filled primary CTA는 viewport composition당 하나다. 모바일 터치 영역은 최소 44px이며 safe-area를 포함한다.
- 실제 멤버 데이터, 이메일, 토큰, 도메인, 로컬 절대 경로를 fixture·docs·screenshot에 넣지 않는다.
- 구현 단계마다 TDD RED → GREEN → focused regression → commit 순서를 지킨다.

## Fixed Delivery Order

1. [Stage 1 — schedule revision and seen-state vertical slice](./2026-08-29-host-schedule-seen-stage1.md)
2. [Stage 2 — four-area host shell and route ownership](./2026-08-29-host-shell-navigation-stage2.md)
3. [Stage 3 — lifecycle operating room composition](./2026-08-29-host-operating-room-stage3.md)
4. [Stage 4 — workbox and auxiliary ledgers](./2026-08-29-host-workbox-ledgers-stage4.md)
5. [Stage 5 — responsive, recovery, evidence, and ADR closeout](./2026-08-29-host-responsive-closeout-stage5.md)

Stage 1은 Stage 3의 일정 확인 숫자보다 먼저 완료한다. Stage 2는 새 destination을 먼저 추가하되 기존 경로를 즉시 삭제하지 않는다. Stage 5에서 전체 proof가 확보된 뒤에만 redirect와 ADR 상태를 최종 전환한다.

## Requirement Coverage

| 승인 요구 | 소유 단계 | 완료 증거 |
| --- | --- | --- |
| 최신 일정 확인 CURRENT/STALE/UNSEEN | 1 | migration, concurrency/API/BFF/front tests, member E2E |
| coarse 최근 접속과 확인·응답·출석 분리 | 1, 4 | throttled club access fact, forbidden inference tests, 사람 상세 semantics |
| seen/access retention과 erase lifecycle | 1 | INACTIVE/delete/hard-delete/anonymize migration·integration tests |
| 운영실·일정과 모임·사람·기록 4영역 | 2 | desktop/mobile nav tests, route inventory |
| club + member/host combined switcher | 2 | same-club role switch, cross-club fallback, authority-loss route tests |
| 초대와 설정·멤버 시야·알림·계정·새 모임 | 2, 4 | semantic destination inventory test |
| 현재 모임 header·3단계·다음 행동·준비 원장 | 3 | pure-model matrices, route/UI tests, CT |
| 작업함 지금·보류·완료·receipt | 4 | MySQL/API/query/UI tests, state transition E2E |
| editable schedule 안내 preview/confirm | 4 | copy/target/schedule snapshot conflict, duplicate/resend/unknown reconciliation tests |
| 전용 사람 상세 API와 attendance cursor | 4 | cross-club/privacy/no-gap/no-duplicate server+BFF+front tests |
| named invitation links와 club settings | 4 | persistence/API/BFF/front, revision/history, local-safe close preview/confirm |
| 07–14 desktop, 15–17 mobile 톤 | 2–5 | tracked CT at 390/768/1024/1440 |
| 기존 동물 artwork avatar·Pretendard | 2–5 | component/font tests and screenshot review |
| 403/409/partial/unknown recovery | 1, 3–5 | focused route and E2E scenarios |

## Feature Completeness Inventory

구현자는 아래 accessible name 또는 동등한 명시적 목적지를 semantic inventory test로 전부 검증한다. 항목을 숨기거나 다른 기능으로 추정해 통과시키지 않는다.

- 전역: `운영실`, `일정과 모임`, `사람`, `기록`, `초대와 설정`, `멤버 시야`, `알림`, `계정`, `새 모임`.
- 현재 모임: `모임 정보`, `일정 편집`, `변경 이력`.
- 단계: `준비실`, `현장`, `마감실`.
- 다음 행동: `대상과 문구 검토`, `보류`, 행동 근거.
- 준비 현황: `현재 일정 확인`, `참석 응답`, `발제 질문`, `장소 준비`, 각 상세 보기.
- 작업함: `지금`, `보류`, `완료`, `일정 미열람 확인`, `가입 승인 검토`, `지난 모임 기록 마감`, `초대 링크 만료 확인`, 처리 receipt.

## Cross-Stage Gate

각 단계 말에 해당 plan의 focused 명령을 먼저 실행한다. frontend를 건드린 단계는 최소 다음을 실행한다.

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
```

server 또는 migration을 건드린 단계는 다음을 추가한다.

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

라우팅·BFF·권한·실제 완료 흐름을 건드린 단계는 영향 spec을 먼저 돌린 뒤 마지막에 전체 E2E를 실행한다.

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:ct
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
```

명령을 실행하지 못하면 통과로 기록하지 않는다. 최종 closeout은 `not measured` 항목과 이유를 남기고 ADR을 Proposed로 유지한다.

## Program Completion Checklist

- [ ] Stage 1–5의 모든 checkbox와 단계 gate가 완료됐다.
- [ ] `rg -n "[T]ODO|[T]BD|[P]LACEHOLDER|추후[[:space:]]*결정|V[N]N" docs/superpowers/plans/2026-08-29-host-{schedule-seen-stage1,shell-navigation-stage2,operating-room-stage3,workbox-ledgers-stage4,responsive-closeout-stage5}.md`가 0건이다.
- [ ] 전역 기능 완전성 semantic test가 승인 목록 100%를 찾는다.
- [ ] member 확인 write와 host 조회가 다른 club/session을 섞지 않는다.
- [ ] 작업함 source item 해결·보류 만료·부분 실패가 상태를 잃지 않는다.
- [ ] 작업함 cursor가 club/host/filter/snapshot/evaluatedAt/sort/expiry/key-version에 결속되고 tamper·rotation·concurrent mutation에서 gap/duplicate 없이 fail closed한다.
- [ ] 일정 안내 preview 이후 schedule revision 또는 target eligibility가 바뀌면 outbox 없이 conflict이고 새 preview를 요구한다.
- [ ] 사람 상세가 목록 scan이 아닌 전용 allowlist API와 server attendance cursor를 사용한다.
- [ ] named invitation link와 club settings/host management/audit/close preview-confirm가 실제 vertical slice로 구현됐다.
- [ ] authority loss가 host query/draft/workbox cache를 폐기한다.
- [ ] tracked CT와 E2E가 390/768/1024/1440 및 긴 문자열을 포함한다.
- [ ] `front/DESIGN.md`, `docs/development/architecture.md`, CHANGELOG가 실제 코드와 일치한다.
- [ ] ADR-0048/0049 승격 조건을 모두 충족한 경우에만 `Accepted`로 변경한다.

## Final Commit Sequence

```bash
git add server front
git commit -m "feat(host): implement lifecycle operating room"
git add front/tests server/src/test
git commit -m "test(host): prove operating room workflows"
git add docs CHANGELOG.md
git commit -m "docs(host): accept lifecycle operating room decisions"
```

실제 구현에서는 task별 작은 커밋을 우선하며, 위 세 줄은 최종 squash가 필요한 경우에만 사용한다. push, merge, deploy는 이 프로그램의 자동 권한이 아니다.
