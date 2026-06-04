# ReadMates M-1 — 멤버 리딩 경험: 진행 페이스 + 개인 독서 여정

작성일: 2026-06-04
상태: APPROVED DESIGN SPEC

## 1. 배경

Admin vNext closeout 이후 고도화 순서는 `2026-05-31-post-admin-vnext-enhancement-umbrella-design.md`가 **H → A → M → P**로 고정했다. H(하드닝 베이스라인)와 A(분석 심화)는 코드로 닫혔고, 다음은 M(멤버/호스트 제품 경험)이다. 엄브렐러 §5.3은 M의 구체 설계를 "자체 brainstorm → spec → plan" 사이클로 분리하라고 명시했다. 이 문서는 그 분리된 M 사이클의 첫 하위 표면인 **멤버 리딩 경험(M-1)**의 design spec이다.

closeout 동안 admin/ops/observability에 집중된 사이, 실제 사용자(멤버)의 읽기 루프는 골격(`shared/model/reading-loop.ts` + member-home next-action)만 갖춘 채 깊이가 얕았다. 이 spec은 그 루프의 두 축을 깊게 만든다: **(1) 현재 세션의 읽기 진행/페이스**, **(2) 개인 독서 여정(my-page)**. 사회적 상호작용 층과 회고 심화는 의도적으로 범위 밖이며, 필요 시 별도 M 하위 표면으로 분리한다.

## 2. Source Documents

- 직전 엄브렐러: `docs/superpowers/specs/2026-05-31-post-admin-vnext-enhancement-umbrella-design.md` (§5.3 M 경계)
- 아키텍처 source of truth: `docs/development/architecture.md`
- Frontend 가이드: `docs/agents/front.md`
- Design 가이드: `docs/agents/design.md`
- Server 가이드: `docs/agents/server.md`

## 3. 성공 기준

"화면이 늘었다"가 아니다.

- 멤버가 현재 세션에서 "마감까지 얼마 남았고 내가 어디쯤인지"를 한눈에 안다.
- 멤버가 my-page에서 자기 독서 여정(누적·완독·일관성·책별·타임라인)을 본다.
- 데이터가 얇아도 정직한 empty state를 유지하고 가짜 차트를 만들지 않는다.
- admin↔host 경계와 공개 저장소 안전을 깨지 않는다.
- 신규 인프라를 최소화하고 기존 계약·데이터를 최대한 재사용한다.

## 4. 범위 & 경계 (M-0 흡수)

엄브렐러 §5.3이 M에 요구한 "경계 고정"을 이 spec 안에서 핀한다. M-0을 별도 의식 문서로 분리하지 않는다.

### 4.1 건드릴 표면 (멤버 전용)

- `front/features/current-session` — 멤버 뷰에 진행 페이스 표시.
- `front/features/member-home` — 기존 next-action 메시지에 페이스 한 줄 통합(모델 확장).
- `front/features/archive`의 my-page (`ui/my-page/*`, `route/my-page-data.ts`, `model`) — 독서 여정 4뷰.

### 4.2 공유 계약

- 재사용: `shared/model/reading-loop.ts` (상태 파생), `shared/model/current-session-contracts.ts` (readingProgress·date).
- 신규: `shared/model/reading-pace.ts` (순함수 페이스 파생).
- 확장: `features/archive/api/archive-contracts.ts`의 `MyPageResponse` (완독 신호 집중 추가).

### 4.3 경계 보존

- **멤버 전용.** host/admin 표면·계약·라우트 변경 없음.
- admin↔host frontend boundary test는 변경 없이 통과해야 한다(이 작업은 그 경계를 건드리지 않음).
- 신규 서버 슬라이스 없음. 기존 my-page 읽기 경로만 확장.

### 4.4 Non-goals

- 사회적 상호작용 층(질문 답글·반응·하이라이트 쓰레딩) 금지.
- 회고(한줄평·서평) 자체의 심화 금지.
- host/admin 표면 또는 신규 CRUD 추가 금지.
- 차팅 인프라 도입 금지. 데이터가 얇을 때 가짜 차트 생성 금지.
- 멀티 클럽/멤버 비교·랭킹 등 사회적 비교 지표 금지(개인 여정에 한정).

## 5. Slice 1 — 현재 세션 진행 페이스 (프론트 전용)

### 5.1 동기

