# Member/Host Reading Loop + Showcase Polish

작성일: 2026-05-31
상태: APPROVED DESIGN SPEC

## 1. 배경

Admin vNext closeout 이후 `/admin` 표면은 모두 ready 상태가 되었고, H 슬라이스로 admin 전 라우트와 host dashboard에 하드닝 베이스라인이 적용되었다. 다음 고도화 후보 중 사용자는 B(멤버/호스트 제품 경험)와 C(공개 포트폴리오/showcase)를 함께 다루는 스펙을 요청했다.

기존 post-admin vNext 엄브렐러는 P(S10 공개 포트폴리오)를 마지막으로 둔다. 이 스펙은 그 원칙을 유지한다. 즉, showcase를 먼저 꾸미는 것이 아니라 **host 운영 흐름과 member 읽기 흐름을 먼저 연결**하고, 그 결과를 public-safe evidence로 설명한다.

## 2. 목표

이 스펙의 목표는 "화면을 더 추가한다"가 아니다. 호스트와 멤버가 같은 세션 상태를 서로 다른 말로 해석하지 않게 하고, 운영 행동이 멤버의 읽기 준비와 회고로 자연스럽게 이어지게 만드는 것이다.

성공 기준:

- Host dashboard가 "이번 모임을 정상적으로 진행하거나 마감하기 위해 지금 닫아야 할 것"을 더 선명하게 보여준다.
- Member home/current-session이 같은 세션 맥락을 "내가 다음에 해야 할 읽기 행동"으로 보여준다.
- Host/member가 공유하는 세션 상태는 role-safe 파생값으로 표현되며 admin-only 신호를 노출하지 않는다.
- Showcase 문서는 이 제품 루프를 실제 데이터 없이 sanitized evidence로 설명한다.

## 3. 선택한 접근

선택한 접근은 **운영-읽기 연결 스펙**이다.

흐름:

```text
Host dashboard
  -> role-safe session signal
  -> Member home / Current session
  -> Archive / Notes
  -> Showcase evidence
```

대안으로 host 중심 또는 showcase 중심 접근을 검토했지만, host 중심은 멤버 제품 경험 고도화가 약하고 showcase 중심은 실제 제품 개선이 얇다. 따라서 host 운영 행동과 member 읽기 행동을 하나의 loop로 묶고, showcase는 마지막 산출물로 둔다.

## 4. 범위

주요 구현 표면:

- `front/features/host`: host dashboard의 다음 운영 행동, 현재/예정 세션, 누락 멤버, 알림/기록 상태 표현.
- `front/features/member-home`: member home의 다음 읽기 행동, 현재 세션 진입, 예정 세션/노트 연결.
- `front/features/current-session`: RSVP, 읽은 분량, 질문, 한줄평, 서평의 저장/진행 상태와 next action 정렬.
- `front/features/archive`: 기록 공개 이후 archive/notes로 이어지는 연결.
- `front/shared/model` 또는 `front/shared/ui`: host/member가 같이 써도 안전한 작은 role-safe 상태 모델이나 presentation primitive.
- `docs/showcase`와 README reviewer entry: public-safe walkthrough와 evidence 설명.

Non-goals:

- admin support grant, notification replay, platform-only 운영 명령을 host/member로 내리지 않는다.
- 새 대형 CRUD 기능을 끼워 넣지 않는다.
- showcase 때문에 guest 권한을 넓히지 않는다.
- 실제 멤버 데이터, private domain, secret, token-shaped 예시, local path를 문서에 넣지 않는다.
- 기존 `docs/superpowers/specs/2026-05-31-post-admin-vnext-enhancement-umbrella-design.md`를 덮어쓰거나 historical plan을 수정하지 않는다.

## 5. 사용자 흐름

### 5.1 Host: 다음 운영 행동

Host dashboard는 운영 신호를 카드 나열로 끝내지 않고 "지금 닫을 일"로 정리한다.

예시:

