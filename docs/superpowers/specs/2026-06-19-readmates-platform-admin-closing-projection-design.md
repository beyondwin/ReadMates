# ReadMates Platform Admin Closing Projection

작성일: 2026-06-19
상태: APPROVED DESIGN SPEC
대상 표면: front, server, platform admin club detail, session closing projection, local release evidence

## 1. 배경

ReadMates는 최근 세션 종료 이후 흐름을 크게 정리했다.

- 호스트는 `/clubs/:slug/app/host/sessions/:sessionId/closing`에서 회차별 클로징 상태를 본다.
- `sessionclosing` read model은 세션, 기록 패키지, 피드백 문서, 알림, 공개 기록 상태를 host-safe projection으로 계산한다.
- 멤버 홈, 알림, archive, feedback route는 지난 모임 회고 흐름으로 이어진다.
- 공개 records와 public session detail은 발행된 기록만 보여준다.

남은 빈칸은 platform admin 표면이다. `/admin/clubs/:clubId`의 club operations snapshot은 `incompleteRecordCount` 같은 숫자는 보여주지만, 운영자가 어느 회차를 확인해야 하는지, 무엇이 막혔는지, 호스트가 실제로 볼 closing board가 어디인지는 알려 주지 않는다.

실제 로컬 BrowserRouter 확인에서도 별도 미완이 있었다. `/admin/clubs/:clubId` 직접 진입이 admin shell이 아니라 public 404 화면으로 떨어졌다. 단위 테스트와 mocked E2E는 admin route를 검증하지만, 실제 route order에서는 public catch-all이 `/admin/**`을 먼저 소비할 수 있다. 이번 설계는 이 route 현실 문제를 먼저 닫고, 그 위에 admin closing projection을 추가한다.

## 2. 목표

성공 기준은 "미완료 기록 수를 더 크게 보여준다"가 아니다. Platform admin이 클럽별 운영 품질 리스크를 보고, 직접 host-owned command를 실행하지 않으면서도 호스트가 확인해야 할 closing board로 정확히 이동할 수 있어야 한다.

구체 목표:

- 실제 BrowserRouter에서 `/admin/**`가 public catch-all에 막히지 않는다.
- `/admin/clubs/:clubId`가 미완료 또는 차단된 회차를 admin-safe list로 보여준다.
- Admin projection은 raw member data, feedback body, provider raw error, raw JSON, token, private deployment data를 노출하지 않는다.
- Platform admin은 발행, 세션 종료, 알림 발송 같은 host command를 직접 실행하지 않는다.
- Host closing board의 판단과 admin club detail의 closing risk가 의미상 어긋나지 않는다.
- Frontend, server, E2E, public-release evidence로 local release risk를 닫을 수 있다.

## 3. Non-goals

- 별도 `/admin/closing` 콘솔 신설.
- Platform admin이 세션을 닫거나 기록을 발행하는 mutation 추가.
- 새 DB migration 또는 수동 완료 체크 영속 상태.
- AI provider, prompt, model catalog, cost policy 변경.
- Notification outbox, Kafka worker, email template 동작 변경.
- Public SEO, RSS, SSR, PDF 또는 print layout 확장.
- CI visual regression infrastructure 도입.
- Production deploy, release tag push, provider-console smoke 자동화.

## 4. 선택한 접근

선택한 접근은 **Admin club detail에 closing risk projection을 붙이고 route reality를 먼저 고치는 방식**이다.

검토한 대안:

1. **Route fix + 숫자/문구 개선만**
   - 장점: 가장 작다.
   - 단점: 어떤 회차가 막혔는지 알 수 없어 운영 판단이 여전히 약하다.

2. **Admin club detail closing projection**
   - 장점: 기존 `/admin/clubs/:clubId` 문맥 안에서 클럽별 리스크를 바로 좁힐 수 있고, 최근 `sessionclosing` work와 자연스럽게 이어진다.
   - 단점: server contract와 frontend UI가 함께 바뀐다.

3. **Full platform admin closing console**
   - 장점: 모든 클럽의 closing queue를 한 화면에 모을 수 있다.
   - 단점: 현재 범위보다 크고, club detail projection 없이 바로 콘솔을 만들면 상태 판단과 drilldown contract가 커진다.

이번 작업은 2번을 선택한다. 별도 admin console은 club detail projection이 충분히 검증된 뒤 후속으로 다룬다.

## 5. Architecture

작업명은 **Platform Admin Closing Projection**으로 둔다. 먼저 실제 `/admin/**` 진입이 public catch-all에 막히는 문제를 닫고, 그 위에 admin club detail 고도화를 얹는다.

