# ReadMates Member Record Reflection Loop v2

작성일: 2026-06-18
상태: APPROVED DESIGN SPEC
대상 표면: front, member home, archive, feedback document, route continuity, local release evidence

## 1. 배경

ReadMates는 최근 호스트가 세션 기록 패키지를 저장한 뒤 멤버 홈에서 최근 발행 기록으로 이어지는 흐름을 닫았다.

- 호스트 세션 편집기는 외부 JSON 가져오기 preview와 commit 결과 장부를 제공한다.
- commit 경로는 공개 요약, 하이라이트, 한줄평, 피드백 문서를 하나의 패키지로 교체한다.
- 멤버 홈은 최근 발행 기록 entry를 보여 주고 `기록 보기`와 `피드백 보기` 진입을 제공한다.
- Archive와 feedback document route는 기존 권한, 참석 여부, 문서 존재 여부에 따라 각자 상태를 렌더링한다.

남은 빈칸은 멤버 관점의 회고 루프다. 지금의 최근 기록 entry는 "저장된 기록이 있다"는 사실은 알려 주지만, 지난 모임을 어떻게 이어 읽으면 되는지, 피드백 문서가 왜 열리지 않는지, 세션 상세에서 멤버 홈으로 돌아왔을 때 어떤 맥락을 복원해야 하는지는 아직 얇다.

이 설계는 서버/API를 새로 만들기보다 기존 member home, archive, feedback 응답과 route state를 사용해 멤버 전용 회고 루프를 선명하게 만든다.

## 2. 목표

성공 기준은 홈 카드 copy를 바꾸는 것이 아니다. 멤버가 최근 발행 기록을 보고 지난 모임의 기록, 피드백 문서, 다음 읽기 행동으로 자연스럽게 이어 갈 수 있어야 한다.

구체 목표:

- 멤버 홈의 최근 발행 기록을 더 명확한 `지난 모임 회고` 카드로 정리한다.
- 카드가 같은 세션의 질문, 한줄평, 하이라이트를 하나의 회고 entry로 묶어 보여준다.
- 피드백 문서 진입은 열람 가능, 잠김, 없음 상태를 과장 없이 구분한다.
- 세션 상세와 피드백 문서 route에서 멤버 홈으로 돌아오는 맥락을 유지한다.
- viewer, suspended, 참석하지 않은 멤버의 권한 경계를 약화하지 않는다.
- 서버 production code, DB migration, BFF/auth, public API contract 변경 없이 먼저 구현한다.
- host import to member home E2E가 새 회고 카드의 public-safe 상태까지 검증한다.

## 3. Non-goals

- 새 server endpoint 또는 DB migration.
- 피드백 문서 permission model 변경.
- public records SEO, RSS, SSR, 외부 공유 기능.
- admin 운영 콘솔 변경.
- notification outbox, email dispatch, Kafka worker 변경.
- AI provider, prompt, model catalog, cost policy 변경.
- PDF download 또는 print layout 확장.
- CI visual regression infrastructure 도입.
- production OAuth, VM, provider-console, tag/deploy smoke.

## 4. 선택한 접근

선택한 접근은 **기존 member read models 위에 회고 entry와 상태 표현을 얹는 frontend-first slice**다.

검토한 대안:

1. **최근 기록 카드 copy만 개선**
   - 장점: 가장 작다.
   - 단점: 피드백 문서 상태와 route continuity 문제가 그대로 남는다.

2. **새 member record summary API 추가**
   - 장점: UI가 필요한 데이터를 한 번에 받을 수 있다.
   - 단점: 지금은 기존 `noteFeedItems`, archive, feedback route state로 충분히 시작할 수 있어 API 변경이 과하다.

3. **기존 응답으로 회고 entry를 계산하고 route 상태를 정리**
   - 장점: 최근 host-to-member loop와 자연스럽게 이어지고, release risk가 낮으며, 프런트 route-first 경계를 유지한다.
   - 단점: 구현 중 기존 응답만으로 피드백 문서 존재 여부를 충분히 알 수 없는 경우 UI 상태가 보수적으로 표현되어야 한다.

이번 작업은 3번을 선택한다. 구현 중 서버 데이터가 정말 부족하다고 확인되면 additive server field를 별도 설계 변경으로 다룬다.