현재 체크인은 `readingProgress: number`(0–100 percent) 단일 스냅샷이고, "마감까지 남은 일수 대비 내가 어디쯤인지"라는 맥락이 없다. 현재 세션 계약에는 `date`(모임일=마감)와 `questionDeadlineAt`만 있고 *읽기 시작 기준점*은 없다. 따라서 "시작 대비 진척"이 아니라 **(마감까지 남은 일수 × 현재 진행%)의 티어**로 페이스를 표현한다. 이렇게 하면 신규 서버 필드 없이 정직한 맥락을 줄 수 있다.

### 5.2 신규 순함수 `shared/model/reading-pace.ts`

```text
type ReadingPaceTier = "COMPLETED" | "ON_TRACK" | "TIGHT" | "URGENT" | "AMPLE";

type ReadingPaceInput = {
  readingProgress: number;   // 0..100
  sessionDate: string | null; // YYYY-MM-DD (마감)
  today?: Date;
};

type ReadingPace = {
  tier: ReadingPaceTier;
  daysRemaining: number | null; // sessionDate 없으면 null
  label: string;
  message: string;
};

deriveReadingPace(input): ReadingPace
```

티어 규칙(초안 — plan 단계에서 경계값 고정):

- `COMPLETED`: `readingProgress >= 100`.
- `sessionDate`가 없거나 파싱 불가: `daysRemaining = null`, 진행%만 반영(임박 판단 불가 → `ON_TRACK`/`AMPLE` 중 진행%로 결정, URGENT/TIGHT 금지).
- `AMPLE`: 남은 일수가 많음(예: > 5일)이고 진행%가 합리적.
- `ON_TRACK`: 남은 일수 대비 진행%가 충분.
- `TIGHT`: 임박(예: ≤ 3일)인데 진행%가 중간(예: 50–80%).
- `URGENT`: 임박인데 진행%가 낮음(예: < 50%).

`reading-loop.ts`의 `isAfterSessionDate` 날짜 파싱 패턴을 재사용한다(같은 `YYYY-MM-DD` 로컬 날짜 규칙). 경계값(일수·% 임계)은 상수로 두고 단위테스트로 고정한다.

### 5.3 UI

- current-session 멤버 뷰: 체크인 영역 근처에 페이스 표시(배지 + 한 줄 메시지). 진행% 입력과 시각적으로 연결.
- member-home: 기존 `getMemberHomeNextReadingAction`의 메시지에 페이스 한 줄을 통합한다. 페이스는 next-action을 대체하지 않고 보강한다(루프 상태가 `MEMBER_PREP_REQUIRED`/`SESSION_READY`일 때만 의미 있음). 모델만 확장하고 새 라우트는 만들지 않는다.

### 5.4 서버·계약

- 변경 0. 페이스는 기존 `readingProgress`·`date`만으로 프론트에서 파생한다.

## 6. Slice 2 — 개인 독서 여정 (my-page, 4뷰)

### 6.1 가용 데이터 (현 상태)

my-page는 이미 다음을 fetch한다(`route/my-page-data.ts`):

- `MyPageResponse`: `joinedAt`, `sessionCount`(참석), `totalSessionCount`, `recentAttendances[]`(`sessionNumber`, `attended`).
- `MyArchiveQuestionPage`(내 질문: sessionNumber·bookTitle·date·text), `questionCount`.
- `MyArchiveReviewPage`(내 서평: sessionNumber·bookTitle·date·text), `reviewCount`.

### 6.2 4뷰 정의

1. **누적 요약**: 참여 세션 수(`sessionCount`/`totalSessionCount`), **완독한 책 수**(신규, §6.3), 작성 질문 수(`questionCount`), 회고 수(`reviewCount`).
2. **완독·참여 일관성**: 완독률(완독 세션 / 참여 세션, §6.3) + 출석 일관성(`recentAttendances`의 attended 비율·연속 흐름). 사회적 비교 없이 *자기* 일관성만.
3. **책별 히스토리**: `MyArchiveQuestion`/`Review`를 sessionNumber/bookTitle로 프론트 그룹핑 → 각 책에서 멤버 session detail(`/app/archive` 상세)로 이동. 기존 아카이브 라우트 재사용.
4. **최근 활동 타임라인**: 내 질문 + 내 회고를 `date` 기준 시간순 병합. 다음 행동 맥락 제공. (체크인은 누적 리스트가 없으므로 타임라인에서 제외하거나 §6.3 확장 데이터로 포함 여부를 plan에서 결정.)

### 6.3 서버 집중 확장 (접근 C)

여정의 유일한 신규 데이터 니즈는 **세션별 읽기 완독 여부**다. `recentAttendances.attended`는 *출석*이지 *완독*이 아니므로 대리값으로 쓰지 않는다(정직성).

