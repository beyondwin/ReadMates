# ReadMates Session Closing Flywheel

작성일: 2026-06-18
상태: APPROVED DESIGN SPEC
대상 표면: server, front, host closing board, member notification/reflection loop, public records showcase, release evidence

## 1. 배경

ReadMates는 최근 호스트 세션 기록 패키지 흐름을 크게 정리했다.

- 호스트 세션 편집기의 외부 JSON 가져오기 preview는 저장 전 검토 화면으로 강화되었다.
- 기록 패키지 commit 이후 호스트는 저장 결과 장부를 볼 수 있다.
- 멤버 홈은 최근 발행 기록을 `지난 모임 회고` 카드로 보여주고, 기록 보기와 피드백 문서 진입을 제공한다.
- Archive와 feedback route는 기존 권한, 참석 여부, 문서 존재 여부에 따라 feature-owned 상태를 렌더링한다.

남은 과제는 이 흐름을 한 번의 feature가 아니라 반복 가능한 제품 루프로 만드는 것이다. 호스트가 모임 종료 후 어떤 일이 남았는지 판단하고, 멤버는 알림과 홈에서 지난 모임으로 돌아오며, 공개 기록은 발행된 결과만으로 모임의 품질을 보여줘야 한다.

이 설계는 `C + A + B` 통합 고도화를 **Session Closing Flywheel**로 묶는다. 우선순위는 **Host source-of-truth first**다. 기준 상태가 먼저 있어야 member/public 표면이 화면마다 따로 추정하지 않고 일관되게 좋아질 수 있다.

## 2. 목표

성공 기준은 "세 화면을 각각 보기 좋게 만든다"가 아니다. 회차가 끝난 뒤 하나의 상태 흐름이 host, member, public 표면을 관통해야 한다.

구체 목표:

- 서버가 회차별 closing status를 host-safe read model로 계산한다.
- 호스트가 한 화면에서 현재 회차의 다음 행동, 체크리스트, Host/Member/Public 표면 상태를 판단한다.
- 멤버 알림, 멤버 홈, archive, feedback route가 같은 세션 회고 맥락으로 이어진다.
- 공개 records index와 public session detail이 발행된 기록을 refined literary journal처럼 보여준다.
- 공개/멤버/호스트 projection 사이에 private data, raw email, raw JSON, provider error, admin-only 상태가 섞이지 않는다.
- 서버, 프런트, E2E, public-release 검증까지 release evidence를 닫는다.

## 3. Non-goals

- 새 AI provider, prompt, model catalog, cost policy 변경.
- 새 이메일 템플릿 디자인 전면 개편.
- Platform admin closing console.
- 수동 "운영 완료 체크" 영속 상태.
- Public SEO, RSS, SSR 확장.
- PDF download 또는 print layout 확장.
- GitHub Actions visual regression infrastructure.
- Production deploy, release tag push, provider-console smoke 자동화.

## 4. 선택한 접근

선택한 접근은 **Host source-of-truth first Session Closing Flywheel**이다.

검토한 대안:

1. **UI-first 연결**
   - 장점: 기존 응답으로 빠르게 host/member/public 화면을 정리할 수 있다.
   - 단점: closing 상태 판단이 화면마다 중복되고, 회차가 정말 닫혔는지 source of truth가 약하다.

2. **Public showcase 먼저**
   - 장점: 외부 인상과 공개 기록 품질이 빠르게 좋아진다.
   - 단점: invite-only 제품의 핵심 운영 루프와 직접 연결되는 정도가 낮다.

3. **Host source-of-truth 먼저**
   - 장점: closing 상태 모델이 생기면 host/member/public이 같은 회차 상태를 각자 권한에 맞게 소비할 수 있다.
   - 단점: server API, frontend route, E2E, release evidence까지 범위가 커진다.

