# ReadMates — Effective Java / Clean Code 기반 코드 개선 설계

작성일: 2026-06-07
상태: DRAFT DESIGN SPEC
대상 표면: server (Kotlin/Spring Boot) 한정

## 1. 배경

인프런 *이펙티브 자바*·*클린코드* 강의의 핵심 원칙을 기준으로 서버 코드를 검토했다.
ReadMates 서버는 헥사고날(포트/어댑터) 경계와 도메인 분리가 잘 잡혀 있고, 보안
민감 지점(타이밍 공격 방어 `SecretComparator`, 주간 솔트 IP 해시)도 의도와 함께
주석으로 문서화돼 있다. 즉 "구조적 결함"보다는 **이미 좋은 코드에 남아 있는 국소
중복·표준 라이브러리 미사용·암묵적 관례**가 개선 대상이다.

직전 아키텍처/SOLID 작업(`2026-05-13-readmates-architecture-solid-detailed-implementation.md`)
은 포트 분리·파일 분할 같은 구조 레벨을 닫았다. 이 문서는 그보다 한 단계 아래,
**함수/표현 레벨의 위생(hygiene)**을 다룬다. 모든 변경은 동작 보존(behavior-preserving)
이며 API 응답·라우트·DB 스키마·인가 규칙을 건드리지 않는다.

## 2. Source Documents

- 아키텍처 source of truth: `docs/development/architecture.md`
- 직전 구조 개선: `docs/superpowers/plans/2026-05-13-readmates-architecture-solid-detailed-implementation.md`
- 서버 가이드: `docs/agents/server.md`
- 릴리스 안전 규칙: `docs/development/release-readiness-review.md`
- 구현 문서(짝): `docs/superpowers/plans/2026-06-07-readmates-effective-java-clean-code-implementation.md`

## 3. 성공 기준

"리팩터링했다"가 아니다.

- 같은 의미의 코드 중복이 한 곳으로 모이고, 출력은 **바이트 단위로 동일**하다.
- 표준 라이브러리(JDK 21 `java.util.HexFormat`)로 자작 비트 연산을 대체한다.
- 의도적으로 광범위하게 잡는 예외는 *왜 무시/광범위 처리가 맞는지* 코드에서 읽힌다.
- detekt suppress 개수가 (정당한 것을 제외하고) 줄거나, 남은 것은 근거가 명시된다.
- 기존 테스트가 무변경 통과하고, 신규 단위 테스트가 동작 동일성을 고정한다.
- 공개 저장소 안전(실데이터·시크릿·로컬 경로·사내 도메인 없음)을 유지한다.

## 4. 범위 & 경계

### 4.1 건드릴 표면

- `server/src/main/kotlin/com/readmates/shared/**` — 공통 유틸 신설.
- `aigen/application/service/AiGenerationOrchestrator.kt` — 감사 로그 생성 중복.
- `notification/application/service/{HostManualNotificationService,AdminNotificationOperationsService,NotificationTestMailService}.kt` — 해시 헬퍼.
- `shared/security/ClientIpHashing.kt` — 해시 헬퍼.
- LLM 어댑터·헬스 카드 provider — 예외 주석(코드 동작 무변경).

### 4.2 경계 보존

- 포트 인터페이스 시그니처·DTO 필드·응답 shape 변경 없음.
- DB 마이그레이션 없음.
- aigen은 `readmates.aigen.enabled=true`일 때만 활성. 유틸 추출은 이 게이트와 무관하게 안전.
- ArchUnit 베이스라인을 깨지 않는다(신규 `shared` 유틸은 어느 슬라이스에서도 의존 허용되는 위치에 둔다).

### 4.3 Non-goals

- 새 기능·새 CRUD·새 포트 추가 금지.
- enum에 행위 추가 같은 도메인 모델 재설계는 별도 작업(§5.5 참고만, 구현 제외).
- 광범위 예외 처리의 "동작" 변경 금지 — 주석/네이밍 위생만.
- 프런트엔드 변경 없음.

## 5. Findings & 설계

각 항목: **현상 → 강의 원칙 근거 → 설계 → 동작 보존 근거**.