`MyPageResponse` 확장(전체 신규 슬라이스 대신 기존 my-page 읽기 경로 확장):

- `recentAttendances[]` 항목에 `readingProgress: number`(또는 `readingCompleted: boolean`) 추가 — 해당 세션 멤버 체크인의 진행%. 체크인이 없으면 `0`/`false`.
- `completedReadingCount: number` 추가 — readingProgress가 100에 도달한(=완독) 세션 수.

완독 정의: **readingProgress === 100**. (체크인 진행%가 percent 0–100라는 기존 의미를 그대로 사용.)

계약 버전을 명시적으로 핀한다(예: 메트릭/응답 계약 노트). 비율·완독률 등 *파생*은 순수 프론트 view-model에서 계산하고 단위테스트한다. 서버는 원시 카운트/플래그만 반환한다.

### 6.4 프론트 파생

- 신규 순수 view-model(`features/archive/model/reading-journey-model.ts` 등): 4뷰를 위한 파생(완독률, 일관성, 책별 그룹, 타임라인 병합). 입력은 §6.1 데이터 + §6.3 확장. 순수·단위테스트.
- my-page UI(`ui/my-page/*`)에 여정 섹션 추가. 기존 calm operating-ledger 톤과 일관.

### 6.5 DEV Zod parser

- 확장된 `MyPageResponse`를 DEV 파서/계약 fixture에 반영(`front/tests/unit/__fixtures__` 가 서버에서 참조되면 함께 갱신).

## 7. 데이터 흐름 요약

```text
[현재 세션]
 readingProgress + date  ──(reading-pace.ts 순함수)──▶ ReadingPace ──▶ current-session UI / member-home 메시지

[my-page]
 MyPageResponse(+readingProgress/completedReadingCount)
   + MyArchiveQuestions + MyArchiveReviews
        ──(reading-journey-model 순수 파생)──▶ 4뷰(요약·일관성·책별·타임라인) ──▶ my-page UI
```

## 8. 하드닝 게이트 (H 베이스라인 상속)

엄브렐러 §6 공통 체크를 이 slice gate에 포함한다:

- **일관성**: my-page/current-session 카드 톤을 기존 멤버 표면과 정렬.
- **접근성**: 페이스 배지·여정 섹션의 aria 라벨, 키보드 포커스, 색 대비(상태 색만으로 의미 전달 금지 — 텍스트 동반).
- **모바일**: current-session 모바일 뷰·my-page 모바일(`my-mobile.tsx`)에서 검증.
- **Empty/에러**: 참여 0·체크인 없음·질문/회고 0일 때 정직한 empty("아직 기록이 없어요"). 분모 0이면 완독률 차트 대신 empty. 실패 카피는 안전(raw/private/token-shaped 노출 금지).

## 9. 아키텍처 원칙

- `docs/development/architecture.md` 준수: route-first 경계, BFF 비밀 미노출.
- 서버 변경(§6.3)은 controller → service → adapter 경계와 application-service-owned `@Transactional` 정책 유지.
- 파생 로직은 순수 함수/모델에 두고 단위테스트(reading-loop 패턴).
- admin↔host 경계 테스트 보존(이 작업은 멤버 전용이라 해당 경계를 건드리지 않음).
- 공개 저장소 안전: my-page는 self-only, 실 멤버 데이터·secret·private 경로 미노출.

## 10. 검증

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
- 신규 단위테스트: `reading-pace.test.ts`(티어 경계), `reading-journey-model` 테스트(완독률·일관성·그룹·타임라인 경계).
- Server: `./server/gradlew -p server clean test` — my-page 확장 통합테스트(완독 카운트·세션별 readingProgress) + contract fixture 정합.
- my-page loader 응답 shape이 바뀌므로 `pnpm --dir front test:e2e` 실행.
- 완료 시 CHANGELOG `Unreleased` 갱신과 `docs/development/release-readiness-review.md` 검토 적용.

## 11. 범위 밖 / 후속

- 사회적 상호작용 층(M의 다른 하위 표면 후보)은 별도 brainstorm.
- 호스트 운영 흐름(M-2)은 별도 spec(엄브렐러 §5.3 S9 패턴).
- 진행 이력(세션 내 추세 그래프), 페이지/챕터 단위 진행은 이번 범위 밖(이번엔 단일 % + 페이스 맥락으로 한정).
- 체크인 타임라인 포함 여부는 plan 단계에서 §6.3 확장 데이터 가용성에 따라 확정.