이번 작업은 3번을 선택한다. 사용자는 범위가 커도 품질 있게 진행하기를 원했으므로, 필요한 server/API 변경을 허용한다. 단, DB migration은 새 영속 상태가 꼭 필요할 때만 둔다.

## 5. 아키텍처 개요

전체 흐름:

```text
Server closing read model
  -> Host closing board projection
  -> Member reflection notification/home projection
  -> Public records showcase projection
```

서버는 `sessionimport`, `session`, `archive`, `feedback`, `notification`, `publication` 데이터를 조합해 회차 클로징 상태를 계산한다. 원본 쓰기 모델은 최대한 건드리지 않고, 새 기능은 read model, projection, route continuity 중심으로 둔다.

Projection 원칙:

- Host projection은 운영 판단과 복구 링크를 포함한다.
- Member projection은 멤버가 볼 수 있는 회고 진입, 알림 상태, 피드백 접근 가능성만 포함한다.
- Public projection은 이미 공개 가능한 기록만 포함한다.
- 어떤 projection도 raw email body, raw provider error, raw JSON, token, private deployment data, admin-only action을 노출하지 않는다.

## 6. Server Closing Status 모델

새 read-side 성격의 `sessionclosing` slice를 추가한다.

```text
sessionclosing
  adapter.in.web
    HostSessionClosingController
  application.port.in
    GetHostSessionClosingStatusUseCase
  application.service
    SessionClosingStatusService
  application.port.out
    LoadSessionClosingStatusPort
  adapter.out.persistence
    JdbcSessionClosingStatusAdapter
```

1차 API는 host 전용이다.

```http
GET /api/host/sessions/{sessionId}/closing-status
```

응답 contract:

```ts
type SessionClosingStatus = {
  schema: "host.session_closing_status.v1";
  session: {
    sessionId: string;
    sessionNumber: number;
    bookTitle: string;
    meetingDate: string;
    state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
    recordVisibility: "PUBLIC" | "MEMBERS_ONLY" | "HOST_ONLY";
  };
  overall: {
    state: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "READY" | "PUBLISHED";
    label: string;
    primaryAction:
      | "CLOSE_SESSION"
      | "IMPORT_RECORDS"
      | "PUBLISH_RECORDS"
      | "SEND_NOTIFICATION"
      | "REVIEW_PUBLIC_PAGE"
      | "NONE";
  };
  checklist: Array<{
    id:
      | "SESSION_CLOSED"
      | "RECORD_PACKAGE_SAVED"
      | "FEEDBACK_DOCUMENT_READY"
      | "MEMBER_NOTIFICATION_SENT"
      | "PUBLIC_RECORD_VISIBLE"
      | "PUBLIC_SHOWCASE_READY";
    state: "DONE" | "ACTION_REQUIRED" | "BLOCKED" | "NOT_APPLICABLE";
    label: string;
    detail: string;
    href?: string;
  }>;
  evidence: {
    summaryPublished: boolean;
    highlightCount: number;
    oneLinerCount: number;
    feedbackDocumentState: "AVAILABLE" | "MISSING" | "LOCKED" | "INVALID";
    latestNotificationEvent?: {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "NEXT_BOOK_PUBLISHED";
      status: "PENDING" | "PUBLISHED" | "FAILED" | "DEAD";
      createdAt: string;
    };
    publicRecordHref?: string;
    memberReflectionHref?: string;
  };
};
```

상태 계산:

- 세션이 아직 `OPEN`이면 `SESSION_CLOSED`는 `ACTION_REQUIRED`다.
- 기록 패키지가 없거나 비어 있으면 `RECORD_PACKAGE_SAVED`는 `ACTION_REQUIRED`다.
- 피드백 문서가 없으면 `FEEDBACK_DOCUMENT_READY`는 `ACTION_REQUIRED`다.
- 피드백 문서 parser 상태가 invalid이면 `FEEDBACK_DOCUMENT_READY`는 `BLOCKED`다.
- 공개 범위가 `PUBLIC`이고 public API에서 해당 세션이 노출 가능하면 `PUBLIC_RECORD_VISIBLE`은 `DONE`이다.
- notification 상태는 기존 outbox/delivery 상태를 안전한 event/status 수준으로 요약한다.
- public showcase는 공개 가능한 기록이 있고 public detail href가 있으면 `DONE` 또는 `READY`로 판단한다.

