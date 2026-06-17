# ReadMates Host Session Record Evidence Gate

작성일: 2026-06-18
상태: APPROVED DESIGN SPEC
대상 표면: front, host UX, session import, local release evidence

## 1. 배경

ReadMates 호스트는 모임 후 `세션 기록 완성` 패널에서 세션 공개 요약, 하이라이트, 한줄평, 피드백 문서를 하나의 세션 기록 패키지로 저장한다.

현재 구조는 이미 중요한 경계를 갖고 있다.

- 호스트 편집기는 `AI로 생성`과 `외부 JSON 가져오기`를 같은 패널에서 제공한다.
- 외부 JSON은 `readmates-session-import:v1` 형식을 사용하고, 서버 preview/commit API가 다시 검증한다.
- commit 경로는 `SessionImportService.commitValidated(...)`로 모이며, 저장 후 공개 요약, 하이라이트, 한줄평, 피드백 문서를 함께 교체한다.
- 피드백 문서는 active 정식 멤버와 호스트에게만 열리고, viewer는 읽을 수 없다.
- 최근 작업으로 `docs/development/session-import-generator.md`가 생겨 외부 JSON 생성 절차가 문서화되었다.
- release 후보 스크립트는 screenshot 계열 산출물과 private/tooling state를 공개 후보에서 제외하거나 거부한다.

남은 문제는 제품 경험과 release evidence 사이의 간극이다.

- JSON preview UI가 회차, 책, summary, count, issue 정도만 보여 주어 호스트가 저장 전 위험을 빠르게 판단하기 어렵다.
- `authorMatched`, `feedbackDocument.valid`, `issues` 같은 preview contract가 충분히 활용되지 않는다.
- host editor의 JSON import 화면에는 desktop/mobile visual evidence가 부족하다.
- public release candidate 검증은 존재하지만, 이번 UX가 그 검증과 충돌하지 않는다는 증거를 명시적으로 남겨야 한다.

이 설계는 호스트 세션 기록 완성 UX를 개선하고, 그 흐름이 로컬 release gate에서 깨지지 않도록 증거를 고정한다.

## 2. 목표

성공 기준은 "JSON 업로드 폼을 보기 좋게 만든다"가 아니다. 호스트가 저장 전 다음 질문에 답할 수 있어야 한다.

- 이 JSON이 현재 회차와 맞는가?
- 작성자 이름이 현재 세션 참석자와 맞는가?
- 저장하면 어떤 기록이 교체되는가?
- 피드백 문서는 parser를 통과했는가?
- 왜 지금 저장할 수 없고, 어디를 고쳐야 하는가?
- 이 화면이 desktop/mobile에서 public-safe하게 렌더링된다는 증거가 있는가?

구체 목표:

- `세션 기록 완성` 패널의 외부 JSON preview를 저장 전 검토 화면으로 확장한다.
- 서버 preview contract를 우선 재사용하고, 필요한 경우 additive field만 추가한다.
- UI 컴포넌트는 props/callback 기반으로 유지하고 fetch/query를 직접 소유하지 않는다.
- host editor JSON preview의 desktop/mobile Playwright screenshot evidence를 추가한다.
- public-safe sentinel, raw JSON body, token-shaped 값이 화면에 렌더링되지 않음을 E2E로 확인한다.
- 변경 완료 전 frontend checks와 public release candidate checks를 통과시킨다.

## 3. Non-goals

- CI visual gate 연결 또는 GitHub Actions workflow 변경.
- 운영 배포, release tag push, production OAuth, VM, provider-console smoke.
- 새 LLM provider 동작 변경, model catalog 변경, provider key/secret 변경.
- DB migration.
- session import JSON schema의 breaking change.
- 피드백 문서 PDF download 기능 활성화.
- admin 운영 콘솔 변경.

## 4. 선택한 접근

선택한 접근은 **호스트 UX 개선 + 로컬 release evidence gate**다.

검토한 대안:

1. **UX만 개선**
   - 장점: 작고 빠르다.
   - 단점: release 후보와 screenshot/public-safety evidence가 따로 남아 향후 회귀를 놓칠 수 있다.

2. **UX 개선 + 로컬 release evidence**
   - 장점: 제품 흐름과 검증 증거를 같은 작업으로 닫는다.
   - 단점: E2E fixture와 release-candidate check까지 포함되어 단순 UI 변경보다 넓다.

