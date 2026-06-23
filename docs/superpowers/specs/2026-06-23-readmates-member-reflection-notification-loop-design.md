# ReadMates Member Reflection Notification Loop v2

작성일: 2026-06-23
상태: APPROVED DESIGN SPEC
대상 표면: front, member notifications, member home, archive session detail, feedback document route, targeted local release evidence

## 1. 배경

ReadMates는 최근 회차 종료 이후의 host-owned 흐름을 크게 정리했다.

- 호스트는 회차별 closing board에서 기록 패키지, 피드백 문서, 멤버 알림, 공개 기록 상태를 본다.
- 멤버 홈은 최근 발행 기록을 `지난 모임 회고` 카드로 보여 주고 `기록 보기`와 `피드백 보기` 진입을 제공한다.
- archive session detail과 feedback document route는 참석 여부, 문서 존재 여부, 권한에 따라 각자 상태를 렌더링한다.
- 멤버 알림함은 unsafe deep link를 fallback하고, session 성격 알림에는 회고 badge를 보여 준다.

남은 빈칸은 이 표면들이 하나의 재참여 루프로 이어지는 정도다. 알림에서 들어온 멤버가 기록, 피드백 문서, 다음 읽기 행동으로 자연스럽게 돌아오려면 deep link 정규화, return state, 피드백 상태 copy, archive/feedback back link가 같은 회차 맥락을 공유해야 한다.

## 2. 목표

성공 기준은 알림 카드 copy를 바꾸는 것이 아니다. 멤버가 알림을 열었을 때 지난 모임의 기록과 피드백을 이어 보고, 다시 멤버 홈이나 다음 세션 준비로 돌아갈 수 있어야 한다.

구체 목표:

- 알림 deep link를 app-safe 회고 진입으로 정규화한다.
- 알림에서 archive 또는 feedback route로 이동할 때 `지난 모임 회고` return state를 보존한다.
- 멤버 홈의 최근 회고 카드가 피드백 문서 상태를 가능한 범위에서 더 정직하게 보여 준다.
- feedback missing/forbidden 화면과 archive session detail이 같은 회고 문맥으로 돌아갈 수 있게 한다.
- 기존 피드백 문서 권한, 멤버 권한, public/private data 경계를 약화하지 않는다.
- 서버/DB 변경은 기본적으로 피하고, 정말 필요한 경우에만 read-only additive 보강으로 제한한다.

## 3. 현재 부족한 플로우

현재 코드 기준으로 보강할 지점은 네 가지다.

1. **알림 deep link 문맥이 얕다.** `getMemberNotificationLinkView()`는 unsafe URL을 막고 일부 session link를 app route로 바꾸지만, archive/feedback 진입 시 route state를 함께 만들지 않는다. 따라서 feedback document에서 돌아갈 때 "알림에서 온 지난 모임 회고" 맥락이 약하다.
2. **legacy/current deep link 형태가 섞여 있다.** 서버 알림 copy는 club-scoped app path를 만들 수 있고, 프론트 모델은 legacy `/sessions/:id`, `/feedback-documents`, `/notes`도 처리한다. 이 매핑을 한 곳에서 정리해야 알림 종류별 진입 경험이 안정적이다.
3. **멤버 홈 피드백 상태가 보수적이다.** `getMemberHomeRecentRecordEntry()`는 최근 note feed를 회고 entry로 묶지만 `feedbackState`를 `UNKNOWN`으로 둔다. 피드백이 실제로 열리는지, 없는지, 잠긴 건지 홈에서 구분하지 못한다.
4. **회고 이후 다음 행동 연결이 약하다.** 기록 보기와 피드백 보기 이후 다음 세션 준비로 돌아가는 흐름이 흩어져 있다. 회고 route state와 copy가 이 연결을 보강해야 한다.

## 4. Non-goals

- 답글, 좋아요, 반응, 북마크 같은 소셜 기능.
- 새 notification event type.
- admin replay, support grant, platform-admin recovery 기능을 멤버 또는 호스트로 이전.
- 피드백 문서 권한 모델 변경.
- DB migration.
- public SEO, RSS, SSR, 외부 공유 기능.
- production deploy, release tag push, provider-console smoke.

## 5. 선택한 접근

선택한 접근은 **최소 read 보강이 가능한 frontend-first 회고 루프 정리**다.

검토한 대안:

1. **프론트 route-state만으로 닫기**
   - 장점: 가장 작고 서버 변경이 없다.
   - 단점: 멤버 홈의 `feedbackState`가 계속 `UNKNOWN`이라 홈 카드가 실제 열람 가능성을 정직하게 말하기 어렵다.

