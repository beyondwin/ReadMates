# ReadMates Session Record Completion Design

작성일: 2026-05-17
상태: APPROVED DESIGN SPEC

## 배경

호스트 세션 편집기는 현재 모임 후 산출물을 세 경로로 다룬다.

- In-app AI 생성: transcript `.txt` 업로드 후 요약, 하이라이트, 한줄평, 피드백 문서를 생성한다.
- 외부 JSON import: 앱 밖에서 만든 `readmates-session-import:v1` JSON을 preview/commit한다.
- 단독 피드백 문서 업로드: `.md` 또는 `.txt` 피드백 문서만 별도로 교체한다.

서버의 최종 저장 경계는 이미 `SessionImportService` 쪽으로 모이는 좋은 축이 있다. 그러나 호스트 UX에서는 세 경로가 같은 세션 편집기 안에 병렬로 보여서 "무엇을 업로드해야 하는지"가 복잡하고, 피드백 문서만 교체하는 레거시 경로가 AI 생성·JSON import의 패키지 저장 모델과 충돌한다.

## 목표

- 호스트가 모임 후 세션 기록을 하나의 "세션 기록 패키지"로 완성하도록 UX를 단순화한다.
- 기본 경로는 AI 생성으로 둔다. JSON import는 AI disabled, provider 장애, cost cap, 외부 도구 작업이 필요한 상황의 fallback으로 유지한다.
- 단독 피드백 문서 업로드 UI와 host upload API를 제거한다.
- 기존 피드백 문서 조회, 참석자 접근 제어, 마이페이지/아카이브 노출은 유지한다.
- 단독 업로드가 만들던 `FEEDBACK_DOCUMENT_PUBLISHED` 알림 이벤트를 세션 기록 패키지 commit 경로로 옮겨 기능 손실을 막는다.
- 변경 범위를 host editor, session import commit, feedback upload mutation removal에 집중한다.

## 비목표

- 기존 `session_feedback_documents` 데이터를 삭제하지 않는다.
- 멤버 피드백 문서 조회 API와 viewer UI를 제거하지 않는다.
- AI provider adapter, prompt 품질, 모델 catalog 구조를 이번 작업에서 재설계하지 않는다.
- 피드백 문서만 부분 교체하는 새 package patch API는 만들지 않는다.
- 세션 기록 자동 발행이나 호스트 검토 없는 commit은 만들지 않는다.

## 제품 흐름

호스트 세션 편집기는 독립된 "피드백 문서" 업로드 패널을 제거하고, 모임 후 기록 영역을 하나의 `세션 기록 완성` 패널로 정리한다.

권장 화면 흐름:

1. `세션 기록 완성` 패널은 AI 생성 경로를 기본으로 보여준다.
2. 호스트는 transcript `.txt`를 업로드하고 모델과 지시문을 선택한다.
3. AI job이 완료되면 요약, 하이라이트, 한줄평, 피드백 문서를 한 화면에서 검토한다.
4. 호스트는 섹션별 수동 편집이나 재생성을 수행한다.
5. 저장 시 네 산출물이 한 트랜잭션 경계에서 교체된다.

JSON fallback:

- 같은 패널 안에서 `외부 JSON 가져오기` 경로를 보조 선택지로 제공한다.
- AI feature flag가 꺼져 있거나 provider가 비활성인 환경에서는 AI 경로가 unavailable state를 보이고 JSON fallback은 계속 사용할 수 있다.
- JSON fallback도 `readmates-session-import:v1` 전체 패키지를 요구한다. 피드백 문서만 있는 `.md` 또는 `.txt` 파일은 더 이상 호스트 편집기에서 직접 업로드할 수 없다.

기존 피드백 문서가 있는 세션:

- 문서 상태와 `미리보기` 링크는 유지한다.
- 새 문서 등록/교체는 AI 생성 또는 JSON import commit 후에만 발생한다.
- 호스트가 피드백 문서만 긴급 교체해야 하는 경우에는 JSON fallback으로 전체 패키지를 다시 저장한다.

