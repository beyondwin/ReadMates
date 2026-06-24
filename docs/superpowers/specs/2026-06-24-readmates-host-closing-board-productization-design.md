# ReadMates Host Closing Board Productization Design

작성일: 2026-06-24
상태: APPROVED DESIGN SPEC
대상 표면: front, host session closing board, host operations UX, targeted frontend evidence

## 1. 배경

ReadMates는 최근 회차 종료 이후의 host/member/admin 흐름을 크게 정리했다.

- 호스트는 `/clubs/:slug/app/host/sessions/:sessionId/closing`에서 회차별 클로징 상태를 확인한다.
- 멤버는 알림과 멤버 홈에서 지난 모임 기록과 피드백 문서로 돌아갈 수 있다.
- 플랫폼 관리자는 `/admin/today`와 `/admin/clubs/:clubId`에서 admin-safe closing risk를 보고 host-owned closing board로 drilldown한다.
- 서버는 `host.session_closing_status.v1` read model로 session state, checklist, evidence, public/member/host 링크를 이미 제공한다.

남은 빈칸은 host closing board가 아직 충분히 제품화되지 않았다는 점이다. 현재 화면은 필요한 데이터는 갖고 있지만 `Session closing`, `Next action`, `Open`, `Review`, `Host / Member / Public` 같은 영어와 추상 문구가 남아 있고, 호스트가 지금 무엇을 먼저 해야 하는지 판단하기에는 운영 설명이 얕다.

## 2. 목표

이번 작업의 목표는 closing board를 단순 상태판이 아니라 호스트가 회차 마감 전에 다음 조치를 결정하는 운영 보드로 만드는 것이다.

성공 기준:

- 호스트가 board 첫 화면에서 우선 조치와 이유를 이해한다.
- checklist가 마감 단계별 상태를 한국어로 명확히 보여 준다.
- host/member/public 표면 상태가 역할 중심 문구로 정리된다.
- evidence ledger가 기록 패키지, 피드백 문서, 알림, 공개 기록의 마감 증거를 보여 준다.
- 서버 계약, DB migration, notification event type, auth/BFF 경계는 변경하지 않는다.
- admin-only 신호나 private member data를 host 화면에 노출하지 않는다.

## 3. Non-goals

- 새 서버 endpoint 또는 `host.session_closing_status.v2` 추가.
- DB migration.
- Platform admin이 session content를 수정하는 기능.
- 멤버 회고 기능 추가 확장.
- 새 notification event type 또는 notification delivery 정책 변경.
- public record SEO, RSS, 외부 공유 기능.
- 대규모 디자인 시스템 재구성.
- production deploy, release tag push, provider-console smoke.

## 4. 선택한 접근

선택한 접근은 **서버 계약을 유지한 frontend-first 제품화**다.

검토한 대안:

1. **Copy polish만 하기**
   - 장점: 작고 빠르다.
   - 단점: 정보 구조가 그대로라 호스트의 다음 판단을 충분히 돕지 못한다.

2. **Frontend view model과 UI를 함께 제품화** - 추천
   - 장점: 기존 read model 재료를 활용하면서 운영 판단, 상태 copy, 링크 구조를 개선할 수 있다.
   - 단점: 상태별 view model 테스트를 보강해야 한다.

3. **Server projection까지 확장**
   - 장점: 더 정교한 blocker reason과 action metadata를 서버에서 줄 수 있다.
   - 단점: 지금은 과하다. 현재 `host.session_closing_status.v1`에 필요한 재료가 충분하고, API/서버 테스트 범위가 불필요하게 커진다.

기본 구현은 2번을 따른다. 구현 조사에서 기존 응답만으로 특정 상태를 안전하게 설명할 수 없으면 새 서버 필드를 추가하지 않고 보수적인 fallback copy를 사용한다.

## 5. Frontend Architecture

기존 route-first 경계를 유지한다.