- 현재 세션이 없으면 새 세션 생성 또는 예정 세션 시작.
- 예정 세션이 멤버에게 보이지 않으면 공개 범위 확인.
- RSVP 미응답이나 누락 멤버가 있으면 멤버 상태 정리.
- 모임 후 기록/피드백이 남았으면 마감 또는 발행 연결.
- 알림 실패나 AI 실패 신호는 host에게 필요한 수준으로만 보여주고, platform admin 전용 복구 명령은 노출하지 않는다.

### 5.2 Shared: 역할별 세션 신호

Host 화면에서 계산한 내부 상태를 member 화면에 직접 import하지 않는다. 필요한 경우 `front/shared/model/reading-loop.ts` 같은 작은 모델을 둔다.

초기 후보 상태:

- `NO_SESSION`: 현재 세션이 없음.
- `HOST_SETUP_REQUIRED`: 호스트가 세션, 멤버, 미팅 정보, 공개 범위 중 하나를 닫아야 함.
- `MEMBER_PREP_REQUIRED`: 멤버가 RSVP, 읽은 분량, 질문을 준비해야 함.
- `SESSION_READY`: 운영과 멤버 준비가 큰 문제 없이 진행 가능.
- `REFLECTION_DUE`: 참석 후 한줄평, 서평, 기록 정리가 남음.
- `ARCHIVE_AVAILABLE`: 기록, 노트, 아카이브로 이어질 수 있음.

이 모델은 "역할별 다음 행동을 고르기 위한 파생 상태"이지 서버 source of truth가 아니다.

### 5.3 Member: 다음 읽기 행동

Member home/current-session은 운영 내부 상태를 설명하지 않고 멤버의 행동만 보여준다.

예시:

- RSVP가 없으면 RSVP를 우선한다.
- 읽은 분량이 없으면 체크인으로 연결한다.
- 질문이 없거나 deadline이 가까우면 질문 작성을 연결한다.
- 참석 후에는 한줄평/서평으로 연결한다.
- 기록이 공개되면 archive 또는 notes로 이어진다.

Viewer나 suspended member는 기존 permission copy를 유지한다. 정식 멤버에게만 쓰기 action을 열고, 제한 상태는 "왜 불가능한지"를 짧게 설명한다.

### 5.4 Showcase: public-safe evidence

Showcase는 private workflow를 열지 않는다. 대신 다음을 설명한다.

- 로그인 없이 볼 수 있는 public route.
- host/member loop는 권한상 비공개라는 사실.
- 어떤 테스트, architecture doc, case study, sanitized screenshot 또는 fixture로 확인할 수 있는지.
- public release safety가 어떤 자료를 제외하는지.

## 6. 아키텍처 경계

기존 route-first 프런트엔드 경계를 따른다.

```text
src/app -> src/pages -> features -> shared
```

Feature 내부는 가능한 한 `api`, `queries`, `model`, `route`, `ui` 경계를 유지한다.

- `model`: role-safe 상태 파생, next action 계산, copy 선택.
- `route`: loader/action, query seeding, mutation invalidation, UI prop 조립.
- `ui`: props/callback 기반 렌더링. API client, query, route import 금지.
- `shared/model`: host/member 양쪽에서 안전하게 공유되는 작은 enum/helper만 둔다.
- `shared/ui`: feature-neutral presentation primitive만 둔다.

Admin과 host의 직접 import 차단은 유지한다. Host/member 공유를 위해 admin source를 끌어오지 않는다.

서버 API는 기존 payload로 부족한 경우에만 추가한다. 추가가 필요하면 mutation보다 read-only projection을 먼저 검토하고, public-safe response contract와 route/server tests를 함께 둔다.

## 7. 에러 처리

에러는 loop 전체를 blank 처리하지 않고 표면별로 격리한다.