## 프런트엔드 설계

새 통합 패널은 host editor의 report/mobile section 안에 둔다. 이름은 구현 시 codebase 패턴에 맞춰 조정하되, 책임은 다음처럼 둔다.

- `SessionRecordCompletionPanel`: AI 생성과 JSON fallback의 상위 panel, mode state, disabled/unavailable state, 기존 문서 상태 표시를 소유한다.
- AI 생성 모드: 현재 `front/features/host/aigen/ui/AiGenerateTab.tsx` 흐름을 재사용하거나 통합 패널 아래로 감싼다.
- JSON fallback 모드: 현재 `front/features/host/ui/session-editor/session-import-panel.tsx` preview/commit 흐름을 통합 패널 아래로 감싼다.
- 기존 `HostSessionFeedbackUpload` UI는 제거한다.

Host editor 변경:

- `front/features/host/ui/host-session-editor.tsx`에서 `HostSessionFeedbackUpload` import, input ref, upload handler, standalone panel render를 제거한다.
- `operationOrder`와 안내 문구에서 "피드백 문서 업로드"를 "세션 기록 완성" 또는 "세션 기록 패키지 저장"으로 바꾼다.
- `HostSessionEditorActions`와 route action wiring에서 `uploadFeedbackDocument`를 제거한다.
- 기존 `feedbackDocument` 상태는 read-only status와 preview link 표시용으로만 사용한다.

UI 원칙:

- Host 화면은 운영 ledger처럼 조용하고 명확해야 한다.
- "AI 결과 JSON"이라는 내부 구현 중심 라벨보다 "외부 JSON 가져오기"와 "AI로 생성"처럼 호스트 작업 기준의 라벨을 사용한다.
- AI unavailable 상태는 숨기지 않는다. 이유를 짧게 보여주고 JSON fallback을 남긴다.
- 피드백 문서 접근 권한이나 민감성 경고를 약화하지 않는다.

## 서버 설계

### 제거할 mutation

`POST /api/host/sessions/{sessionId}/feedback-document` host upload endpoint를 제거한다. 이 endpoint가 사라져도 아래 read surface는 유지한다.

- `GET /api/host/sessions/{sessionId}/feedback-document`
- `GET /api/sessions/{sessionId}/feedback-document`
- `GET /api/feedback-documents/me`

`FeedbackDocumentService`는 조회와 상태 확인 책임만 남긴다. `UploadHostFeedbackDocumentUseCase`, `AuthorizeHostFeedbackDocumentUploadUseCase`, `FeedbackDocumentUploadValidator`, upload controller method는 제거 대상이다.

### 유지할 write path

새 피드백 문서 쓰기는 `SessionImportService` commit 경로만 담당한다.

```text
AI generation commit
  or JSON import commit
      -> SessionImportService.commit / commitValidated
      -> SessionImportWritePort.replaceRecords
      -> session_feedback_documents 새 version 저장
      -> FEEDBACK_DOCUMENT_PUBLISHED 이벤트 기록
```

`JdbcSessionImportWriteAdapter.storeFeedbackDocument(...)`는 현재처럼 새 version을 저장하되, 저장 결과에 `version`을 포함시킨다. `SessionImportService.commitVerifiedTarget(...)`는 저장된 version을 받은 뒤 기존 notification use case를 호출해 `recordFeedbackDocumentPublished(...)` 이벤트를 기록한다.

알림 호출은 피드백 문서 저장이 성공한 commit 이후에만 일어난다. commit 검증이 실패하거나 트랜잭션이 롤백되면 알림 이벤트도 남지 않아야 한다.

### 알림 의미

기존 단독 업로드는 피드백 문서가 올라왔다는 알림 이벤트를 발생시켰다. 단독 업로드가 제거되면 이 이벤트의 source는 세션 기록 패키지 commit으로 바뀐다.