2. **member home loader에 최소 read 보강** - 추천
   - 장점: 최근 회고 session 하나에 대해 feedback availability를 더 정확히 보여 줄 수 있다. 기존 note feed, feedback route, archive route를 재사용하므로 새 제품 surface가 아니다.
   - 단점: 구현 조사에서 기존 응답만으로 충분하지 않으면 read-only additive field 또는 targeted loader fetch가 필요하다.

3. **새 회고 summary API 추가**
   - 장점: 회고 카드가 필요한 데이터를 한 번에 받을 수 있다.
   - 단점: 지금은 과하다. 기존 member home, archive, feedback read path가 이미 가까운 데이터를 갖고 있고, 새 API는 slice와 테스트 범위를 불필요하게 키운다.

기본 구현은 2번을 따른다. 단, plan 단계에서 기존 응답과 loader 조합만으로 feedback 상태 보강이 불가능하거나 비용이 과하면 `UNKNOWN` fallback을 유지하고 route-state 정리만 먼저 닫는다.

## 6. Frontend Architecture

프런트엔드는 기존 route-first 경계를 유지한다.

```text
src/app -> src/pages -> features -> shared
```

역할:

- `notifications/model`: deep link normalization과 회고 return target 파생의 SSOT.
- `notifications/route`: 읽음 처리 후 `navigate(href, { state })`로 회고 return state 전달.
- `notifications/ui`: normalized action, 회고 badge, pending/read 상태만 렌더링.
- `member-home/model`: 최근 note feed와 feedback availability input으로 `MemberHomeRecentRecordEntry`를 계산.
- `member-home/route`: 필요한 경우 최근 회고 session 1개에 대한 feedback availability를 보강.
- `member-home/ui`: feedback state별 action/copy를 props 기반으로 렌더링.
- `archive/ui`와 `feedback/route`: 기존 return state contract를 재사용해 `지난 모임 회고` context를 유지.

`notifications`가 archive나 feedback UI를 직접 import하지 않는다. 공유가 필요한 구조는 작은 model type이나 기존 `readmatesReturnState` shape 수준으로 둔다. UI 컴포넌트는 fetch, route param, query client를 직접 소유하지 않는다.

## 7. Notification Link Model

`front/features/notifications/model/notification-link-model.ts`를 회고 진입 정규화 지점으로 둔다.

입력:

```text
eventType: NotificationEventType
deepLinkPath: string
```

출력:

```text
href: string
primaryActionLabel: "Open" | "View record" | "View feedback" | "Next reading"
reflectionLabel: "Past session reflection" | null
returnTarget?: {
  href: string
  label: string
  state?: ReadmatesReturnState
}
```

정규화 규칙:

- Unsafe URL: absolute external URL, protocol-relative URL, control-character-like invalid input, non-app route는 `/app/notifications`로 fallback.
- Current app route: `/app/...`와 `/clubs/:slug/app/...`는 app-safe route로 유지한다.
- Legacy session route: `/sessions/:sessionId`는 `/app/sessions/:sessionId`로 정규화하고 `Past session reflection` badge와 return target을 붙인다.
- Feedback document route: `/app/feedback/:sessionId`, `/clubs/:slug/app/feedback/:sessionId`, legacy `/feedback-documents`를 안전하게 처리한다. session id가 있으면 해당 feedback route로, 없으면 report archive로 보낸다.
- Notes route: `/notes?sessionId=...` 또는 app-scoped notes route는 다음 읽기/기록 확인 성격으로 유지하되 외부 URL은 허용하지 않는다.

`FEEDBACK_DOCUMENT_PUBLISHED`와 session record 성격의 알림은 `지난 모임 회고` return state를 만든다. `NEXT_BOOK_PUBLISHED`와 `SESSION_REMINDER_DUE`는 다음 읽기 준비 흐름으로 남긴다.

## 8. Member Home Reflection Card

`getMemberHomeRecentRecordEntry()`는 최근 note feed에서 회고 대상 session을 계산한다.

유지할 동작:

- 첫 note feed item의 session을 최근 회고 session으로 본다.
- 같은 session의 `QUESTION`, `ONE_LINE_REVIEW`, `HIGHLIGHT` label을 dedupe한다.
- session detail href와 feedback href는 canonical app route로 만든다.
- note feed가 비어 있으면 `null`을 반환한다.

보강할 동작:

- 모델 입력에 optional feedback availability map 또는 recent feedback status를 받는다.
- `AVAILABLE`: `피드백 보기` action을 보여 준다.
- `MISSING`: action 대신 아직 문서가 없다는 상태 copy를 보여 준다.
- `LOCKED`: action 대신 열람 권한이 없다는 상태 copy를 보여 준다.
- `UNKNOWN`: action을 유지할 수 있지만 copy는 "열람 화면에서 확인"처럼 보수적으로 둔다.

피드백 상태 보강은 최근 회고 session 하나에 한정한다. 여러 session에 대해 추가 fetch를 늘리거나 새 dashboard처럼 만들지 않는다.

