# ReadMates Admin Today Operations Ledger Design

작성일: 2026-05-27
상태: USER REVIEW REQUESTED

## 배경

현재 `/admin`은 `/admin/today`, `/admin/health`, `/admin/clubs`, `/admin/support`, `/admin/notifications`, `/admin/ai-ops`, `/admin/audit`, `/admin/analytics` route family로 분리되어 있고, 플랫폼 관리 기능의 큰 조각은 이미 존재한다. 사용자가 지적한 문제는 route 개수 부족보다는 첫 화면의 제품감, 호스트 화면과의 톤 일관성, 그리고 "지금 무엇을 처리해야 하는지"가 약하게 보이는 정보 구조다.

ReadMates 디자인 원칙상 호스트 화면은 "효율적인 운영 장부"여야 한다. 플랫폼 어드민도 같은 톤을 공유하되, 클럽 내부 세션/멤버 운영을 침범하지 않고 플랫폼 레벨의 aggregate 진단과 감사 가능한 복구 행동만 다룬다.

## 목표

`/admin/today`를 플랫폼 운영자가 가장 먼저 보는 **오늘 처리할 작업 큐**로 재구성한다. 화면은 대형 SaaS dashboard가 아니라 ReadMates다운 차분한 운영 장부여야 한다.

성공 기준:

- 운영자가 첫 화면에서 도메인 실패, 공개 준비, 알림 위험, AI job 이상처럼 "지금 조치할 것"을 우선순위로 확인한다.
- 각 작업 row가 문제 이유, 심각도, 다음 행동, 관련 상세 route를 분명히 보여준다.
- 선택 항목 브리프가 공개 체크리스트, 진단 패널, 권한에 맞는 CTA를 한 곳에 모은다.
- `/admin/health`, `/admin/notifications`, `/admin/ai-ops`, `/admin/clubs/:clubId`, `/admin/audit`은 깊은 작업 화면으로 유지한다.
- 부분 실패를 숨기지 않고 해당 운영 신호만 격리해서 표시한다.

## 비목표

- admin에서 클럽 내부 세션 생성, 멤버 상태 변경, 호스트 수동 운영을 대체하지 않는다.
- analytics chart나 마케팅형 dashboard를 `/admin/today`의 중심으로 만들지 않는다.
- 새 대형 서버 aggregator API를 먼저 만들지 않는다. 첫 구현은 기존 admin query를 조합하고, 부족한 신호만 작게 보강한다.
- 새로운 디자인 시스템 패키지를 만들지 않는다. 현재 `platform-admin` feature와 global style surface를 정돈해서 사용한다.

## UX 구조

`/admin/today`는 2열 운영 장부다.

왼쪽은 **작업 큐**다. row는 클럽 또는 플랫폼 운영 신호를 하나의 작업으로 표현한다.

- 클럽 공개 준비: 필수 공개 정보, 첫 호스트, lifecycle, domain readiness를 기준으로 "공개 전환" 또는 "준비 보류"를 표시한다.
- 도메인 조치: `FAILED`, `ACTION_REQUIRED` 같은 domain 상태를 앞쪽에 배치하고 marker 재확인 또는 상세 진입을 제공한다.
- 알림 위험: outbox backlog, delivery failure, replay 필요 신호는 알림 운영 route로 drill-down한다.
- AI job 위험: failed/stale job은 AI Ops route로 drill-down하고, disabled 상태는 정상 운영 상태로 구분한다.

오른쪽은 **선택 항목 브리프**다. 선택된 queue item에 대해 다음 정보를 보여준다.

- 현재 상태 요약: status, visibility, host onboarding, domain 상태, 관련 운영 신호.
- 다음 행동: 공개 전환, 도메인 확인, 알림 진단, AI job 확인처럼 하나의 primary action.
- 보조 링크: 클럽 상세, 헬스 카드, 알림 운영, AI Ops, 감사 ledger.
- 권한 설명: `SUPPORT`가 볼 수는 있지만 실행할 수 없는 action은 비활성 상태와 이유를 함께 표시한다.

상단 status strip은 유지하되, 역할/조치 필요/공개 준비/운영 경고처럼 today queue와 직접 이어지는 요약으로 읽혀야 한다. left nav는 route family 탐색 역할에 집중하고, 첫 화면 안에 또 다른 기능 카드 grid를 늘리지 않는다.

모바일에서는 2열을 그대로 압축하지 않는다. 작업 큐를 먼저 보여주고, row 선택 시 브리프가 아래에 이어지는 단일 흐름으로 둔다. CTA는 손가락으로 누르기 쉬운 크기를 유지한다.

## 아키텍처와 컴포넌트 경계

기존 frontend guide의 route-first 경계를 유지한다.

- `front/features/platform-admin/route/admin-today-route.tsx`: TanStack Query 데이터, URL 선택 상태, mutation callback 주입, route-level loading/error 조립을 담당한다.
- `front/features/platform-admin/model/platform-admin-workbench-model.ts`: queue item, severity, sort rank, selected brief, permission affordance를 순수 함수로 계산한다.
- `front/features/platform-admin/ui/*`: props와 callback만 받아 렌더링한다. fetch, query, route import를 직접 사용하지 않는다.

