# ADR-0072: 피드백 문서 템플릿 v2 — 모임 단위 섹션과 회차 누적 흐름을 선택 섹션으로 추가

- 상태: Proposed
- 결정일: 2026-09-25
- 작성자: 호스트 운영 / 피드백 문서 담당
- 관련: `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentParser.kt` (`FeedbackDocumentParser.parse`), `front/features/feedback/ui/feedback-document-page.tsx` (`FeedbackDocumentPage`), `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt` (`FEEDBACK_DOCUMENT_MARKER`), `docs/development/session-import-generator.md`

## 컨텍스트

피드백 문서는 `<!-- readmates-feedback:v1 -->` 마커와 고정 heading(`## 메타`, `## 관찰자 노트`, `## 참여자별 피드백`, 참여자별 `#### 참여 스타일`~`#### 드러난 한 문장`)으로 작성하고, 서버 parser가 heading 이름과 순서로 구조화한다. 화면은 관찰 메모 문단과 참여자 카드만 그린다.

운영 중 멤버에게 더 도움이 되는 문서를 만들려고 하자 v1 구조로는 다음을 담을 수 없었다.

- 모임 전체를 보는 내용: 한눈에 보기, 대화가 발전한 장면(하이라이트), 모임 단위의 잘된 점·아쉬운 점과 근거, 발언 분량, 다음 모임 제안.
- 회차를 넘나드는 근거: 회차별 참석 인원, 모임 대화 방식의 단계 변화, 반복 과제의 진행 여부, 이어갈 질문.
- 참여자별 누적 변화: 지난 회차 지적과 과제가 이번에 어떻게 이어졌는지(변화 흐름, 지난 과제에서 해낸 것), 처음 참여한 멤버의 기준점, 실제 발언과 그 발언이 대화에서 한 역할.

관찰 메모 문단에 표시어를 붙여 넣는 방식은 화면이 일반 문단으로만 그려서 구조가 사라졌다.

## 결정

피드백 문서 템플릿 v2(`<!-- readmates-feedback:v2 -->`)를 추가한다. v2는 v1의 필수 heading과 순서를 그대로 유지하고, 다음을 **선택 섹션**으로 더한다.

- 최상위(`## 메타`와 `## 참여자별 피드백` 사이): `## 한눈에 보기`, `## 오늘의 하이라이트`, `## 모임 피드백`, `## 모임의 흐름`, `## 이어갈 질문`.
- 참여자 블록: 역할 줄 다음 `배지:` 줄, `#### 참여 스타일` 앞의 `#### 변화 흐름`·`#### 지난 과제에서 해낸 것`·`#### 첫 기록 기준점`, `#### 실질 기여`와 `#### 문제점과 자기모순` 사이의 `#### 이번 모임의 발언`.

parser는 v1과 v2 마커를 모두 받는다. v2 선택 섹션은 v2 마커일 때만 인식하고, 선택 섹션이 있으면 형식을 엄격히 검증한다. API 응답은 기존 필드를 유지한 채 `templateVersion`과 선택 섹션 필드를 추가하며, v1 문서에서는 빈 목록이나 `null`을 돌려준다. 화면은 선택 섹션이 있을 때만 해당 영역을 그리므로 v1 문서는 기존과 같은 모습이다.

## 근거

- 기존 보존 문서(v1)와 AI 생성·외부 JSON import 경로를 깨지 않는다. 필수 구조가 같으므로 v1 검증 규칙과 저장 데이터는 바뀌지 않는다.
- 회차별 참석, 단계, 반복 과제는 작성자가 과거 피드백 문서를 근거로 정리한 값이다. DB에서 계산하지 않고 문서에 담아 문서가 보존본으로서 스스로 완결되게 한다.
- 선택 섹션을 엄격히 검증해 호스트가 반영 전 미리보기와 import 검증에서 형식 오류를 바로 확인하게 한다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| 관찰 메모 문단에 `[모임 하이라이트]` 같은 표시어를 넣기 | 화면이 일반 문단으로만 그려 구조와 근거가 드러나지 않음 |
| v1 필수 heading을 바꾸는 새 템플릿 | 보존된 v1 문서, AI 생성 검증기, import 검증과의 호환이 깨짐 |
| 회차 누적 지표를 서버에서 DB로 계산 | 참석·발언 근거가 문서 밖으로 흩어지고, 과거 문서 해석(단계, 반복 과제)은 계산할 수 없음 |

## 결과

긍정적:
- 한 문서 안에서 모임 전체 피드백, 회차 누적 흐름, 참여자별 변화와 실제 발언을 근거와 함께 보여 줄 수 있다.
- v1 문서와 기존 생성 경로는 변경 없이 계속 동작한다.

부정적/감수한 비용:
- parser, 응답 계약, 화면이 선택 섹션만큼 커진다.
- AI 생성 검증기(`DefaultSessionImportV1Validator`, `GroundedGenerationValidator`)는 v1 마커만 생성·검증한다. v2 문서는 외부 JSON import와 직접 작성으로 등록한다.

## 검증

- `FeedbackDocumentParserTest`: v1 문서 회귀, v2 선택 섹션 파싱, v2 형식 오류 거부, v1 마커의 v2 섹션 거부.
- `FeedbackDocumentControllerTest`: v2 응답 필드.
- `JdbcAdminClubOperationsClosingRiskTest`: v2 마커 문서를 형식 오류로 보지 않음.
- `front/features/feedback/ui/feedback-document-page.test.tsx`: v2 섹션 렌더링과 v1 문서의 기존 렌더링.

## 후속 작업

- AI 생성 경로의 v2 지원 여부는 별도 결정으로 다룬다.