## 9. Archive And Feedback Continuity

Archive session detail과 feedback document route는 기존 권한 판정을 유지한다.

- 알림 또는 멤버 홈에서 들어오면 `readmatesReturnState({ href: "/app", label: "지난 모임 회고" })` 또는 현재 route에 맞는 동등한 target을 전달한다.
- Archive session detail의 feedback card는 feedback route로 넘어갈 때 nested return state를 유지한다.
- Feedback ready 화면은 기존 문서 렌더링을 유지하고, back link label만 회고 문맥에 맞게 나온다.
- Feedback unavailable 화면은 missing과 forbidden을 계속 분리한다.
- Missing copy는 문서가 아직 없다는 사실만 말한다.
- Forbidden copy는 정식 멤버/참석자 열람 경계를 약화하지 않는다.

Route continuity는 navigation convenience다. 권한이나 데이터 노출 판단은 기존 loader/API response가 계속 결정한다.

## 10. Error Handling And Safety

원칙:

- Unsafe deep link는 항상 notification inbox fallback으로 보낸다.
- 알림 읽음 처리 실패 시 기존 action error를 유지하고 navigate하지 않는다.
- Feedback availability 보강 fetch가 실패하면 회고 카드 전체를 blank 처리하지 않고 `UNKNOWN` fallback을 사용한다.
- 피드백 문서 403/404는 feature-owned unavailable state로 렌더링한다.
- Raw JSON, internal field name, stack trace, raw email, member email, provider raw error, token-shaped value, private deployment detail은 UI, docs, fixture 어디에도 노출하지 않는다.

## 11. Testing

단위 테스트:

- `notification-link-model.test.ts`
  - club-scoped app feedback/session link를 보존한다.
  - legacy `/sessions/:id`를 app session route로 정규화한다.
  - feedback event에 회고 return target을 만든다.
  - unsafe absolute/protocol-relative URL은 fallback한다.
- `member-home-view-model.test.ts`
  - recent record entry가 feedback `AVAILABLE`, `MISSING`, `LOCKED`, `UNKNOWN` copy/action을 계산한다.
  - 같은 session의 기록 종류를 dedupe한다.
  - 빈 feed는 `null`을 반환한다.
- route continuity model tests, 필요한 경우:
  - nested return state가 safe app href만 허용한다.

UI 테스트:

- 알림함은 회고 badge, action label, unread/read pending 상태를 유지한다.
- 멤버 홈 desktop/mobile 회고 카드가 상태별 action/copy를 렌더링한다.
- Feedback unavailable page는 `지난 모임 회고` return link를 유지한다.

Targeted E2E:

- 기존 host-session-record 또는 notification 관련 spec에 다음 경로를 추가한다.

```text
host publishes/imports record package
  -> member sees notification or member home reflection entry
  -> member opens record
  -> member opens feedback when available or sees honest unavailable state
  -> back link returns to reflection context
```

검증 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Loader/API 보강이 서버 production code를 건드리면 다음을 추가한다.

```bash
./server/gradlew -p server clean test
pnpm --dir front test:e2e -- tests/e2e/<targeted-spec>.spec.ts
```

## 12. Release Notes And Evidence

사용자에게 보이는 멤버 UX 변경이므로 `CHANGELOG.md` `## Unreleased`에 짧게 기록한다.

Release note는 다음을 명시한다.

- 멤버 알림과 지난 모임 회고 진입의 route continuity를 보강했다.
- 피드백 문서 상태 copy가 더 정직해졌다.
- 권한 모델, auth/BFF token, OAuth scope, notification event type, DB migration은 변경하지 않는다.
- 서버 read-only additive field가 들어간 경우 contract가 additive임을 명시한다.

Public-safe evidence만 남긴다. Screenshot/test-results artifact는 repo에 추적하지 않는다.

## 13. Plan 단계에서 확인할 질문

- 기존 member home note feed 또는 archive/feedback 계약만으로 최근 회고 session의 feedback availability를 알 수 있는가?
- 알림 deep link 정규화가 club-scoped route와 unscoped compatibility route 양쪽에서 같은 결과를 내는가?
- `navigate(href, { state })`로 읽음 처리 후 이동할 때 기존 click/keyboard behavior가 유지되는가?
- Targeted E2E는 기존 `host-session-record-preview.spec.ts`, `admin-notifications.spec.ts`, 또는 별도 member notification spec 중 어디에 붙이는 것이 가장 작고 안정적인가?

## 14. Self-review Notes

- Placeholder scan: no open placeholder markers are used.
- Internal consistency: frontend-first scope and optional read-only server fallback are separated.
- Scope check: one member reflection loop slice; no social feature, new event type, admin operation, or DB migration.
- Ambiguity check: feedback states and unsafe deep link fallback are explicit.