- Host dashboard의 필수 데이터(auth/current/dashboard)는 route-level failure가 가능하다.
- 알림 요약, club operations 같은 보조 운영 신호는 card-local unavailable 상태로 둔다.
- Member current-session 저장 실패는 기존 inline save status 패턴을 유지한다.
- Archive/notes 연결 실패는 해당 카드 또는 섹션에만 "나중에 다시 확인" 상태를 보여준다.
- Showcase 문서는 제한 상태를 제품 기능처럼 과장하지 않고 권한상 비공개임을 명확히 쓴다.

실패 copy는 provider raw error, private data, token-shaped 예시, email body, internal stack detail을 노출하지 않는다.

## 8. UI 방향

ReadMates의 기존 톤을 유지한다.

- Host는 "효율적인 operating ledger" 느낌을 유지한다.
- Member는 "개인 reading desk" 느낌을 유지한다.
- Showcase는 product marketing page가 아니라 reviewer-facing guide로 유지한다.

UI 원칙:

- 새로운 대형 hero나 마케팅 섹션을 만들지 않는다.
- 액션은 역할별로 명확히 이름 붙인다.
- 모바일 360px에서 host/member 핵심 action이 사라지지 않게 한다.
- empty/error 상태는 `role="status"` 또는 `role="alert"`가 필요한 경우 접근성 표면을 갖춘다.
- 버튼과 링크에는 접근 가능한 이름을 둔다.

## 9. Showcase 산출물

Showcase 변경은 제품 루프 개선 후 적용한다.

후보 산출물:

- `docs/showcase/guest-mode-walkthrough.md`: public/private 경계와 member/host loop evidence 연결 보강.
- `docs/showcase/operational-proof.md`: 제품 루프가 release/readiness/public-safety와 연결되는 방식 보강.
- `docs/showcase/engineering-confidence.md`: route/model/ui 경계, query seeding, E2E 또는 unit coverage 설명 보강.
- `README.md`: "How to Review This Project" 진입점이 stale하면 갱신.
- 필요하면 `docs/showcase/member-host-reading-loop.md`를 새로 만든다. 단, 기존 showcase 문서에 자연스럽게 흡수되면 새 문서를 만들지 않는다.

Showcase는 코드와 테스트를 대체하지 않는다. 현재 동작의 source of truth는 코드, tests, scripts, migrations, `docs/development/architecture.md`다.

## 10. 검증

기본 검증:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Route-heavy 또는 user-flow 변경:

```bash
pnpm --dir front test:e2e
```

Docs/showcase 변경:

```bash
git diff --check -- <changed-docs>
```

Public-facing showcase 변경:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Cross-surface 영향 분석이 필요하면 scoped `graphify query`로 후보 파일을 좁히고, 실제 코드와 테스트로 확인한다. `graphify-out/` 산출물은 커밋하지 않는다.

## 11. 완료 기준

- Host와 member가 같은 세션 상태를 서로 다른 의미로 말하지 않는다.
- Host/member 사이에 직접 import cycle이나 admin-only 신호 누출이 없다.
- Empty/error 상태가 화면 전체를 불필요하게 blank 처리하지 않는다.
- Viewer/suspended/host/member role 제한이 기존 권한 모델과 일치한다.
- Showcase는 현재 코드, 테스트, 문서와 맞고 public-safety 기준을 통과한다.
- CHANGELOG `Unreleased`에 사용자-facing 또는 reviewer-facing 변경이 반영된다.

## 12. 후속 계획

이 스펙의 다음 산출물은 별도 implementation plan이다. 계획은 제품 루프 개선과 showcase polish를 순서대로 나누되, 한 PR 또는 한 실행 묶음으로 닫을 수 있을 만큼 작게 유지한다.

Implementation plan은 다음을 포함해야 한다.

- 기존 host/member model과 UI에서 next action 계산을 어디에 둘지 확정.
- 새로운 shared model이 정말 필요한지 재검토.
- route/unit/E2E coverage 범위.
- showcase public-safety scan 범위.
- CHANGELOG와 release-readiness 확인.