권장 UI 단위:

- `AdminTodayLedger`: 전체 today 화면의 layout 조립.
- `AdminWorkQueue`: priority queue list와 selected state.
- `AdminSelectedBrief`: 선택 항목의 다음 행동, 체크리스트, drill link.
- `AdminRiskStrip`: today queue와 연결되는 platform-level summary strip.

기존 `PlatformAdminWorkQueue`, `ClubOperationsBrief`, `AdminStatusStrip`는 새 구조에 맞게 재사용하거나 이름을 명확히 바꾼다. 구현 계획에서 현재 코드와 테스트 영향 범위를 다시 확인한 뒤 최소 파일 변경으로 정한다.

## 데이터 흐름

첫 구현은 기존 query 조합을 기본으로 한다.

```text
admin-today-route
  -> platformAdminSummaryQuery
  -> platformAdminClubsQuery
  -> platformAdminNotificationSnapshotQuery
  -> platformAdminAiOpsSummaryQuery / platformAdminAiOpsJobsQuery
  -> buildPlatformAdminWorkbench(input)
  -> AdminTodayLedger props
```

`buildPlatformAdminWorkbench`는 다음 입력을 하나의 작업 큐로 변환한다.

- club lifecycle, public visibility, first host onboarding, public info readiness.
- domain status와 action-required count.
- notification health snapshot에서 나온 backlog/failure/replay 위험.
- AI job status, stale 여부, AI disabled 여부.
- platform role과 capability matrix.

정렬은 운영자가 먼저 처리해야 할 순서다.

1. 공개/운영을 막는 blocked 상태.
2. domain, notification, AI failure처럼 attention이 필요한 상태.
3. 공개 전환 가능한 ready 상태.
4. 안정적인 stable 상태.

AI와 알림 item은 club row에 억지로 섞지 않는다. club과 연결되는 신호면 club context를 표시하고, platform-wide 신호면 별도 platform queue item으로 표시한다.

## 오류 처리와 권한

`/admin/today`는 "전체가 실패하는 dashboard"가 아니라 "실패한 운영 신호만 격리되는 장부"여야 한다.

- summary 또는 clubs query가 실패하면 today 화면의 기본 큐를 만들 수 없으므로 route-level error 또는 명확한 복구 문구를 표시한다.
- notification snapshot이 실패하면 알림 위험 영역만 "확인 불가"로 표시하고 club queue는 유지한다.
- AI Ops query가 503 disabled를 반환하면 장애가 아니라 "AI generation 비활성" 운영 상태로 표시한다.
- AI Ops query가 일반 실패면 AI queue item만 경고 상태로 격리한다.
- stale data는 숨기지 않고 마지막 갱신 시각과 함께 표시한다.

권한은 현재 `ADMIN_CAPABILITY_MATRIX`와 일치해야 한다.

- `OWNER`: 생성, 공개 전환, 지원 grant, AI force cancel 등 모든 허용 action을 사용할 수 있다.
- `OPERATOR`: 운영 action은 가능하되 support grant create/revoke는 제한된다.
- `SUPPORT`: 대부분의 화면은 읽기 가능하지만 mutation CTA는 비활성화하고 이유를 보여준다.

서버 또는 BFF secret, raw email, raw transcript, provider raw error, token-shaped 값은 화면과 문서 예시에 노출하지 않는다.

## 테스트와 검증

구현 계획은 다음 검증을 포함해야 한다.

- Model test: severity 정렬, selected item fallback, permission affordance, AI disabled/failed/stale mapping, notification risk mapping.
- Route test: query data를 seed했을 때 today ledger가 queue와 selected brief region을 렌더링하는지 확인한다.
- UI test: empty state, partial failure state, `SUPPORT` 비활성 CTA, 모바일-friendly single-column 구조.
- Boundary test: `ui`가 API/query/route를 import하지 않고, `model`이 React/router/fetch에 의존하지 않음을 기존 boundary test와 충돌 없이 유지한다.
- Manual visual check: `/admin/today` desktop과 mobile에서 텍스트 overflow, 겹침, focus state, host 화면과의 톤 일관성을 확인한다.

최소 실행 check:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

라우트/권한 흐름이 바뀌면 `pnpm --dir front test:e2e`도 포함한다.

## 문서와 릴리즈 고려

이 설계는 historical `docs/superpowers` 기록이며, 구현 후 current behavior가 바뀌면 `docs/development/architecture.md`의 플랫폼 관리 표면 설명과 관련 frontend docs가 실제 route/권한 동작과 맞는지 확인한다. 공개 repo safety를 유지하기 위해 예시는 synthetic club, masked user, placeholder domain만 사용한다.

CHANGELOG 반영은 구현 단계에서 결정한다. 사용자 visible admin surface가 바뀌므로 구현 PR에는 `Unreleased` 항목이 필요하다.