3. **UX 개선 + CI visual gate**
   - 장점: baseline drift를 자동으로 더 잘 잡는다.
   - 단점: Docker/runner flake 정책과 workflow 유지보수가 필요해 이번 제품 고도화 범위를 과하게 키운다.

이번 작업은 2번을 선택한다. CI visual gate는 별도 인프라 작업으로 남기고, 이번 spec은 로컬에서 재현 가능한 release evidence를 만든다.

## 5. 설계 범위

주요 변경 후보:

- `front/features/host/model/session-import-model.ts`
- `front/features/host/model/session-import-model.test.ts`
- `front/features/host/ui/session-editor/session-import-panel.tsx`
- `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- `front/features/host/ui/session-editor/*test*.tsx` 또는 인접 host editor 테스트
- `front/tests/e2e/host-session-record-preview.spec.ts`
- 필요 시 `front/tests/e2e/aigen-test-fixtures.ts`
- 필요 시 `server/src/main/kotlin/com/readmates/sessionimport/...`
- 필요 시 `server/src/test/kotlin/com/readmates/sessionimport/...`
- `CHANGELOG.md`
- 필요 시 `docs/development/session-import-generator.md` 또는 `docs/development/test-guide.md`

서버 contract 추가가 필요하지 않으면 서버 production code는 건드리지 않는다. 서버를 건드리는 경우에도 기존 preview/commit API의 backward compatibility를 유지한다.

## 6. Frontend Architecture

프런트엔드 의존 방향은 기존 route-first 경계를 유지한다.

```text
src/app -> src/pages -> features -> shared
```

`session-import-model.ts`는 순수 계산만 담당한다.

추가할 수 있는 모델 함수:

- `buildSessionImportReview(preview, recordVisibility)`
- `summarizeAuthorMatches(preview)`
- `sessionImportCommitBlockedReason(preview, recordVisibility)`
- `sessionImportReplacementSummary(preview)`

이 함수들은 React, router, fetch, query client를 import하지 않는다.

`SessionImportPanelBody`는 presentation component로 남는다.

- props로 `preview`, `status`, `error`, `recordVisibility`, callback만 받는다.
- API 호출, query invalidation, route param 해석을 직접 하지 않는다.
- preview model을 렌더링한다.

`SessionRecordCompletionPanel`은 현재처럼 AI tab과 JSON import body를 mutually exclusive하게 렌더링한다. default AI mode, `?records=json`, `?aigen=1` URL contract는 유지한다.

## 7. UI 설계

외부 JSON preview 화면은 작은 검토 장부처럼 구성한다. 호스트 화면은 generic SaaS dashboard가 아니라 효율적인 운영 ledger여야 한다.

구성:

- Import status header
  - `저장 가능` 또는 `확인 필요`
  - 회차 번호, 책 제목, 모임 날짜
- Replacement summary
  - 공개 요약 교체
  - 하이라이트 N개
  - 한줄평 N개
  - 피드백 문서 제목 또는 파일명
- Author matching
  - matched count와 unmatched count
  - 불일치 작성자 이름은 작은 목록으로 표시
  - match가 모두 성공하면 "작성자 매칭 완료" 수준으로 짧게 표시
- Feedback document status
  - title/fileName
  - parser 통과 여부
  - invalid이면 issue 목록과 함께 저장 차단
- Blocking issues
  - 서버 `issues`를 code보다 message 중심으로 보여준다.
  - issue가 여러 개면 가장 먼저 고칠 항목을 위에 둔다.
- Commit action
  - `valid=true`이고 issue가 없을 때만 활성화한다.
  - `HOST_ONLY` visibility에서 commit이 막히는 경우에는 공개 범위 변경이 필요하다고 안내한다.

Copy 원칙:

- UI 사용법을 길게 설명하지 않는다.
- "저장하면 이 회차의 요약, 하이라이트, 한줄평, 피드백 문서를 교체합니다"라는 replacement warning은 유지하되, preview가 뜬 뒤에는 실제 교체 항목 요약을 보여준다.
- 서버 내부 field name, raw JSON, stack trace, provider error를 노출하지 않는다.
- 한국어/영어 이름이 길어도 `overflow-wrap`이나 기존 layout constraint로 깨지지 않게 한다.

## 8. Data Flow

현재 흐름을 유지한다.

```text
JSON file
  -> frontend parser
  -> SessionImportRequest with recordVisibility
  -> POST /api/host/sessions/{sessionId}/session-import/preview
  -> server validation
  -> SessionImportPreviewResponse
  -> frontend review model
  -> host commit
  -> POST /api/host/sessions/{sessionId}/session-import/commit
  -> query invalidation and editor refresh
```

Preview 응답의 기존 필드를 우선 사용한다.

- `valid`
- `session.sessionNumber`
- `session.bookTitle`
- `session.meetingDate`
- `publication.summary`
- `highlights[].authorMatched`
- `oneLineReviews[].authorMatched`
- `feedbackDocument.fileName`
- `feedbackDocument.title`
- `feedbackDocument.valid`
- `issues[]`

필요한 경우에만 additive field를 검토한다. 예를 들어 참석자 전체 대비 누락된 author를 서버가 더 정확히 계산해야 한다면 `authorSummary` 같은 optional field를 추가할 수 있다. 기존 클라이언트가 무시 가능한 필드여야 한다.

## 9. Error Handling

오류는 세 층으로 나눈다.

### 9.1 File 단계

브라우저 parser가 즉시 처리한다.

- JSON 파싱 실패
- `format !== "readmates-session-import:v1"`
- 필수 section 누락
- 필수 문자열/숫자 누락
- 빈 문자열

이 경우 서버 preview를 호출하지 않고 파일 오류를 보여준다.

### 9.2 Preview 단계

서버가 source of truth다.

- 회차 번호 불일치
- 책 제목 불일치
- 날짜 불일치
- `HOST_ONLY` 공개 범위
- 작성자 매칭 실패
- feedback document parser 실패
- 보안/형식 issue

`valid=false` 또는 `issues.length > 0`이면 commit action은 비활성화한다.

### 9.3 Commit 단계

서버는 저장 직전 같은 검증을 다시 수행한다. Preview 이후 세션 상태, 참석자, 공개 범위가 바뀌었으면 일부 저장을 하지 않는다.

Commit 실패 UI는 기존 flash/error 패턴을 유지한다.

- 권한 문제는 권한/세션 상태를 확인하라고 안내한다.
- 재검증 실패는 preview를 다시 실행하라고 안내한다.
- 네트워크/서버 오류는 파일과 권한을 확인하라는 기존 copy를 더 구체화할 수 있다.

## 10. Public Safety

테스트 fixture와 docs는 public-safe 값만 사용한다.

허용 예:

- `host@example.com`
- `E2E 호스트`
- `E2E 책`
- `E2E 세션`
- alias 참석자 이름

금지:

- 실제 멤버 실명/이메일
- private domain
- local absolute path
- raw transcript
- provider token/API key
- token-shaped example
- private feedback document body
- raw JSON body를 화면에 그대로 렌더링하는 debug UI

E2E는 public-safe sentinel 검사를 포함한다. 예를 들어 `PRIVATE_MEMBER_EMAIL`, `ADMIN_ROUTE`, token-shaped 문자열, raw JSON sentinel이 렌더링되지 않는지 확인한다.

## 11. Release Evidence

이번 작업의 release evidence는 로컬에서 재현 가능해야 한다.

필수 evidence:

- Host editor JSON preview unit/UI tests.
- Host editor JSON preview E2E.
- Desktop screenshot artifact.
- Mobile screenshot artifact.
- Screenshot byte size assertion.
- 핵심 텍스트 visibility assertion.
- Public-safe sentinel non-render assertion.
- Public release candidate build/check 통과.

Screenshot artifact는 Playwright `testInfo.outputPath(...)` 아래에만 남긴다. Repo에 커밋하지 않고, public release candidate에도 포함하지 않는다.

`scripts/build-public-release-candidate.sh`와 `scripts/public-release-check.sh`가 screenshot 계열 path를 계속 제외/거부하는 정책과 충돌하지 않아야 한다.

## 12. 테스트 계획

### 12.1 Frontend unit/model

명령:

```bash
pnpm --dir front test -- session-import-model
```

검증:

- valid preview를 review model로 변환한다.
- unmatched author를 count와 list로 계산한다.
- `feedbackDocument.valid=false`를 commit-blocking 상태로 계산한다.
- `valid=false` 또는 `issues.length > 0`이면 commit 불가다.
- file parser 오류 copy가 안정적이다.

### 12.2 Frontend UI

명령:

```bash
pnpm --dir front test -- session-import
```

검증:

- valid preview 상태에서 replacement summary와 commit action이 보인다.
- invalid preview 상태에서 issue list와 disabled commit action이 보인다.
- 긴 author name, 긴 file name이 layout을 깨지 않는다.
- AI tab과 JSON tab은 동시에 mount되지 않는다.

### 12.3 E2E visual evidence

명령:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
```

검증:

- host editor에서 JSON mode로 전환한다.
- preview endpoint fixture가 valid/invalid 상태를 반환한다.
- desktop viewport에서 preview 화면 screenshot을 생성한다.
- mobile viewport에서 preview 화면 screenshot을 생성한다.
- screenshot byte size가 10KB 이상이다.
- private sentinel과 raw JSON sentinel이 화면에 없다.

### 12.4 Server

서버 contract를 바꾸지 않으면 기존 targeted DB/API 테스트만 실행한다.

```bash
./server/gradlew -p server clean test
```

서버 preview response에 additive field를 추가하면 관련 controller/model test를 추가하고 위 명령을 필수로 실행한다.

### 12.5 Full local gate

완료 전 실행:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

서버 production code 또는 contract가 변경되면 추가:

```bash
./server/gradlew -p server clean test
```

## 13. Documentation and CHANGELOG

사용자-visible host workflow가 바뀌므로 `CHANGELOG.md`의 `## Unreleased`에 기록한다.

문서 갱신 기준:

- UI copy나 workflow가 `docs/development/session-import-generator.md`와 충돌하면 해당 문서를 갱신한다.
- 테스트/검증 기준이 바뀌면 `docs/development/test-guide.md`에 targeted command를 추가한다.
- public release scanner behavior 자체를 바꾸지 않으면 `scripts/README.md`는 수정하지 않는다.

`docs/superpowers/`는 historical planning archive다. 이 spec은 구현 계약으로 사용하되, 구현 후 source-of-truth 설명은 필요한 경우 `docs/development/`에 반영한다.

## 14. Risks and Mitigations

### Risk: Preview UI가 너무 복잡해진다

Mitigation: 한 화면에 모든 JSON 내용을 보여주지 않는다. Summary, count, unmatched author, blocking issue만 보여준다.

### Risk: 서버 contract 확장이 불필요하게 커진다

Mitigation: 기존 `SessionImportPreviewResponse`를 먼저 활용한다. Additive field는 구현 중 실제로 필요한 경우에만 추가한다.

### Risk: Screenshot evidence가 public release candidate를 깨뜨린다

Mitigation: screenshot은 Playwright output path에만 생성한다. Repo tracked baseline으로 추가하지 않는다. Public release candidate check를 최종 gate에 포함한다.

### Risk: E2E fixture가 private data처럼 보인다

Mitigation: fixture는 `example.com`, `E2E`, alias 값만 사용하고 sentinel non-render assertion을 둔다.

### Risk: 모바일에서 텍스트가 넘친다

Mitigation: 긴 file name, author name, issue message에 wrapping을 적용하고 mobile viewport E2E screenshot을 필수 evidence로 둔다.

## 15. Acceptance Criteria

- 호스트는 JSON preview에서 회차/책/날짜, 작성자 매칭, 교체 항목, 피드백 문서 상태, 저장 차단 사유를 확인할 수 있다.
- Invalid preview는 저장 버튼을 활성화하지 않는다.
- Valid preview는 저장 가능 상태와 교체 summary를 명확히 보여준다.
- UI는 API/query/route import 없이 props/callback 기반을 유지한다.
- 기존 AI/JSON mode URL contract가 유지된다.
- Desktop/mobile E2E screenshot artifact가 생성되고 byte-size assertion을 통과한다.
- Public-safe sentinel이 host editor preview 화면에 렌더링되지 않는다.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`가 통과한다.
- 관련 host editor E2E가 통과한다.
- `./scripts/build-public-release-candidate.sh`와 `./scripts/public-release-check.sh .tmp/public-release-candidate`가 통과한다.
- 서버 contract를 바꿨다면 `./server/gradlew -p server clean test`도 통과한다.
