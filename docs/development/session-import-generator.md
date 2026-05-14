# 세션 기록 JSON 가져오기

호스트가 모임 녹취록을 로컬에서 정리한 뒤, ReadMates 호스트 세션 편집기에서 한 번에 가져올 수 있는 JSON 형식입니다.

이 흐름은 production 앱에서 LLM을 호출하지 않습니다. 모델 선택, API key, 원본 녹취록, 중간 산출물은 로컬 작업 공간에만 두고, 앱에는 최종 검토한 JSON만 업로드합니다.

## 출력 형식

파일은 UTF-8 JSON 하나입니다.

```json
{
  "format": "readmates-session-import:v1",
  "session": {
    "number": 7,
    "bookTitle": "Example Book",
    "meetingDate": "2026-05-14"
  },
  "publication": {
    "summary": "Public-safe session summary."
  },
  "highlights": [
    { "authorName": "Host", "text": "Public-safe highlight." }
  ],
  "oneLineReviews": [
    { "authorName": "Host", "text": "Concise one-line review." }
  ],
  "feedbackDocument": {
    "fileName": "session-7-feedback.md",
    "markdown": "<!-- readmates-feedback:v1 -->\n\n# 독서모임 7차 피드백\n\n..."
  }
}
```

`recordVisibility`는 파일에 넣지 않습니다. 호스트 편집기의 현재 공개 범위 선택값이 preview/commit 요청에 붙습니다. `HOST_ONLY` 범위는 저장할 수 없으므로, 가져온 기록을 저장하려면 편집기에서 `MEMBER` 또는 `PUBLIC`을 먼저 선택합니다.

## 생성 입력

- 녹취록 텍스트
- 회차 번호
- 책 제목, 저자
- 모임 날짜
- 앱에 표시되는 참석자 이름
- 실명 모드 또는 alias 모드

## 생성 규칙

- `format`은 반드시 `readmates-session-import:v1`입니다.
- `session.number`, `session.bookTitle`, `session.meetingDate`는 현재 편집 중인 세션과 일치해야 합니다.
- `publication.summary`와 `highlights`는 공개 가능 문장만 사용합니다.
- `authorName`은 참석자 표시 이름과 정확히 일치해야 합니다.
- 로컬 demo/seed 데이터는 실제 참석자 실명 대신 alias 표시 이름을 사용할 수 있습니다. import 전에 호스트 편집기 참석자 목록에 보이는 이름을 그대로 넣습니다.
- `highlights`는 1개 이상 6개 이하입니다.
- `oneLineReviews`는 1개 이상이고, 같은 작성자를 중복하지 않습니다.
- `feedbackDocument.fileName`은 `/` 또는 `\`를 포함하지 않는 `.md` 또는 `.txt` 파일명입니다.
- `feedbackDocument.markdown`은 기존 `readmates-feedback:v1` 피드백 문서 템플릿을 통과해야 합니다.
- 서버 preview는 같은 검증을 다시 수행하고, 저장 가능한 경우에만 commit을 허용합니다.

## 검토 체크

업로드 전에 다음을 확인합니다.

- 녹취록에 없는 사실, 평가, 배경 정보를 만들지 않았습니다.
- 공개 요약과 하이라이트에 이메일, 연락처, 로컬 경로, 운영 정보, 민감한 개인 사정이 없습니다.
- 실명 모드가 아닌 demo/public fixture에는 alias만 사용했습니다.
- JSON 파일에는 API key, 모델 provider token, 원본 녹취록 경로가 없습니다.
- 피드백 문서 제목은 `# 독서모임 N차 피드백` 형식입니다.

## 호스트 편집기 사용

1. 호스트 세션 편집기에서 기록 공개 범위를 먼저 선택합니다.
2. `AI 결과 JSON 가져오기`에서 파일을 선택합니다.
3. 미리보기에서 회차, 책, 날짜, 작성자 매칭, 피드백 문서 상태를 확인합니다.
4. 저장 가능 상태일 때 `가져온 기록 저장`을 누릅니다.

저장은 해당 회차의 요약, 하이라이트, 한줄평, 피드백 문서를 교체합니다. 서버는 저장 직전에 같은 검증을 다시 실행하고, 실패하면 아무 레코드도 일부 저장하지 않습니다.

호스트 편집기는 내부적으로 두 API를 사용합니다.

- `POST /api/host/sessions/{sessionId}/session-import/preview`
- `POST /api/host/sessions/{sessionId}/session-import/commit`

두 API 모두 현재 club의 active host 권한이 필요합니다.

## 예시 fixture

Sanitized 예시는 [fixtures/session-import-example.json](fixtures/session-import-example.json)을 참고합니다. 이 파일은 실제 멤버 데이터가 아니라 public-safe alias와 예시 문장만 포함합니다.