### 5.1 [P1] SHA-256 → hex 인코딩 중복 (5곳)

**현상.** 동일 관용구가 5개 파일에 흩어져 있다:

```
MessageDigest.getInstance("SHA-256")
    .digest(text.toByteArray(...))
    .joinToString("") { "%02x".format(it) }
```

- `aigen/.../AiGenerationOrchestrator.kt:383` `sha256(text)`
- `notification/.../HostManualNotificationService.kt:352`
- `notification/.../AdminNotificationOperationsService.kt:155`
- `notification/.../NotificationTestMailService.kt:103` `sha256Hex(value)`
- `shared/security/ClientIpHashing.kt:28` (끝에 `.take(32)` 변형)

**근거.**
- 클린코드: **DRY** — 같은 지식이 5곳에 복제됨. 변경 시 5곳을 동기화해야 함.
- 이펙티브 자바 **Item 59 "라이브러리를 익히고 사용하라"** — JDK 17+ `java.util.HexFormat`
  가 있는데 `"%02x".format`을 바이트마다 호출(루프 내 포매터 파싱)하는 자작 코드를 씀.
- 이펙티브 자바 **Item 1 "정적 팩터리 메서드"** — 공통 동작을 명명된 진입점으로.

**설계.**
- 신규 `shared/security/Sha256.kt` (object):
  - `fun hex(value: String): String` — UTF-8 → SHA-256 → 소문자 hex
  - `fun hex(bytes: ByteArray): String`
  - 내부 구현은 `HexFormat.of()` (기본이 소문자, padding 없음 → 기존 출력과 동일).
- 5개 호출부를 `Sha256.hex(...)`로 치환. `ClientIpHashing`은 `Sha256.hex(...).take(32)`.
- 각 파일의 private `sha256`/`sha256Hex` 제거.

**동작 보존.** `HexFormat.of().formatHex(bytes)` == `bytes.joinToString(""){"%02x".format(it)}`
(둘 다 소문자, 0-패딩, 구분자 없음). 단위 테스트에서 기존/신규 출력 byte-identical 어서션으로 고정.

### 5.2 [P2] AuditLogEntry 생성 중복 (AiGenerationOrchestrator 3곳)

**현상.** `AiGenerationOrchestrator`의 세 실패 경로
(`compensateQueuePublishFailure`, `failStart` 2개 오버로드)가 거의 동일한
`AuditLogEntry(...)`를 손으로 만든다. 매번 같은 0-값을 반복:
`item = null`, `usage = TokenUsage(0, 0, 0)`, `costEstimateUsd = BigDecimal.ZERO`,
`latencyMs = 0`, `kind = AuditKind.FULL`, `status = AuditStatus.FAILED`,
`createdAt = clock.instant()`.

**근거.**
- 클린코드: **DRY** + "함수는 한 가지만" — 실패 감사 로그 형태가 3곳에 박혀 있어
  필드가 추가되면 3곳을 고쳐야 함.
- 이펙티브 자바 **Item 1 "정적 팩터리 메서드"** — `AuditLogEntry.failed(...)` 같은
  의도 드러내는 팩터리로 "실패 감사 항목"을 표현.
- 이펙티브 자바 **Item 2** — 0-값 보일러플레이트는 기본값/팩터리로 흡수.

**설계.**
- `AuditLogEntry`에 companion 정적 팩터리 추가:
  `fun failed(jobId, sessionId, clubId, hostUserId, provider, model, transcriptSha256, errorCode, errorMessage, createdAt): AuditLogEntry`
  — 내부에서 0-값 필드와 `kind=FULL`, `status=FAILED`를 채움.
- orchestrator의 3개 생성 지점을 팩터리 호출로 축약.
- `cancel`의 감사 항목은 `kind=CANCEL`/`status=CANCELLED`로 형태가 달라 별도(`cancelled(...)`)
  팩터리로 분리하거나 현행 유지(설계상 선택지로 둠; 구현 문서에서 결정).

**동작 보존.** 생성되는 `AuditLogEntry` 필드 값이 1:1 동일. 순수 추출.

### 5.3 [P3] 긴 매개변수 목록 — Introduce Parameter Object 후보 선별