```text
host route loader
  -> hostSessionClosingStatusQuery(sessionId, clubSlug)
  -> getSessionClosingBoardView(status)
  -> SessionClosingBoard(view)
```

역할:

- `front/features/host/route/host-session-closing-data.ts`: loader auth, route param 검증, query prefetch만 담당한다.
- `front/features/host/route/host-session-closing-route.tsx`: Query data를 가져와 model과 UI를 연결한다.
- `front/features/host/model/session-closing-model.ts`: 서버 응답을 운영 보드 view model로 바꾸는 순수 계산을 담당한다.
- `front/features/host/ui/session-closing-board.tsx`: view model을 props로 받아 렌더링한다. API, QueryClient, route param을 직접 알지 않는다.
- `front/src/styles/globals.css`: 기존 host/admin visual language를 재사용하면서 closing board 전용 layout만 필요한 만큼 조정한다.

UI 컴포넌트가 API 응답 세부 shape에 직접 조건문을 늘리지 않는다. 운영 판단은 model에서 만들고 UI는 그 판단을 안정적으로 보여 준다.

## 6. View Model

`getSessionClosingBoardView()`는 기존 `SessionClosingStatusInput`에서 아래 값을 만든다.

### Primary Action Panel

`primaryAction`은 label과 href만이 아니라 다음 정보를 포함한다.

- `label`: 호스트가 실행할 구체 조치.
- `reason`: 이 조치가 지금 우선인 이유.
- `tone`: 상태 severity.
- `href`: 이동 가능한 host-owned 링크. 없으면 버튼을 숨기고 완료 설명을 보여 준다.

`overall.primaryAction`별 기본 copy:

| Primary action | Label | Reason |
| --- | --- | --- |
| `CLOSE_SESSION` | 세션 종료 확인 | 열린 세션을 먼저 닫아야 기록 패키지와 알림 상태를 판단할 수 있다. |
| `IMPORT_RECORDS` | 기록 패키지 검토 | 요약, 하이라이트, 한줄평, 피드백 문서가 아직 마감 증거로 충분하지 않다. |
| `PUBLISH_RECORDS` | 기록 공개 범위 확인 | 멤버 또는 공개 표면에 기록을 열기 전 공개 범위를 점검해야 한다. |
| `SEND_NOTIFICATION` | 멤버 알림 확인 | 멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았다. |
| `REVIEW_PUBLIC_PAGE` | 공개 기록 확인 | 공개 표면에 발행된 기록이 의도대로 보이는지 최종 확인한다. |
| `NONE` | 추가 조치 없음 | 마감에 필요한 증거가 준비되어 있다. |

알 수 없는 action이 들어오면 `확인 필요`와 보수적인 이유 문구를 사용한다.

### Checklist

Checklist는 서버의 item 순서를 유지하되 상태 label과 tone을 한국어로 고정한다.

- `DONE`: 완료
- `ACTION_REQUIRED`: 조치 필요
- `BLOCKED`: 차단
- `NOT_APPLICABLE`: 해당 없음

각 row는 label, detail, state label, tone, optional href를 가진다. 링크 label은 `Open` 대신 조치 맥락에 맞는 `확인하기`를 사용한다.

### Surface Status

기존 `HOST`, `MEMBER`, `PUBLIC` 표면은 역할 중심 문구로 보여 준다.

- `HOST`: 호스트 문서
  - edit link가 있으면 "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다."
- `MEMBER`: 멤버 회고
  - `memberReflectionHref`가 있으면 "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다."
  - 없으면 "멤버 회고 진입은 아직 확인되지 않았습니다."
- `PUBLIC`: 공개 기록
  - `publicRecordHref`가 있으면 "공개 기록 표면에서 발행 상태를 확인할 수 있습니다."
  - 없으면 "공개 표면에는 아직 발행되지 않았습니다."

표면 link는 host-safe/public-safe href만 사용한다. Admin-only route kind나 private email 같은 신호는 표시하지 않는다.