서버는 기존 `sessionclosing`의 회차별 host projection을 그대로 admin에게 노출하지 않는다. 대신 `AdminClubOperationsSnapshot`에 admin-safe aggregate projection을 추가한다.

예상 contract:

```ts
type AdminClubClosingRisks = {
  incompleteCount: number;
  blockedCount: number;
  readyCount: number;
  items: Array<{
    sessionId: string;
    sessionNumber: number;
    bookTitle: string;
    meetingDate: string;
    overallState: "IN_PROGRESS" | "BLOCKED" | "READY";
    primaryBlocker: string | null;
    hostClosingHref: string;
  }>;
};
```

`AdminClubOperationsSnapshot`은 기존 `schema: "admin.club_operations_snapshot.v1"`을 유지하면서 optional additive field를 붙이거나, 구현 계획에서 backward compatibility가 더 명확하다고 판단되면 `v2`로 올린다. 기본 선호는 additive field다. 기존 frontend가 무시 가능한 방향이 더 안전하다.

Projection 원칙:

- Admin projection은 운영 판단과 host board drilldown만 포함한다.
- Host-owned command는 admin UI에 만들지 않는다.
- `hostClosingHref`는 `/clubs/:slug/app/host/sessions/:sessionId/closing` canonical path를 사용한다.
- private member email, feedback body, raw provider error, raw JSON, internal stack trace, secret, token-shaped value는 contract와 UI 모두에서 제외한다.

## 6. Server Design

주요 변경 후보:

- `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`
- `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
- `server/src/test/kotlin/com/readmates/club/...`
- 필요 시 `sessionclosing`의 판단 helper 추출

`JdbcAdminClubOperationsAdapter`가 클럽 단위로 closing 후보를 계산한다.

후보 범위:

- 최근 또는 현재 운영상 의미 있는 `CLOSED`/`PUBLISHED` 근처 회차.
- 기록 패키지, 피드백 문서, 공개 visibility, notification evidence 중 하나라도 미완료이거나 차단된 회차.
- 너무 오래된 historical row까지 전부 보여주지 않고, recent-first limit을 둔다. 기본 row limit은 5개다.

상태 계산:

- `BLOCKED`: 피드백 문서 parser/저장 상태가 invalid이거나, 공개 가능한 상태를 막는 명확한 차단 조건이 있는 경우.
- `IN_PROGRESS`: 기록 패키지, 피드백 문서, 공개 기록, 알림 evidence 중 필요한 항목이 아직 빠진 경우.
- `READY`: host가 공개 페이지 확인 또는 알림 확인 같은 후속 점검을 하면 되는 경우.

`SessionClosingStatusService`와 완전히 같은 response 객체를 공유하지 않는다. 공유하면 admin-safe projection과 host-safe projection 경계가 흐려질 수 있다. 다만 판단 규칙이 어긋나지 않도록 구현 계획에서 아래 둘 중 하나를 선택한다.

- 공통 pure helper를 `sessionclosing.application` 안에 두고 host/admin projection이 함께 사용한다.
- Admin adapter-local query projection으로 시작하되, server tests에서 host closing fixture와 의미상 parity를 고정한다.

## 7. Frontend Design

주요 변경 후보:

- `front/src/app/routes/public.tsx`
- `front/src/app/router.tsx` 또는 route ordering composition
- `front/features/platform-admin/model/platform-admin-club-operations-model.ts`
- `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- `front/features/platform-admin/route/admin-club-detail-route.tsx`
- `front/tests/e2e/admin-club-operations.spec.ts`

### Route Reality Fix

`/admin/**`는 public route의 `*` catch-all보다 먼저 matching되어야 한다. 구현 계획은 현재 React Router route ordering을 확인한 뒤 가장 작은 수정으로 닫는다.

허용되는 방향:

- `buildRoutes()`에서 admin/auth/member/host routes를 public catch-all보다 앞에 둔다.
- 또는 public catch-all이 known app/admin path를 먹지 않게 public route structure를 조정한다.

완료 조건은 mocked API가 있는 실제 BrowserRouter smoke에서 `/admin/today`와 `/admin/clubs/:clubId`가 admin shell로 들어가는 것이다.

### Admin Club Detail UI

`/admin/clubs/:clubId`의 "호스트 운영" 섹션을 숫자 카드에서 운영 queue로 한 단계 올린다.

유지할 metric:

- 예정
- 열린 세션
- 공개 기록
- 미완료 기록

추가할 panel:

- 제목: `클로징 확인 필요`
- summary: 미완료/차단/준비 회차 수.
- row: `No.07 · 책 제목`, 모임일, 상태 badge, 차단 사유, `호스트 클로징 보드` 링크.
- row limit: 최대 5개.
- overflow: `외 N개 회차`.