**현상.** `@Suppress("LongParameterList")`가 15곳. 일부는 DI 생성자
(예: `AiGenerationOrchestrator` 10개 의존성 — Spring 주입이라 그대로 두는 게 맞음),
일부는 명령/DTO/팩터리 시그니처다.

**근거.**
- 이펙티브 자바 **Item 2 "생성자에 매개변수가 많으면 빌더"** / 클린코드 "함수 인수는
  적게, 3개 이하 지향". Kotlin named/default args가 *호출부 가독성*은 완화하지만
  *응집 그룹*(예: 함께 움직이는 식별자 4종)은 파라미터 오브젝트가 더 정직.

**설계 — 이번 범위에서는 조사·분류만.**
- 15개 suppress를 (a) DI 생성자=유지, (b) 명령/DTO=파라미터 오브젝트 후보,
  (c) 내부 헬퍼=인라인/그룹화 후보 로 분류한 표를 구현 문서 부록에 남긴다.
- 실제 시그니처 변경은 **behavior-risk가 낮고 호출부가 적은 1~2개만** 후보로 제안하고,
  실 적용은 사용자 승인 후 별도 PR. (광범위 시그니처 변경은 회귀 위험 → 이번 스코프 제외.)

### 5.4 [P4] 예외 처리 위생 (EJ Item 76/77)

**현상.** `@Suppress("TooGenericExceptionCaught")` 13파일,
`@Suppress("SwallowedException")` 4곳. 대부분 **정당**하다:
- LLM 어댑터(`aigen/adapter/out/llm/**`) — 외부 provider 호출 경계에서 광범위 catch 후
  도메인 에러코드로 매핑(실패 격리). 올바른 패턴.
- 헬스 카드 provider(`admin/health/.../providers/*`) — 헬스 프로브는 throw하면 안 됨 →
  의도적 swallow.

**근거.**
- 이펙티브 자바 **Item 77 "예외를 무시하지 말라"** — 무시가 맞다면 *이유를 주석*으로
  남기고 변수명을 `ignored`로. **Item 76 "실패 원자성"** — 광범위 catch 후 상태 일관성.

**설계 — 동작 무변경, 위생만.**
- 각 광범위 catch/swallow 지점에 (이미 있는 곳 제외) **1줄 근거 주석**이 있는지 점검,
  없으면 추가. 무시되는 예외 변수는 `ignored`로 네이밍.
- `AiGenerationOrchestrator`의 큐 발행 실패 보상 로직(이미 상세 주석 있음)이 모범 사례
  → 동일 수준으로 정렬.

### 5.5 (참고, 구현 제외) enum 행위 부재

`SessionState`, `MembershipRole` 등은 순수 상수 enum이고 상태 전이는 별도
transition policy 클래스가 담당한다. 이펙티브 자바 Item 34/38 관점에서 전이 규칙을
enum 안으로 넣는 선택지가 있으나, **현재 정책 클래스 분리도 합리적**이며 재설계는
회귀 위험이 크다 → 이번 작업에서 **변경하지 않는다**. 기록만 남김.

## 6. 검증 전략

- 신규 유틸/팩터리마다 단위 테스트: 기존 출력과 byte-identical / 필드 1:1 동일.
- `./server/gradlew -p server clean test` (전체 서버 테스트 + ArchUnit + detekt).
- 공개 릴리스 안전: 새 코드에 실데이터/시크릿/로컬 경로 없음 — `./scripts/build-public-release-candidate.sh` 영향 없음(코드 한정).
- 각 PR은 독립 검증 가능(§ 구현 문서 Final Verification Matrix).

## 7. 리스크 & 완화

| 리스크 | 완화 |
| --- | --- |
| hex 출력 미세 차이(대문자/패딩) | byte-identical 단위 테스트로 고정, `HexFormat.of()` 기본=소문자 |
| 팩터리 추출 중 필드 누락 | data class 1:1 매핑 + 기존 테스트 통과 |
| P3 시그니처 변경 회귀 | 이번 스코프는 조사/분류만, 적용은 승인 후 별도 PR |
| ArchUnit 의존 방향 위반 | 유틸을 `shared`에 두어 모든 슬라이스에서 의존 허용 |
