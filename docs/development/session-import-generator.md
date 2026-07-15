# 세션 기록 JSON 가져오기

호스트가 모임 녹취록을 로컬에서 정리한 뒤, ReadMates 호스트 세션 편집기에서 한 번에 가져올 수 있는 JSON 형식입니다. 같은 편집기의 in-app 근거 기반 AI 생성 흐름과 외부 JSON fallback의 경계도 함께 설명합니다.

이 흐름은 production 앱에서 LLM을 호출하지 않습니다. 모델 선택, API key, 원본 녹취록, 중간 산출물은 로컬 작업 공간에만 두고, 앱에는 최종 검토한 JSON만 업로드합니다.

## 매번 반복할 때의 작업 흐름

1. 호스트 세션 편집기에서 현재 회차 정보를 확인합니다.
   - 회차 번호
   - 책 제목
   - 모임 날짜
   - 앱에 표시되는 참석자 이름
   - 기록 공개 범위
2. 녹취록을 로컬 파일로 준비합니다. 원본 녹취록과 중간 산출물은 Git 밖에 둡니다.
3. 아래 [생성 프롬프트 템플릿](#생성-프롬프트-템플릿)에 회차 정보와 참석자 목록을 채워 LLM에 전달합니다.
4. 모델 출력은 설명 없이 JSON 하나만 받아 `.json` 파일로 저장합니다.
5. [로컬 검수 체크](#로컬-검수-체크)와 호스트 편집기 preview를 모두 통과한 뒤 저장합니다.

반복 작업을 줄이려면 매 회차마다 새 규칙을 만들지 말고, 이 문서의 템플릿에서 `{...}` placeholder만 바꿉니다. 문체 수정이 필요하면 JSON 전체를 다시 만들기보다 `publication.summary`, `highlights`, `oneLineReviews`, `feedbackDocument.markdown`의 문장만 부분 재생성합니다.

## 모드 병존 안내 (in-app AI 생성과의 관계)

호스트 세션 편집기는 `세션 기록 완성` 패널에서 AI 생성을 기본 경로로 보여주고, 외부 JSON 가져오기를 fallback으로 제공합니다. 단독 `.md` 또는 `.txt` 피드백 문서 업로드는 더 이상 제공하지 않습니다.

| 모드 | 입력 | LLM 호출 위치 | 운영 게이트 |
| --- | --- | --- | --- |
| 외부 JSON 업로드 | 호스트가 로컬에서 정리한 `readmates-session-import:v1` JSON | 앱 외부 | 항상 사용 가능 |
| In-app AI 생성 | UTF-8/BOM TXT(≤ 1 MiB, ≤ 3시간) + 서버가 제공한 모델 ID | 서버 측 provider adapter (Claude/OpenAI/Gemini) | kill switch + provider allowlist + `pipeline-mode` + provider API key |

두 모드의 commit 경로는 같은 `SessionImportService.commitValidated(...)`를 사용하므로 저장 후의 데이터 형태와 권한 경계는 동일합니다. 현재 동작은 [architecture.md의 In-app AI 세션 생성 컴포넌트](architecture.md#in-app-ai-세션-생성-컴포넌트), 운영 rollout과 장애 대응은 [AI session generation runbook](../operations/runbooks/ai-session-generation.md)을 기준으로 합니다. `docs/superpowers/**`의 spec과 plan은 설계 이력이며 현재 동작의 source of truth가 아닙니다.

## In-app 근거 기반 AI 생성

`READMATES_AIGEN_PIPELINE_MODE=GROUNDED_WHOLE_TRANSCRIPT`가 승인된 환경에서는 호스트가 다음 순서로 세션 기록을 완성합니다.

1. TXT를 UTF-8 또는 UTF-8 BOM으로 준비합니다. 각 발언은 `화자명 MM:SS` header와 본문을 사용하고 timestamp는 뒤로 가지 않아야 합니다.
2. 모든 고유 화자명을 현재 클럽의 `ACTIVE` 멤버 표시 이름과 정확히 맞춥니다. 비교는 Unicode NFC + trim 후 case-sensitive exact match이며 alias, fuzzy match, generic label 자동 보정은 없습니다.
3. 호스트 편집기에서 `AI로 생성`을 열고 서버가 반환한 모델 목록에서 선택해 TXT를 업로드합니다. 최대 크기는 1 MiB, 최대 길이는 3시간입니다.
4. 생성이 끝나면 요약, 하이라이트, 한줄평, 피드백 문서의 각 항목에서 근거를 확인합니다. 기본 excerpt는 서버가 원본 turn에서 만든 최대 240 Unicode code point이며, 현재 revision이 참조한 turn 하나만 확장할 수 있습니다.
5. 네 섹션을 모두 `AI 근거 검토 완료`로 표시합니다. 직접 문장을 고친 섹션은 기존 근거/review가 무효화되므로 `직접 수정 내용 확인`으로 다시 확인합니다.
6. 재생성하면 revision과 네 섹션 review가 초기화됩니다. 최신 revision을 다시 검토한 뒤 `AI 기록 저장`을 누릅니다.

비회원, 비활성/다른 클럽 회원, generic label, 정규화 후 중복 이름은 job을 만들기 전에 422로 거절됩니다. 이 preflight 실패에는 Redis/Kafka/provider/cost side effect가 없습니다. Model capability를 확인할 수 없으면 503, 실제 request budget이 모델 한도를 넘으면 422로 provider 호출 전에 fail closed하며, 임의 chunking은 하지 않습니다.

브라우저 draft는 revision을 포함한 복구용 편집값만 최대 6시간 보관합니다. Transcript, parsed turns, evidence/excerpt는 localStorage에 저장하지 않습니다. 서버의 transcript/turns/result/evidence payload도 Redis에 6시간만 있고 commit/cancel 뒤 삭제됩니다. 만료된 job은 운영 채널로 원문을 전달하지 말고 호스트가 원본 TXT를 다시 업로드합니다.

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

## 생성 프롬프트 템플릿

아래 프롬프트를 그대로 복사하고 `{...}`만 바꿉니다. 실제 참석자 이름, 원본 파일명, 운영 URL, 로컬 경로는 문서나 commit에 남기지 않습니다.

```text
첨부한 독서모임 녹취록을 ReadMates session import JSON으로 변환해줘.

반드시 JSON 하나만 출력해.
설명, 마크다운 코드블록, 주석, 후속 안내 문장은 출력하지 마.

고정값:
- format: "readmates-session-import:v1"
- session.number: {회차번호}
- session.bookTitle: "{앱에 표시된 책 제목}"
- session.meetingDate: "{YYYY-MM-DD}"
- feedbackDocument.fileName: "session-{회차번호}-feedback.md"
- feedbackDocument.markdown 제목: "# 독서모임 {회차번호}차 피드백"

참석자:
- authorName은 아래 앱 표시 이름 중에서만 사용한다.
- 참석자 목록: {앱에 표시된 참석자 이름 목록}
- 참석하지 않은 사람, 비활성 참석자, 별칭이 다른 이름은 쓰지 않는다.

출력 범위:
- publication.summary: 2~4문장. 모임의 핵심 흐름만 자연스럽게 요약한다.
- highlights: 3~6개. 실제 발언에 근거한 장면만 고른다.
- oneLineReviews: 1개 이상. 같은 authorName을 중복하지 않는다.
- feedbackDocument.markdown: 아래 피드백 문서 구조를 정확히 지킨다.

문체:
- AI가 정리한 티가 나는 추상어를 줄인다.
- "결론은", "참석자들은", "방식으로 이어졌다" 같은 보고서 문장을 과하게 반복하지 않는다.
- 실제 대화에서 나온 말투와 장면을 우선한다.
- 없는 한줄평을 새로 꾸미지 말고, 녹취록에 있는 짧은 감상이나 정리 발언을 한줄평으로 다듬는다.
- 근거 없는 심리 추정, 성격 평가, 과장된 칭찬을 쓰지 않는다.

금지:
- 녹취록에 없는 사실, 배경, 평가를 만들지 않는다.
- 이메일, 연락처, 로컬 경로, 운영 정보, 민감한 개인 사정은 넣지 않는다.
- JSON 밖에 어떤 텍스트도 출력하지 않는다.

JSON 스키마:
{
  "format": "readmates-session-import:v1",
  "session": {
    "number": {회차번호},
    "bookTitle": "{앱에 표시된 책 제목}",
    "meetingDate": "{YYYY-MM-DD}"
  },
  "publication": {
    "summary": "..."
  },
  "highlights": [
    { "authorName": "...", "text": "..." }
  ],
  "oneLineReviews": [
    { "authorName": "...", "text": "..." }
  ],
  "feedbackDocument": {
    "fileName": "session-{회차번호}-feedback.md",
    "markdown": "<!-- readmates-feedback:v1 -->\n\n# 독서모임 {회차번호}차 피드백\n\n..."
  }
}
```

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

## 피드백 문서 구조

`feedbackDocument.markdown`은 문자열 안에 들어가는 Markdown입니다. 서버 parser는 heading 이름과 순서를 기준으로 읽기 때문에 아래 구조를 유지해야 합니다.

```markdown
<!-- readmates-feedback:v1 -->

# 독서모임 {회차번호}차 피드백

{책제목} · {YYYY.MM.DD}

## 메타

- 일시: {YYYY.MM.DD} ({요일}) · {HH:mm}
- 소요시간: {녹취록 기준 소요시간}
- 책: {책제목} · {저자}
- 참여자: {참석자 목록}

## 관찰자 노트

{모임 전체 흐름 1~3문단}

## 참여자별 피드백

### 01. {참석자명}

역할: {대화에서 맡은 자연스러운 역할}

#### 참여 스타일

{참여 방식 1~2문단}

#### 실질 기여

- {실제 대화에 남긴 기여}

#### 문제점과 자기모순

##### 1. {부드러운 개선 지점 제목}

- 핵심: {무엇이 아쉬웠는지}
- 근거: {녹취록에서 확인되는 근거}
- 해석: {다음 대화에서 어떻게 다루면 좋을지}

#### 실천 과제

1. {다음 모임에서 바로 해볼 행동}

#### 드러난 한 문장

> {녹취록에 실제로 가깝게 남은 한 문장}

맥락: {그 말이 나온 대화 맥락}

주석: {이 문장이 보여주는 의미}
```

필수 heading은 `## 메타`, `## 관찰자 노트`, `## 참여자별 피드백`, `#### 참여 스타일`, `#### 실질 기여`, `#### 문제점과 자기모순`, `#### 실천 과제`, `#### 드러난 한 문장`입니다. `### 01. 이름`처럼 참여자 번호와 이름도 유지합니다.

## 문체 규칙

- `summary`는 앱에 공개될 수 있는 짧은 회차 소개입니다. 분석 보고서처럼 쓰지 말고, 실제 모임을 떠올릴 수 있는 말로 씁니다.
- `highlights`는 "누가 어떤 관점을 냈는지"가 보여야 합니다. 모든 문장을 같은 형식으로 시작하지 않습니다.
- `oneLineReviews`는 참석자가 남긴 짧은 감상에 가깝게 씁니다. 별도 한줄평이 없었다면 녹취록의 마무리 감상, 책에 대한 반응, 다시 읽고 싶은 지점 등을 짧게 다듬습니다.
- 참여자별 피드백은 평가서가 아니라 다음 대화를 돕는 메모입니다. "탁월한", "깊이 있는", "통찰을 제공했다"처럼 근거 없이 좋은 말만 쌓지 않습니다.
- 문제점 제목은 공격적으로 쓰지 않습니다. 예를 들어 `전달 난도가 높았다`보다 `바로 따라가기 어려운 지점도 생겼다`처럼 독자가 받아들이기 쉬운 표현을 씁니다.
- 추상어를 쓸 때는 한 단계 구체화합니다. `라벨`이 어색하면 `해석의 틀`, `이름 붙이기`, `선입견`, `기대` 중 문맥에 맞는 말을 고릅니다.
- 문장 끝이 모두 `~했다`, `~이었다`로 반복되면 일부를 `~로 이어졌다`, `~에 가까웠다`, `~라는 말이 남았다`처럼 자연스럽게 바꿉니다.

## 검토 체크

업로드 전에 다음을 확인합니다.

- 녹취록에 없는 사실, 평가, 배경 정보를 만들지 않았습니다.
- 공개 요약과 하이라이트에 이메일, 연락처, 로컬 경로, 운영 정보, 민감한 개인 사정이 없습니다.
- 실명 모드가 아닌 demo/public fixture에는 alias만 사용했습니다.
- JSON 파일에는 API key, 모델 provider token, 원본 녹취록 경로가 없습니다.
- 피드백 문서 제목은 `# 독서모임 N차 피드백` 형식입니다.

## 로컬 검수 체크

파일을 저장한 뒤 최소한 아래를 확인합니다.

```bash
jq -e '.format == "readmates-session-import:v1"' session-import.json
jq -e '.session.number and .session.bookTitle and .session.meetingDate' session-import.json
jq -e '(.highlights | length >= 1 and length <= 6) and (.oneLineReviews | length >= 1)' session-import.json
jq -e '.feedbackDocument.markdown | contains("<!-- readmates-feedback:v1 -->") and contains("## 참여자별 피드백")' session-import.json
```

이 검수는 형식 확인일 뿐입니다. 최종 판단은 호스트 편집기 preview의 issue 목록과 사람이 읽었을 때의 문체 검토로 합니다.

## 호스트 편집기 사용

1. 호스트 세션 편집기에서 기록 공개 범위를 먼저 선택합니다.
2. `세션 기록 완성` 패널에서 `외부 JSON 가져오기`를 선택하고 파일을 고릅니다.
3. 미리보기에서 회차, 책, 날짜, 작성자 매칭, 피드백 문서 상태를 확인합니다.
4. 저장 가능 상태일 때 `가져온 기록 저장`을 누릅니다.

저장은 해당 회차의 요약, 하이라이트, 한줄평, 피드백 문서를 교체합니다. 서버는 저장 직전에 같은 검증을 다시 실행하고, 실패하면 아무 레코드도 일부 저장하지 않습니다.

호스트 편집기는 내부적으로 두 API를 사용합니다.

- `POST /api/host/sessions/{sessionId}/session-import/preview`
- `POST /api/host/sessions/{sessionId}/session-import/commit`

두 API 모두 현재 club의 active host 권한이 필요합니다.

## 예시 fixture

Sanitized 예시는 [fixtures/session-import-example.json](fixtures/session-import-example.json)을 참고합니다. 이 파일은 실제 멤버 데이터가 아니라 public-safe alias와 예시 문장만 포함합니다.