권한:

- 현재 클럽의 `HOST` membership만 조회할 수 있다.
- 다른 클럽 세션은 403 또는 404 정책을 기존 host API와 맞춘다.
- Platform admin projection은 이번 설계의 범위 밖이다.

DB migration:

- 기본 설계는 migration 없이 기존 데이터에서 계산한다.
- 수동 완료 체크처럼 새 영속 상태가 필요해지면 별도 승인 대상으로 다룬다.

## 7. Host Closing Board UX

Host Closing Board는 별도 route를 기준으로 설계한다.

```text
/clubs/:slug/app/host/sessions/:sessionId/closing
```

설계 기본값은 별도 route다. 세션 편집기는 작성/수정 도구이고, closing board는 운영 판단 화면이기 때문이다. 구현 계획 조사에서 router 구조나 기존 UX 경계가 별도 route를 명확히 막는다고 확인될 때만 세션 편집기 안의 `클로징` 탭을 fallback으로 사용한다.

화면 구조:

```text
Header
  No.07 · 책 제목 · 모임일
  Overall state: 진행 중 / 차단됨 / 발행 준비 / 발행 완료

Primary Action
  지금 해야 할 하나의 행동

Closing Checklist
  세션 종료
  기록 패키지 저장
  피드백 문서 준비
  멤버 알림 발송
  공개 기록 노출
  공개 쇼케이스 확인

Three Surface Board
  Host: 운영 완료/차단 사유/관리 링크
  Member: 홈 회고 카드, 알림 deep link, 피드백 문서 상태
  Public: 공개 기록 목록/상세 노출, 공개 가능 여부

Evidence Ledger
  요약 발행 여부
  하이라이트 수
  한줄평 수
  피드백 문서 parser 상태
  최근 알림 이벤트 상태
  public/member href
```

Design direction:

- Host 화면은 generic SaaS dashboard가 아니라 효율적인 operating ledger로 보여야 한다.
- 첫 화면은 `다음 행동 + 체크리스트`가 우선이다.
- `Host / Member / Public` 상태는 병렬 board로 보여준다.
- Timeline은 필요하면 상세 drawer 또는 보조 section으로 둔다.
- Mobile에서는 primary action과 checklist가 먼저 나오고, 세 표면 board는 접힌 section으로 내려간다.

Copy 원칙:

- "모두 정상" 같은 추상 문구보다 "멤버 알림 대기 1건", "피드백 문서 없음"처럼 행동 가능한 상태를 보여준다.
- Raw JSON, raw email body, provider raw error, 내부 issue code를 보여주지 않는다.
- Public route 링크는 실제 공개 가능한 상태일 때만 primary하게 보여준다.
- Member route 링크는 host가 멤버 권한으로 확인하는 링크가 아니라, canonical member-facing href 상태 정보로 보여준다.

## 8. Member Notification and Reflection Loop

멤버 쪽 목표는 알림함 자체가 아니라, 호스트가 닫은 회차가 멤버에게 `지난 모임 회고` 루프로 자연스럽게 이어지는 것이다.

기본 흐름:

```text
Host closes/publishes session records
  -> notification event/outbox
  -> member notification inbox
  -> member reflection entry
  -> archive session detail or feedback document
  -> next reading action
```

Member-safe projection 후보:

```ts
type MemberSessionReflectionSignal = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  recordState: "AVAILABLE" | "MISSING";
  feedbackState: "AVAILABLE" | "LOCKED" | "MISSING";
  notificationState: "UNREAD" | "READ" | "NONE";
  primaryHref: string;
  feedbackHref?: string;
  nextReadingHref?: string;
};
```