Admin UI는 아래를 렌더링하지 않는다.

- `발행`
- `세션 종료`
- `알림 발송`
- `RSVP/출석 수정`
- raw issue code 목록

Unknown blocker는 raw code 대신 `확인 필요`로 표시한다.

## 8. Data Flow

```text
Browser /admin/clubs/:clubId
  -> admin shell loader
  -> GET /api/admin/clubs
  -> GET /api/admin/clubs/:clubId/operations
  -> AdminClubOperationsSnapshot with closingRisks
  -> platform-admin model maps safe labels and host closing hrefs
  -> AdminClubOperationsPage renders risk queue
  -> admin opens host closing board link when they need the host-owned surface
```

Host closing board는 계속 host route와 host authorization을 따른다. Admin이 그 링크를 클릭했을 때 실제 접근 가능 여부는 현재 auth state와 role guard가 결정한다. 이번 설계는 admin에게 host 권한을 부여하지 않는다.

## 9. Error Handling and Permissions

Route errors:

- `/admin/**`가 public 404로 떨어지면 실패다.
- Admin auth가 없으면 기존 login/permission flow를 유지한다.
- Club id가 없거나 찾을 수 없으면 기존 `클럽 상세` not-found state를 유지한다.

Closing risk errors:

- 구현 v1은 operations snapshot 전체 실패 정책을 유지할 수 있다. 단, 그 경우 테스트와 spec에 "closingRisks 부분 실패 격리는 후속"이라고 명확히 남긴다.
- 구현이 작게 가능하면 closing risk query 실패를 panel-local `확인 불가`로 격리한다. 이 경우 club/member/notification/AI sections는 계속 렌더링한다.

Permission and public safety:

- Platform admin support role도 aggregate read는 가능하다. Mutation은 추가하지 않는다.
- Raw member email, private domain, provider raw error, feedback body, raw JSON, token-shaped value는 UI에 렌더링하지 않는다.
- Test fixture에는 sentinel을 둘 수 있지만, production UI 렌더링 금지 assertion으로만 사용한다.

## 10. Testing

Frontend route reality:

- 실제 route composition에서 `/admin/today`가 public 404로 가지 않는다.
- 실제 route composition에서 `/admin/clubs/:clubId`가 admin club detail로 들어간다.

Frontend model/UI:

- `closingRisks` empty state.
- `BLOCKED`, `IN_PROGRESS`, `READY` row rendering.
- unknown blocker fallback.
- row overflow summary.
- host closing board link path.
- host command button 미노출.

E2E:

- Mocked platform admin shell + club operations API로 `/admin/clubs/:clubId` 직접 진입.
- Closing risk row와 `호스트 클로징 보드` 링크 확인.
- public-safe sentinel 미노출 확인.
- 기존 `admin-club-operations.spec.ts`에 붙이거나 새 targeted spec으로 분리한다.

Server:

- `JdbcAdminClubOperationsAdapter` integration test가 미완료, 차단, ready 회차를 계산한다.
- Projection이 session id, session number, title, meeting date, state, primary blocker, host closing href만 포함하는지 확인한다.
- Architecture test가 새 dependency direction을 깨지 않는지 확인한다.

Release/public safety:

- `git diff --check`.
- Frontend lint/test/build.
- Targeted admin E2E.
- Server `check`와 `architectureTest`.
- Public release candidate build/check.

## 11. Implementation Notes

권장 순서:

1. Route reality characterization test를 먼저 추가해 `/admin/**` 직접 진입 문제를 재현한다.
2. Route ordering 또는 public catch-all 구조를 최소 수정한다.
3. Server `closingRisks` contract와 adapter projection을 추가한다.
4. Frontend contract/model/UI를 연결한다.
5. Admin club operations E2E로 실제 browser entry와 risk row를 함께 검증한다.
6. CHANGELOG와 release-readiness note는 구현 완료 시 변경 표면에 맞춰 작성한다.

## 12. Open Decisions for Implementation Plan

- `AdminClubOperationsSnapshot` schema를 `v1` additive로 유지할지 `v2`로 올릴지 구현 조사 후 결정한다. 기본값은 additive `v1`이다.
- Closing risk panel-local failure isolation은 구현 복잡도를 본 뒤 결정한다. 기본값은 기존 operations snapshot 실패 정책 유지다.
- `sessionclosing` 판단 helper를 추출할지 adapter-local projection으로 시작할지 서버 테스트 설계 중 결정한다. 기본값은 adapter-local projection + parity tests다.

