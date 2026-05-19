# ReadMates Platform Admin Productization Design

작성일: 2026-05-20
상태: APPROVED DESIGN SPEC

## 배경

현재 `/admin`은 platform admin onboarding, club registry, domain provisioning, support access grant, AI Ops를 모두 갖고 있다. 기능 표면은 넓지만 첫 화면은 섹션이 순서대로 쌓인 형태라 운영자가 "오늘 무엇을 먼저 봐야 하는가"를 즉시 판단하기 어렵다. 사용자는 기존 호스트 페이지처럼 상단 탭을 두어도 된다고 승인했고, 최종 방향은 **작업 중심 탭 + 오늘 할 일 기본 화면**으로 고정한다.

이 작업은 단순한 visual polish가 아니다. 현 기능들이 실제 제품처럼 동작하는지 확인한 결과, UI 정보구조와 기능 완성도 양쪽에서 함께 닫아야 할 결함이 있다.

## Source Audit Findings

2026-05-20 기준 코드 감사 결과:

- `PlatformAdminDashboard`는 summary, work queue, selected club brief, AI Ops, onboarding wizard를 한 페이지에 모두 렌더링한다. 탭이나 URL state가 없어 화면 복잡도가 빠르게 커진다.
- `PlatformAdminClubDetail`은 publish checklist와 별도로 `공개`/`비공개` 버튼을 노출한다. 이 버튼은 role permission과 checklist disabled reason을 UI에서 반영하지 않아, `SUPPORT` 역할이나 publish-blocked club도 클릭 가능한 것처럼 보일 수 있다. 서버는 403/400으로 막지만 제품 UX는 허술하다.
- `PlatformAdminClubDetail`의 draft state는 빈 문자열 sentinel로 초기화된다. 한 클럽을 편집한 뒤 다른 클럽을 선택하면 이전 클럽 draft가 남을 수 있다.
- Support access grant UI는 raw `granteeUserId` UUID 입력을 요구한다. 운영자가 실제 제품에서 사용하기 어렵고, 잘못된 UUID/권한 없는 사용자/만료 시각 검증 실패를 사전에 줄이지 못한다.
- `SupportAccessGrantService`는 생성 권한과 reason blank는 검증하지만, grantee가 active platform admin인지, 만료 시각이 미래인지, 최대 허용 기간을 넘지 않는지에 대한 명시적 application validation이 약하다.
- `SupportAccessGrantRow` revoke failure는 silent 처리된다. 실패하면 row가 남긴 하지만 운영자가 왜 실패했는지 알 수 없다.
- AI Ops API는 filters/cursor를 지원하지만 UI는 status/club/errorCode filter, load-more, detail drilldown을 사용하지 않는다.
- AI Ops가 disabled일 때 503 `AI_DISABLED`가 정상 운영 상태일 수 있지만, 현재 route error copy는 일반 "불러오지 못했습니다"로 보일 가능성이 높다.
- 로컬 dev seed에는 `/admin`을 바로 확인할 platform admin dev-login 계정이 없다. `http://localhost:5173/admin`은 로그인 후에도 별도 DB 조작 없이는 실제 admin 화면 확인이 어렵다.
- E2E는 AI Ops 권한 affordance만 mock 검증한다. `/admin`의 탭 구조, club detail save, support access, onboarding route-level happy path는 단위 테스트 중심이다.

## 승인된 방향

`/admin`은 ReadMates의 **운영 대장부**로 만든다.

상단 구조:

```text
상태 strip + 새 클럽 버튼
탭: 오늘 할 일 / 클럽 상세 / AI Ops / 지원 접근
```

기본 탭은 `오늘 할 일`이다. 대상별 데이터 나열이 아니라, 운영자가 오늘 처리할 항목과 안전한 다음 액션을 먼저 본다. `도메인`은 별도 탭으로 빼지 않고 `클럽 상세` 안의 publish readiness 근거로 둔다. `새 클럽`은 매일 보는 탭이 아니라 상단 버튼으로 열리는 onboarding panel로 유지한다.

## 목표

- `/admin` 첫 화면이 "무엇을 먼저 처리할지"를 답하게 한다.
- 기존 ReadMates 톤과 맞는 조용한 ledger UI로 정리한다.
- 탭 전환으로 정보 밀도를 낮추되, 운영 summary는 상단에서 항상 유지한다.
- 역할별 허용/금지 액션이 UI와 서버에서 같은 메시지를 갖게 한다.
- 클럽 공개 전환, domain check, support grant, AI force-cancel의 실패 상태를 운영자가 이해할 수 있게 한다.
- 로컬 개발자가 dev-login만으로 `/admin`을 실제 화면으로 열어 검증할 수 있게 한다.
- transcript, AI raw result, provider raw error, private member data, secret, deployment state는 노출하지 않는다.

## 비목표

- 일반 platform admin 사용자 관리 콘솔을 만들지 않는다.
- 클럽 내부 멤버/세션/참석/노트 운영을 `/admin`으로 옮기지 않는다.
- support access를 host workflow 대체 기능으로 확장하지 않는다.
- AI prompt 품질, 모델 관리 UI, provider key 관리 UI는 포함하지 않는다.
- 도메인을 독립 운영 탭으로 분리하지 않는다.
- 공개 릴리즈용 실제 운영 데이터, private domain, local absolute path, OCID, token-shaped 예시는 추가하지 않는다.