Member UX:

- 알림함은 단일 event label보다 세션 회고 중심으로 보여준다.
- 알림 row에서 `기록 보기`, `피드백 보기` 목적지가 명확해야 한다.
- 읽음 처리와 이동은 기존 optimistic route 흐름을 유지한다.
- Deep link가 비정상 값이면 안전 fallback으로 이동한다.
- 멤버 홈의 `지난 모임 회고` 카드와 알림 상태를 연결하되, 알림함 방문을 강제하지 않는다.
- Archive/feedback route는 알림에서 들어온 return state를 보존한다.
- `LOCKED`, `MISSING`, `AVAILABLE` 상태를 과장 없이 구분한다.
- Viewer, suspended, 미참석 멤버의 권한은 완화하지 않는다.

Notification pipeline:

- 기존 notification outbox를 재사용한다.
- 새 Kafka worker나 이메일 템플릿 전면 개편은 기본 범위가 아니다.
- Deep link가 세션별 archive/feedback route로 충분히 정밀하지 않으면 notification 생성 시점의 `deepLinkPath`를 additive하게 개선한다.

## 9. Public Records Showcase

Public 쪽 목표는 내부 운영 상태를 밖으로 내보내는 것이 아니다. 발행된 결과물만 가지고 외부인이 "이 모임은 어떤 깊이로 읽고 대화하는가"를 신뢰할 수 있게 만드는 것이다.

대상 표면:

```text
/clubs/:slug/records
/clubs/:slug/sessions/:sessionId
/records
/sessions/:sessionId
```

Public projection 후보:

```ts
type PublicSessionShowcase = {
  sessionId: string;
  sessionNumber: number;
  book: {
    title: string;
    author: string;
    imageUrl?: string | null;
  };
  meetingDate: string;
  summary: string;
  recordStats: {
    highlightCount: number;
    oneLinerCount: number;
    questionCount?: number;
  };
  showcaseState: "READY" | "PARTIAL";
  themes?: string[];
  href: string;
};
```

`themes`는 새 AI 요약을 만들지 않는다. 기존 공개 summary나 기록에서 안전하게 계산 가능한 경우에만 둔다. 1차 구현에서는 theme 없이도 충분하다.

UX:

- Records index는 단순 목록이 아니라 최근 발행 기록 중심의 editorial archive로 보인다.
- 각 row/card에 무엇을 읽었고, 어떤 대화 흔적이 남았고, 기록이 얼마나 풍부한지 드러난다.
- 공개 기록이 적을 때도 과장된 마케팅 문구를 만들지 않는다.
- Public session detail은 공개 summary, 하이라이트, 한줄평의 위계를 더 분명히 한다.
- 멤버 전용 피드백 문서 같은 private surface는 링크로 열지 않는다.
- Host Closing Board의 `PUBLIC_SHOWCASE_READY`는 public API가 해당 세션을 공개 surface에서 볼 수 있는지 기준으로 판단한다.

Design direction:

- 공개 페이지는 refined literary journal 느낌을 유지한다.
- 운영 배지나 admin스러운 상태표시는 쓰지 않는다.
- 책 표지, 회차 identity, 기록 밀도, 문장 중심 위계를 강화한다.
- Mobile에서는 책 제목, summary, action이 겹치지 않아야 한다.

## 10. Error Handling

Server:

- `closing-status` 조회에서 세션이 없으면 `SESSION_NOT_FOUND`.
- 현재 클럽의 host가 아니면 `PERMISSION_DENIED`.
- 계산 일부가 실패해도 가능한 경우 card-local unavailable state로 격리한다.
- 알림 또는 공개 기록 일부 데이터를 못 읽는 경우 전체 500으로 blank 처리하지 않고 `UNKNOWN` 또는 `CHECK_REQUIRED`로 내려주는 설계를 우선한다.
- 응답에는 SQL detail, raw email, provider raw error, token, private member data를 넣지 않는다.