## 5. 설계 범위

주요 변경 후보:

- `front/features/member-home/model/member-home-view-model.ts`
- `front/features/member-home/model/member-home-view-model.test.ts`
- `front/features/member-home/ui/member-home-records.tsx`
- `front/features/member-home/ui/member-home-current-session.test.tsx` 또는 인접 UI 테스트
- `front/features/archive/route/*`
- `front/features/archive/ui/member-session-detail-page.tsx`
- `front/features/feedback/route/*`
- `front/features/feedback/ui/feedback-document-page.tsx`
- `front/tests/e2e/host-session-record-preview.spec.ts`
- `CHANGELOG.md`

기본 구현은 프런트엔드만 touched surface로 둔다. Archive/feedback route에서 서버 응답 shape를 바꾸지 않고 state/copy만 조정한다.

## 6. Frontend Architecture

프런트엔드는 route-first 경계를 유지한다.

```text
src/app -> src/pages -> features -> shared
```

역할:

- `member-home/model`: 최근 기록 entry와 피드백 진입 상태를 순수 함수로 계산한다.
- `member-home/ui`: desktop/mobile 회고 카드를 props 기반으로 렌더링한다.
- `archive/route`: route loader 결과와 return state를 조립한다.
- `archive/ui`: 세션 상세의 회고/피드백 진입 copy를 렌더링한다.
- `feedback/route`: 기존 document state와 return state를 보존한다.
- `feedback/ui`: 없음, 잠김, 접근 불가, 서버 오류 copy를 기존 boundary 안에서 명확히 보여준다.

`member-home`이 `archive`나 `feedback` UI를 직접 import하지 않는다. 공유가 필요한 값은 href string이나 작은 model type 수준으로 유지한다. UI 컴포넌트는 fetch, query client, route param을 직접 소유하지 않는다.

## 7. Member Home UX

최근 발행 기록 entry를 `지난 모임 회고` 카드로 정리한다.

Desktop 카드:

- eyebrow: `지난 모임 회고`
- title: `No.{sessionNumber} · {bookTitle}`
- summary: 보존된 기록을 이어 읽을 수 있다는 짧은 문장
- meta: 질문, 한줄평, 하이라이트 등 같은 세션에서 확인된 기록 종류
- primary action: `기록 보기`
- secondary action or status: 피드백 문서 상태에 따라 `피드백 보기` 또는 작은 상태 문구

Mobile 카드:

- desktop과 같은 정보를 유지하되 행 밀도를 낮춘다.
- 긴 책 제목과 한글/영문 혼합 문자열은 wrap으로 처리한다.
- 버튼 text는 짧게 유지한다.

빈 상태:

- 최근 기록이 없으면 기존 빈 상태를 유지한다.
- 가짜 활동감이나 공개되지 않은 기록 암시는 만들지 않는다.

## 8. Feedback State

피드백 문서 상태는 보수적으로 표현한다.

상태:

- `AVAILABLE`: 피드백 문서 진입을 보여 준다.
- `LOCKED`: 멤버 권한 또는 참석 여부 때문에 열 수 없음을 짧게 보여 준다.
- `MISSING`: 아직 피드백 문서가 없다고 표현한다.
- `UNKNOWN`: member home 데이터만으로 확정할 수 없으면 링크를 유지하되, 실제 route state가 최종 판단하게 한다.

서버/API 변경이 없는 1차 구현에서는 `UNKNOWN`을 허용한다. 단, UI는 raw error code나 내부 field name을 노출하지 않는다. Feedback route에서 받은 403, 404, unavailable state는 기존처럼 feature-owned 상태로 렌더링한다.

## 9. Archive and Feedback Route Continuity

멤버 홈에서 기록 또는 피드백으로 이동할 때 return state를 유지한다.

- 기록 상세 진입: `지난 모임 회고`에서 왔다는 label을 route state에 담는다.
- 피드백 문서 진입: 문서가 없거나 잠긴 경우에도 멤버 홈으로 돌아갈 수 있는 copy를 유지한다.
- 세션 상세에서 archive, feedback, notes로 이어지는 링크는 기존 canonical club path를 유지한다.