## Information Architecture

### 상단 상태 strip

상단은 모든 탭에서 유지한다.

- platform role
- 조치 필요 club count
- 공개 준비 club count
- domain action count
- AI active/stale/failed summary

AI generation이 disabled이면 AI card는 failure가 아니라 `AI_DISABLED` 운영 상태로 표시한다. 이 상태에서는 AI Ops 탭 진입은 가능하되, job ledger 영역은 "kill switch off" state를 보여준다.

### 오늘 할 일

기본 탭이다.

구성:

- 왼쪽: priority queue
  - publish blocked
  - domain failed/action required
  - first host missing/invited
  - ready to publish
  - AI stale/failed operational items
- 오른쪽: selected item brief
  - 이유
  - 안전한 다음 액션
  - 관련 탭으로 이동하는 action
  - 서버가 거부할 수 있는 조건

Queue item은 club item과 AI item을 같은 list에 섞되, view model type으로 구분한다. UI는 문자열 badge parsing이 아니라 typed severity/action을 사용한다.

### 클럽 상세

선택된 club의 platform-owned 정보만 다룬다.

- publish readiness checklist
- public metadata edit
- visibility action rail
- domain provisioning list/check
- first host onboarding state

변경점:

- `PlatformAdminClubDetail`에서 직접 `공개`/`비공개` 버튼을 제거한다.
- visibility 변경은 checklist/action rail 하나에서만 실행한다.
- public metadata save는 `OWNER`/`OPERATOR`만 활성화한다.
- selected club 변경 시 draft를 새 club data로 reset한다.
- save 실패는 inline error로 보여주고 이전 draft를 보존한다.

### AI Ops

AI 운영 표면은 탭으로 분리한다.

- summary metrics
- status filter
- club filter
- error code filter
- cursor load more
- job row
- safe detail panel
- force-cancel action

Job detail은 safe metadata만 표시한다.

허용:

- job id
- club/session safe labels
- status/stage/progress
- provider/model
- created/updated/expiresAt
- cost/token aggregate
- errorCode/safeErrorMessage
- available actions

금지:

- transcript
- generated result JSON
- instructions
- feedback document body
- provider raw response/error

`OWNER`/`OPERATOR`만 force-cancel 버튼을 본다. `SUPPORT`는 read-only다.

### 지원 접근

Support access는 선택 club 기준으로만 동작한다.

개선:

- raw UUID 입력을 기본 UX로 쓰지 않는다.
- `grantee email` 입력으로 active platform admin을 resolve한 뒤 grant 생성한다.
- resolve 결과에는 userId, email, display name, platform role, active/disabled 상태만 표시한다.
- grantee가 active platform admin이 아니면 grant 생성이 막힌다.
- expiresAt은 기본 1시간, 서버는 미래 시각과 최대 TTL을 검증한다.
- revoke 실패는 inline error로 표시한다.

서버 validation:

- `OWNER`만 create/revoke 가능.
- grantee user must exist.
- grantee must be active platform admin.
- expiresAt must be in the future.
- expiresAt must not exceed the configured max support grant duration.
- reason is required.

### 새 클럽

상단 `새 클럽` 버튼으로 panel 또는 drawer를 연다. 탭으로 만들지 않는다.

흐름:

1. Club public info 입력.
2. First host email/name 입력.
3. Optional domain 입력.
4. Preview.
5. Existing user confirmation 또는 invitation creation.
6. Created club을 선택하고 `클럽 상세` 탭으로 이동.

현재 onboarding API는 유지한다. UI는 결과의 mail status와 domain action state를 더 명확히 보여준다.

## Frontend Architecture

경계는 기존 route-first 구조를 유지한다.

```text
front/src/app -> front/src/pages -> front/features/platform-admin -> front/shared
```

Feature 내부:

```text
features/platform-admin/api
features/platform-admin/model
features/platform-admin/queries
features/platform-admin/route
features/platform-admin/ui
```

추가/변경 모듈:

- `model/platform-admin-workbench-model.ts`
  - 기존 club queue model을 `TodayQueueItem`으로 확장한다.
  - club item과 AI item을 typed union으로 표현한다.
- `route/platform-admin-route.tsx`
  - active tab state를 소유한다.
  - query param `?tab=today|club|ai|support`와 동기화한다.
  - AI jobs query는 AI 탭 또는 오늘 할 일에서 필요한 범위로만 실행한다.
- `ui/platform-admin-dashboard.tsx`
  - 상단 status strip + tab shell + onboarding trigger를 렌더링한다.
- 신규 UI 모듈
  - `platform-admin-tabs.tsx`
  - `platform-admin-today-tab.tsx`
  - `platform-admin-status-strip.tsx`
  - `platform-admin-safe-action-panel.tsx`
  - `support-grantee-lookup.tsx`