Frontend:

- Host board는 전체 실패, 부분 실패, action-required 상태를 구분한다.
- Member 알림 deep link는 비정상 path를 안전 fallback으로 보낸다.
- Public pages는 공개 가능한 기록이 없으면 정직한 empty state를 보여준다.
- UI에는 내부 code보다 사용자/운영자가 이해할 안전한 label/detail을 표시한다.

## 11. Data Flow

통합 happy path:

```text
Host closes a session
  -> host imports or generates record package
  -> commit stores public summary, highlights, one-liners, feedback document
  -> notification outbox records member-facing events
  -> sessionclosing read model computes host-safe closing status
  -> Host Closing Board shows next action/checklist/surface state
  -> Member notification and home reflection card point to archive/feedback
  -> Public records list/detail show only public record content
```

Partial path:

```text
Record package saved
  -> feedback document missing or invalid
  -> closing status = BLOCKED or IN_PROGRESS
  -> Host board points back to record completion flow
  -> Member/public projections avoid implying complete reflection/public readiness
```

## 12. Testing and Verification

Server checks:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server check
./server/gradlew -p server architectureTest
```

Frontend checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

Public release checks:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Targeted test plan:

- `SessionClosingStatusServiceTest`
- `JdbcSessionClosingStatusAdapterTest` or DB integration test
- host closing API controller/security test
- frontend closing status contract/model test
- Host Closing Board UI test
- member notification/reflection deep-link test
- public records showcase model/UI test
- Playwright E2E for host closing board -> member reflection -> public records link
- public-safe sentinel assertions for private email, admin route, raw JSON, token-shaped values

## 13. Documentation and Release Evidence

Expected docs/update surfaces:

- `CHANGELOG.md`
- `docs/development/architecture.md`
- 필요 시 `docs/development/release-readiness-review.md`
- API contract notes in the implementation plan

DB migration이 생기면 release-readiness에 migration scope, deployment order, smoke evidence를 명시한다. DB migration이 없어도 server API, host/member/public UX, public route behavior가 바뀌므로 release candidate checks는 필수다.

## 14. Implementation Boundaries

Frontend boundaries:

- `features/<name>/api` owns BFF contract calls.
- `features/<name>/queries` owns Query keys, queryOptions, mutation invalidation.
- `features/<name>/model` owns pure projection/view-model calculation.
- `features/<name>/route` owns loader/action behavior and UI prop assembly.
- `features/<name>/ui` remains props/callback driven and does not fetch directly.

Server boundaries:

- Controller parses HTTP and maps response.
- Application service owns authorization-sensitive orchestration and state derivation.
- Persistence adapter owns SQL and row mapping.
- Application code does not throw Spring web/http exceptions.
- Read model code does not weaken existing BFF/session/membership boundaries.

Public safety:

- No real member data, private domains, deployment identifiers, local paths, OCIDs, secrets, or token-shaped examples.
- Test-only sentinel strings must not render in production UI or public docs.

## 15. Implementation Plan Validation Points

The implementation plan should verify these defaults against current code before task breakdown:

- Host Closing Board ships as a separate route. Use the session editor tab fallback only if route composition evidence makes a separate route unsafe.
- Member reflection signal consumes a member-safe projection when available. Assemble from existing member home/notification data only if no status rule duplication is introduced.
- Public showcase starts from existing public API/display model if it can preserve host/member privacy and avoid duplicated closing rules. Add public contract fields only when the current projection cannot express record richness safely.
- Closing status persistence confidence should include a focused DB integration test unless the implementation stays entirely in service-level composition over already-tested ports.

The default preference is separate host route, host closing API first, and frontend projections that consume additive contracts rather than duplicating status rules.