Route continuity는 navigation convenience일 뿐 authorization이 아니다. 실제 접근 가능 여부는 기존 route loader와 API response가 결정한다.

## 10. Error Handling and Permissions

권한/오류 원칙:

- `VIEWER`나 쓰기 불가 멤버는 기록 읽기 중심으로 노출한다.
- 참석하지 않은 멤버가 피드백 문서에 접근하면 기존 feedback route state가 차단한다.
- 피드백 문서가 없는 경우 원인을 추정하지 않고 "아직 피드백 문서가 없습니다" 수준으로 말한다.
- 서버 오류, 403, 404는 기존 `feedback`/`archive` route boundary를 재사용한다.
- private member email, raw JSON, admin-only route, provider error, internal code, token-shaped value는 UI에 노출하지 않는다.

## 11. Data Flow

기본 흐름:

```text
Host session import commit
  -> publication/archive/feedback data is refreshed
  -> member home receives noteFeedItems
  -> member-home model groups the first session's records
  -> member home renders reflection card
  -> member opens session detail or feedback document
  -> route state preserves return context
```

`getMemberHomeRecentRecordEntry()`는 같은 세션의 note feed item을 묶어 entry를 만든다. 구현 시에는 다음 확장을 고려한다.

- `kindLabels`: 같은 세션의 질문/한줄평/하이라이트 dedupe.
- `sessionHref`: canonical member session detail path.
- `feedbackHref`: canonical feedback document path.
- `feedbackState`: 1차 구현에서 확정 불가하면 `UNKNOWN`.
- `summary`: UI copy와 테스트가 안정적으로 의존할 수 있는 짧은 문장.

## 12. Testing

테스트는 좁게 시작한다.

Frontend unit/model:

- `member-home-view-model.test.ts`
  - 같은 세션의 기록 종류를 dedupe한다.
  - 첫 note feed item의 세션을 기준으로 entry를 만든다.
  - 기록/피드백 href가 stable하게 생성된다.
  - 빈 feed는 `null`을 반환한다.

Frontend UI:

- desktop/mobile 회고 카드가 같은 핵심 정보와 action/status를 렌더링한다.
- 긴 책 제목이나 여러 kind label이 layout text를 깨지 않도록 wrap 가능한 구조를 유지한다.
- 피드백 상태별로 action 또는 상태 문구가 일관되게 나온다.

E2E:

- 기존 `host-session-record-preview.spec.ts`의 host import -> commit -> member home 경로에 `지난 모임 회고` 확인을 추가한다.
- public-safe sentinel이 화면에 렌더링되지 않음을 유지한다.
- screenshot/test-results artifact는 repo에 추적하지 않는다.

검증 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
```

변경 범위가 archive/feedback route state까지 넓어지면 전체 E2E 실행을 검토한다.

## 13. Release and Documentation

사용자에게 보이는 멤버 UX 변경이므로 `CHANGELOG.md` `## Unreleased`에 짧게 기록한다.

서버/API/DB/auth/deploy 변경이 없다는 점을 release note에 명시한다. Public release candidate scanner와 충돌하는 screenshot, raw fixture, local path, private data artifact를 추가하지 않는다.

## 14. 승인 기준

구현 완료 기준:

- 멤버 홈에서 최근 발행 기록이 `지난 모임 회고`로 더 명확하게 보인다.
- 기록 보기와 피드백 보기/상태 문구가 권한을 과장하지 않는다.
- Archive/feedback 진입과 return state가 끊기지 않는다.
- 모델/UI/E2E 테스트가 새 흐름을 고정한다.
- 관련 frontend checks가 통과한다.
- CHANGELOG가 사용자-visible 변경을 기록한다.

## 15. Self-review

- Placeholder scan: TBD/TODO placeholder 없음.
- Internal consistency: 서버/API 변경 없음 전제와 frontend-first 설계가 일치한다.
- Scope check: 단일 frontend UX slice로 구현 가능하며, additive server field는 별도 승인 조건으로 분리했다.
- Ambiguity check: 피드백 상태를 `AVAILABLE`, `LOCKED`, `MISSING`, `UNKNOWN`으로 명시해 기존 데이터만으로 확정 불가한 경우를 보수적으로 처리한다.