UI 컴포넌트는 계속 props/callback driven이어야 한다. API client와 QueryClient import는 route/queries layer에 둔다.

## Server/API Architecture

기존 platform admin API는 유지한다. 필요한 보강은 좁게 추가한다.

### User lookup for support grants

새 endpoint:

```text
GET /api/admin/users/lookup?email=<email>
```

응답:

```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "email": "support@example.com",
  "displayName": "Support User",
  "platformAdminRole": "SUPPORT",
  "platformAdminStatus": "ACTIVE"
}
```

정책:

- `OWNER`만 호출 가능하다.
- exact normalized email lookup만 지원한다. 부분 검색은 하지 않는다.
- 없는 사용자와 inactive/non-admin 사용자는 public-safe error로 반환한다.
- list/search autocomplete는 이번 범위에 넣지 않는다.

### Support grant validation

`SupportAccessGrantService`에 application validation을 추가한다.

- grantee active platform admin 여부 확인.
- future expiresAt 확인.
- max TTL 확인.
- create/revoke audit event 유지.

### Local dev admin fixture

로컬 dev seed에 synthetic platform admin 계정을 추가한다.

- 예: `admin@example.com`
- `platform_admins.role = OWNER`, `status = ACTIVE`
- dev-login allowlist와 login button에 `운영자 · 플랫폼`을 추가한다.
- 기존 `host@example.com`은 host-only fixture로 남겨 `host without platform admin` 검증 의미를 유지한다.

## Error Handling

- Loader-level failure: route error boundary.
- Tab-local query failure: 탭 내부 alert/status panel.
- `AI_DISABLED`: 장애가 아니라 kill-switch 상태로 표시.
- Domain check failure: domain row inline error.
- Club metadata save failure: club detail inline error, draft 유지.
- Visibility mutation failure: action rail inline error.
- Support lookup/create/revoke failure: support tab inline error.
- Onboarding preview/commit failure: onboarding panel inline error.

모든 error copy는 public-safe여야 한다. SQL detail, stack trace, provider raw error, private member data, deployment identifier, secret/token 원문은 표시하지 않는다.

## Testing Plan

Frontend:

- `platform-admin-workbench-model.test.ts`
  - today queue ordering
  - AI item + club item mixed queue
  - selected item behavior
  - role permission view
- `platform-admin.test.tsx`
  - tab switching and URL state
  - club detail draft resets on selected club change
  - support role cannot see enabled mutation controls
  - `AI_DISABLED` state copy
- `platform-admin-ai-ops-queries.test.tsx`
  - filters/cursor key normalization
- `platform-admin-ai-ops.spec.ts`
  - support read-only
  - owner/operator force-cancel
  - tab shell visibility

Server:

- `PlatformAdminControllerTest`
  - dev admin fixture does not make host fixture a platform admin
  - support cannot mutate club/domain
- `SupportAccessGrantControllerTest`
  - owner can resolve active platform admin by email
  - non-owner cannot lookup grantee
  - grant create rejects non-admin or disabled grantee
  - grant create rejects past/too-long expiration
  - revoke failure returns visible error contract
- `AiGenerationOpsControllerTest`
  - status/club/error filter mapping
  - response omits unsafe payload fields
  - disabled AI path maps to `AI_DISABLED`

Manual/browser:

- Open `/admin` in local dev via platform admin dev-login.
- Check desktop and mobile layouts.
- Verify no text overlap in Korean labels, badges, and buttons.

Required checks after implementation:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

If only a smaller slice ships, run the narrow targeted checks first and report any skipped commands with reason.

## Implementation Slices

1. **Design shell first**
   - Add tab shell, status strip, today tab, and route query state.
   - Keep current API contracts.

2. **Club detail correctness**
   - Remove duplicate visibility buttons.
   - Add permission-aware controls.
   - Fix selected-club draft reset.
   - Add inline mutation errors.

3. **Support access productization**
   - Add grantee lookup endpoint and UI.
   - Add server validation for grantee role/status and expiration.
   - Add visible revoke errors.

4. **AI Ops completion**
   - Add filters, load more, safe detail panel, and `AI_DISABLED` state.
   - Keep unsafe payloads out of response/UI.

5. **Local dev and E2E**
   - Add synthetic platform admin dev fixture.
   - Add dev-login shortcut.
   - Expand E2E coverage for the admin shell.

## Acceptance Criteria

- `/admin` opens into `오늘 할 일` by default.
- Top tabs are visible and responsive on desktop/mobile.
- `새 클럽` remains an action button/panel, not a primary daily tab.
- A `SUPPORT` platform admin can read allowed metadata but cannot see enabled mutation controls.
- Club detail fields reset when switching clubs.
- Visibility changes are only exposed through the publish/action rail.
- Support grant creation does not require the operator to paste a raw UUID as the normal path.
- Support grants cannot be created for non-admin, disabled, unknown, expired, or over-long targets.
- AI Ops handles disabled AI as an intentional state.
- AI Ops supports status/error/club filtering and cursor load more.
- Local dev can open `/admin` with a synthetic platform admin fixture.
- Tests cover route shell, role affordances, support validation, and unsafe AI payload exclusion.