- JSON import commit: 피드백 문서를 새 version으로 저장하고 `FEEDBACK_DOCUMENT_PUBLISHED` 이벤트를 기록한다.
- AI commit: `AiGenerationCommitService`가 `SessionImportService.commitValidated(...)`로 위임하므로 같은 이벤트가 기록된다.
- 피드백 문서 조회와 수동 알림 발송 조건은 기존 `session_feedback_documents` 존재 여부를 기준으로 유지한다.

## 오류 처리

- AI 생성 실패: 기존 job error state를 유지하고 같은 패널에서 JSON fallback을 사용할 수 있게 한다.
- AI disabled/provider disabled/cost cap: AI 경로를 unavailable state로 표시하고 JSON fallback은 사용 가능하게 둔다.
- JSON preview 실패: 현재처럼 issue list를 보여주고 commit을 막는다.
- commit 실패: 요약, 하이라이트, 한줄평, 피드백 문서 중 일부만 저장되는 상태를 허용하지 않는다.
- 피드백 문서 템플릿 실패: 패키지 전체 저장을 차단한다.
- 제거된 upload endpoint 호출: 404 또는 route 없음으로 처리한다. 호환성 shim을 추가하지 않는다.

## 마이그레이션과 호환성

- DB migration은 필요하지 않다. 기존 `session_feedback_documents` table과 데이터는 유지한다.
- 기존 seed, fixture, 조회 테스트는 문서가 이미 저장된 상태를 계속 사용할 수 있다.
- 단독 업로드 API를 사용하던 테스트와 frontend action은 제거하거나 JSON import/AI commit 테스트로 대체한다.
- README와 architecture 문서는 구현 후 현재 동작에 맞춰 별도 업데이트한다. 이 spec은 구현 전 설계 기록이다.

## 테스트 계획

프런트엔드:

- host editor에서 단독 피드백 업로드 패널, file input, upload button이 렌더링되지 않는다.
- `세션 기록 완성` 패널에서 AI 생성 경로와 JSON fallback 경로가 확인된다.
- AI unavailable 상태에서도 JSON fallback이 접근 가능하다.
- 기존 피드백 문서가 있는 세션은 preview/read link를 계속 보여준다.
- JSON import 성공 후 editor의 publication summary와 feedback document status가 갱신된다.

서버:

- `POST /api/host/sessions/{sessionId}/feedback-document`가 더 이상 지원되지 않는다.
- JSON import commit은 `session_feedback_documents` 새 version을 저장하고 `FEEDBACK_DOCUMENT_PUBLISHED` 이벤트를 기록한다.
- AI commit은 `SessionImportService.commitValidated(...)` 경유로 같은 이벤트를 기록한다.
- invalid feedback Markdown은 package commit 전체를 거절하고 알림 이벤트를 남기지 않는다.
- 기존 feedback document 조회와 참석자/호스트 권한 테스트는 유지된다.

검증 명령:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- Server: `./server/gradlew -p server clean test`
- Auth/BFF/user-flow 영향 확인이 필요하면 `pnpm --dir front test:e2e`

## 리스크

- 피드백 문서만 급하게 고쳐야 하는 운영 시나리오의 friction이 늘어난다. 의도적으로 JSON fallback의 전체 패키지 저장으로 대응한다.
- 기존 단독 업로드 API를 직접 호출하던 비공식 클라이언트가 있다면 깨진다. ReadMates는 invite-only 앱이고 public contract로 문서화된 외부 client surface가 아니므로 호환 shim은 두지 않는다.
- `FEEDBACK_DOCUMENT_PUBLISHED` 이벤트가 import/AI commit으로 이동하면서 중복 알림 가능성을 확인해야 한다. 같은 세션을 여러 번 commit하면 새 피드백 문서 version이 생성되므로 알림이 다시 발생하는 것이 기존 "교체 업로드"와 같은 의미다.

## 승인된 결정

- 기본 UX는 AI 생성 중심이다.
- JSON import는 fallback으로 유지한다.
- 단독 피드백 문서 업로드 UI와 host upload API는 제거한다.
- 기존 피드백 문서 조회, 권한, 저장 데이터는 유지한다.
- 피드백 문서 알림 이벤트는 세션 기록 패키지 commit 경로로 이동한다.