### Evidence Ledger

Evidence는 숫자 나열을 유지하되 label을 운영 증거 중심으로 바꾼다.

- 공개 요약
- 하이라이트
- 한줄평
- 피드백 문서
- 최근 멤버 알림

값은 서버 응답의 safe aggregate만 사용한다. Raw feedback document body, member email, raw notification payload, provider error는 표시하지 않는다.

## 7. UI Layout

화면은 host 운영 표면답게 조용한 ledger 구조를 유지한다.

- 첫 섹션: compact header와 overall state badge.
- 두 번째 섹션: primary action panel. 큰 설명과 주요 버튼을 한 곳에 둔다.
- 세 번째 섹션: 마감 단계 checklist. 상태 badge와 detail이 줄바꿈에 강해야 한다.
- 네 번째 섹션: 호스트 문서, 멤버 회고, 공개 기록 상태. 세 표면을 같은 레벨로 비교한다.
- 다섯 번째 섹션: evidence ledger. 마감 증거를 빠르게 스캔하게 한다.

Desktop과 mobile 모두 같은 정보를 제공한다. 모바일에서는 카드가 한 열로 쌓이고, 버튼/링크는 터치 가능한 높이를 유지한다.

## 8. Error Handling And Safety

- Query loading/error boundary는 기존 host route boundary를 유지한다.
- 데이터가 없는 동안 route는 현재처럼 loader/query contract를 따른다.
- 알 수 없는 enum 값은 화면을 깨뜨리지 않고 `확인 필요` fallback을 쓴다.
- 링크가 없으면 disabled button을 만들기보다 이유가 있는 상태 copy를 보여 준다.
- UI와 테스트 fixture는 real member data, private domain, deployment state, local path, OCID, secret, token-shaped value를 포함하지 않는다.
- Admin-only route kind, raw JSON body, email body, transcript, provider raw error를 렌더링하지 않는다.

## 9. Testing

Unit/model:

- `session-closing-model.test.ts`
  - primary action별 한국어 label과 reason을 고정한다.
  - checklist state label/tone을 고정한다.
  - member/public surface href 유무별 detail을 고정한다.
  - evidence label/value fallback을 고정한다.
  - 알 수 없는 상태가 safe fallback을 쓰는지 확인한다.

UI:

- `session-closing-board.test.tsx`
  - heading, primary action panel, checklist state badge, surface link, evidence ledger를 렌더링한다.
  - private sentinel `member1@example.com`, `ADMIN_ROUTE`, raw JSON marker가 렌더링되지 않는다.
  - 링크가 없는 상태에서도 설명 copy가 보인다.

Targeted E2E:

- 기존 `front/tests/e2e/session-closing-flywheel.spec.ts`에 board 주요 문구와 host/member/public 링크 확인을 보강한다.
- E2E를 수정하지 않아도 unit/UI에서 충분히 커버되는 경우에는 E2E는 기존 coverage를 유지하고 skipped 이유를 최종 보고한다.

검증 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

E2E를 수정하면 다음을 추가한다.

```bash
pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts
```

## 10. Release Notes And Evidence

사용자에게 보이는 host UX 변경이므로 `CHANGELOG.md` `## Unreleased`에 짧게 기록한다.

Release classification:

- Frontend host UX only.
- No server production code.
- No DB migration.
- No public API contract change.
- No auth/BFF token or OAuth scope change.
- No deploy workflow behavior change.

Implementation closeout should report:

- changed surface,
- checks run,
- whether targeted E2E or visual inspection ran,
- any skipped validation and residual risk.

## 11. Spec Self-Review

- Placeholder scan: no unfinished placeholder markers remain.
- Internal consistency: frontend-only scope matches the server-contract non-goal.
- Scope check: focused enough for one implementation plan.
- Ambiguity check: primary action, checklist, surface, evidence, safety, and testing expectations are explicit.
