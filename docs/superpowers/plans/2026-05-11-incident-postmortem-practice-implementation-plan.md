# Incident Post-mortem 실천 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/operations/postmortems/` 디렉토리를 신설하고, 인덱스 + 템플릿 + 첫 post-mortem (current-session refresh club context incident, 2026-05-11)을 작성한다. 코드 변경 없음. spec과 case study에 cross-link 추가.

**Architecture:** 문서만. spec(`2026-05-11-current-session-refresh-club-context-design.md`)에서 root cause 분석을 *재사용*하되, 시간 축 timeline / severity / action items로 재구조화한다.

**Tech Stack:** 마크다운만.

**Spec:** `docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md`

---

## File map

신규 작성:
- `docs/operations/README.md` — operations 문서 허브
- `docs/operations/postmortems/README.md` — post-mortem 인덱스 + 작성 규약
- `docs/operations/postmortems/template.md` — 템플릿
- `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md` — 첫 incident

수정:
- `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md` — 상단/하단에 post-mortem cross-link
- (case study plan과 통합 시) `docs/case-studies/03-multi-club-domain-platform.md` — incident 섹션이 post-mortem 링크
- `docs/development/README.md` — operations 진입점 링크 (선택)

수정 금지:
- 코드 (server/, front/).
- 다른 spec/plan 본문.

---

## Task 1: `docs/operations/` 디렉토리 + README

**Files:** 신규 `docs/operations/README.md`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p docs/operations/postmortems
```

- [ ] **Step 2: `docs/operations/README.md` 작성**

```markdown
# Operations

ReadMates 운영 관련 문서를 모은 진입점입니다. 배포 절차는 `docs/deploy/`, 개발 절차는 `docs/development/`를 참조하세요.

## 하위 문서

- [Post-mortems](postmortems/README.md) — 발생한 incident의 회고 기록.

## 후속 (TBD)

- Observability 가이드 (`observability/`) — Prometheus 메트릭, 대시보드, alert 룰. 별도 plan에서.
- Runbook (`runbooks/`) — 정기 운영 절차 (secret rotation, DB backup 등). 후속.
```

- [ ] **Step 3: 검증**

```bash
ls docs/operations/
ls docs/operations/postmortems/
```

기대: README.md (operations) 존재, postmortems/ 비어있음.

---

## Task 2: Post-mortem 템플릿 + 인덱스 작성

**Files:** 신규 `docs/operations/postmortems/template.md`, `docs/operations/postmortems/README.md`

- [ ] **Step 1: `template.md` 작성**

spec의 "Post-mortem 템플릿" 섹션 그대로 사용. 파일 최상단에:

```markdown
> 새 post-mortem 작성 시 이 파일을 `YYYY-MM-DD-<short-slug>.md`로 복사한 뒤 채우세요. 인덱스(`README.md`)도 함께 갱신합니다.
```

- [ ] **Step 2: `README.md` (인덱스) 작성**

```markdown
# Post-mortems

ReadMates에서 발생한 운영 incident의 회고 기록입니다. *blameless* 원칙을 따르며, 시간 축에 따라 탐지→완화→영구 수정→회고를 기록합니다.

새 post-mortem은 [`template.md`](template.md)를 복사해 작성합니다.

## 작성 규약

(spec의 "작성 규약" 섹션 그대로 — Blameless / 사실 기반 / Sanitization / Action item / 상태 갱신)

## Severity 정의

(spec의 "Severity 정의" 표 그대로)

## Severity 트리거 매핑

(spec의 "Severity 트리거 매핑" 표 그대로)

## 인덱스

| 일자 | Severity | 제목 | 상태 |
|------|---------|------|------|
| 2026-05-11 | SEV2 | [Current session refresh — club context degradation in production](2026-05-11-current-session-refresh-club-context.md) | Closed |
```

- [ ] **Step 3: 검증**

```bash
ls docs/operations/postmortems/
```

기대: `README.md`, `template.md` 2개.

```bash
grep -E "^\| 20" docs/operations/postmortems/README.md
```

기대: 1행 (incident 1).

---

## Task 3: Incident 1 — Current session refresh 작성

**Files:** 신규 `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`

이 task는 spec(`2026-05-11-current-session-refresh-club-context-design.md`)의 root cause 분석을 *재구조화*한다. 동일 분석을 복사하지 말고, spec을 *링크*하면서 timeline / severity / action item을 추가한다.

- [ ] **Step 1: 사실 확인 (시각/PR/commit)**

```bash
git log --all --oneline --since="2026-05-10" --until="2026-05-12" -- front/features/current-session/route/current-session-route.tsx front/tests/unit/current-session.test.tsx
git log -1 --pretty=format:"%h %s %ci" -- docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md
```

이 출력에서 commit hash, 시각을 timeline에 사용한다. 시각이 명확하지 않으면 *추정* 마크 (`추정:`)로 표기.

- [ ] **Step 2: 헤더와 메타 정보 작성**

```markdown
# Post-mortem — Current session refresh가 production에서만 빈 상태로 collapse

- 발생일시: 2026-05-11 (HH:MM 추정, KST)
- 탐지일시: 2026-05-11 HH:MM KST (본인 시연 중)
- 완화일시: 2026-05-11 HH:MM KST (PR `<hash>` merge)
- 영구 수정일시: 2026-05-11 HH:MM KST (배포 완료)
- Severity: SEV2
- 영향 범위: production 사이트(`readmates.pages.dev`)의 모든 클럽에서 멤버가 current session route에서 mutation을 수행한 직후 페이지가 빈 상태로 collapse. 데이터는 안전. 우회: 페이지 새로 진입.
- 작성자: kws
- 상태: Closed
- 관련:
  - Spec: `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`
  - Plan: `docs/superpowers/plans/2026-05-11-current-session-refresh-club-context-implementation-plan.md`
  - Case study: `docs/case-studies/03-multi-club-domain-platform.md`
  - ADR (해당 시): ADR-0008
```

- [ ] **Step 3: TL;DR**

```markdown
## TL;DR

Production에서만 current session route의 silent background refresh가 `clubSlug`를 잃고 호출되어, BFF가 host 헤더로 club을 lookup → shared fallback domain은 club_domains에 없어 unscoped → server가 degraded auth로 응답 → 클라이언트가 빈 상태로 fallback. dev에서는 Vite proxy가 host 헤더를 strip하므로 재현 안 됨. 영구 수정은 refresh handler에서 `useParams()`로 slug를 명시 전달.
```

- [ ] **Step 4: "영향" 섹션**

```markdown
## 영향

- 사용자 영향: 모든 클럽의 멤버가 current session route에서 reading progress 저장, RSVP, 질문/한줄평 작성을 한 직후 페이지가 "아직 열린 세션이 없습니다" 빈 상태로 collapse. 페이지 새로 진입 시 정상 복구. 데이터 손실 없음.
- 데이터 영향: 없음. mutation은 정상 commit (HTTP 200, MySQL row 기록 확인).
- 매출/계약/SLA 영향: 해당 없음 (운영 SLA 미정).
- 내부 리소스: 발견 → spec → plan → 수정 → 배포 약 <시간> (실측치는 commit timestamp로 보강).
```

- [ ] **Step 5: "Timeline" 섹션**

git log 결과를 기반으로 정확한 시각을 채움:

```markdown
## Timeline (KST)

| 시각 | 이벤트 |
|------|--------|
| HH:MM | 본인 시연 중 reading progress 저장 → 빈 상태 collapse 발견 |
| HH:MM | 재현 절차 확립. dev 환경에서 미재현 확인 |
| HH:MM | Network panel + server log 확인 → `/api/auth/me` 요청에 `clubSlug` 누락 확인 |
| HH:MM | BFF 호스트 헤더 정책과 server `ClubContextResolver` 동작 추적 → root cause 식별 |
| HH:MM | Spec 작성 시작 |
| HH:MM | Plan 작성, 수정 PR 생성 |
| HH:MM | Production 배포 완료 |
| HH:MM | Manual repro로 빈 상태 미발생 확인 → Closed |
```

(시각이 commit log에서 일부만 확인 가능하면 명확한 시각만 적고 `추정:` 표기는 별도.)

- [ ] **Step 6: "탐지" 섹션**

```markdown
## 탐지

- 본인 시연 중 발견. 사용자 보고 전.
- 운영 alert 없음 (해당 metric/alert 미구축).
- 더 빨리 탐지할 수 있었는가:
  - production E2E smoke가 club-scoped path에서 mutation→refresh 흐름을 커버했다면 배포 전 탐지 가능. 현재 e2e는 dev-login 플로우 위주.
  - frontend error reporting (Sentry 등) 미구축 — auth degraded fallback이 사용자 측에서 발생하지만 서버에는 정상 응답으로 기록됨.
```

- [ ] **Step 7: "Root cause" 섹션**

```markdown
## Root cause

### 코드/시스템 차원

`front/features/current-session/route/current-session-route.tsx`의 refresh handler가 `useParams()` 없이 `loadCurrentSessionRouteData()`를 인자 없이 호출. 이는 `loadMemberAppAuth(undefined)` → `readmatesFetch`에 `{ clubSlug: undefined }` 명시 전달 → `readmatesApiPath`의 `hasOwnProperty("clubSlug")` 체크가 *명시적 undefined*를 "no club scope"로 해석 (platform-admin 페이지 의도적 동작) → URL fallback `currentAppClubSlug()` 우회 → `/api/bff/api/auth/me` 요청에 `clubSlug` 쿼리 누락.

production BFF (`front/functions/api/bff/[[path]].ts`)는 `X-Readmates-Club-Host: readmates.pages.dev`를 항상 첨부. server `ClubContextResolver`는 slug 없으면 host로 lookup → `JdbcClubContextAdapter.loadByHostname` → `club_domains` 테이블에 `readmates.pages.dev`는 path-routed shared fallback이라 `status = ACTIVE` row 없음 → null context.

`AuthMeController`는 `supplied=true && context=null`인 경우 degraded auth response (membershipStatus 없음)를 반환. `canUseMemberApp(auth)`가 false → `loadCurrentSessionRouteData`가 `{ currentSession: null }`로 short-circuit → 빈 상태 렌더.

상세 분석은 spec 본문 (위 링크) 참조.

### 프로세스/조직 차원

- dev/prod BFF 동작 parity가 자동 검증되지 않음. Vite proxy(dev)는 host 헤더 strip, Pages function(prod)은 항상 첨부. 이 차이가 잠재적 production-only bug class.
- BFF host 헤더 정책의 risk가 ADR/case study에 사전 기록되지 않음. shared fallback domain에서 host 헤더가 의미 있는 정보가 아닌데도 항상 전송하는 정책의 의도가 코드 외부에 명시되지 않음.
- production smoke가 club-scoped mutation→refresh를 커버하지 않음.
```

- [ ] **Step 8: "완화" 섹션**

```markdown
## 완화 (단기 조치)

탐지 직후 영구 수정과 단기 조치를 분리하지 않고 한 번에 영구 수정 PR로 진행. 우회는 사용자에게 안내 가능 (페이지 새로 진입)했으나, 영향 범위가 모든 클럽 + 모든 멤버라 *분 단위 즉시 수정*이 더 작은 비용으로 판단.
```

- [ ] **Step 9: "영구 수정" 섹션**

```markdown
## 영구 수정

`front/features/current-session/route/current-session-route.tsx`에서 `useParams()`로 slug를 가져와 `loadCurrentSessionRouteData({ params })`로 명시 전달. 이펙트 dependency에 `params` 추가로 stale closure 방지. 회귀 테스트 추가:

- `front/tests/unit/current-session.test.tsx` — club-scoped path에서 mount → refresh dispatch → 모든 `/api/sessions/current` 요청이 `clubSlug=reading-sai`를 포함하는지 검증.

상세 변경은 spec/plan 참조.
```

- [ ] **Step 10: "검증" 섹션**

```markdown
## 검증

- Pre-fix manual repro: production에서 reading progress 저장 → 빈 상태 발생.
- Post-fix:
  - `pnpm --dir front test` — 신규 회귀 테스트 green, 기존 "keeps current session visible on refresh failure" 유지.
  - `pnpm --dir front test:e2e` — current-session 시나리오 통과.
  - Production 배포 후 manual repro — 페이지 유지, "저장됨" 배지 표시.
```

- [ ] **Step 11: "Lessons learned" 섹션**

```markdown
## Lessons learned

**잘 한 것**
- 재현 → root cause → spec → 수정 → 배포가 같은 날 안에 closed.
- Spec 작성 시 dev/prod 차이를 표로 명시 → 후속 ADR 후보가 자연스럽게 도출.
- 회귀 테스트가 *failing-first*로 작성됨 (TDD 패턴 유지).

**못 한 것**
- dev/prod parity 자동 검증 없음. Vite proxy와 Pages function의 헤더 변환이 동등한지 확인하는 테스트 부재.
- BFF 정책 risk가 ADR/case study에 사전 기록되지 않음 — 동일 클래스의 production-only bug가 다른 라우트에서도 잠복할 수 있음.
- 운영 alert 미구축 — 탐지가 우연.

**운이 좋았던 것**
- 본인 시연 중 발견. 사용자 영향 시간 짧음.
- 우회 (페이지 새로 진입) 가능했으므로 SEV1으로 격상되지 않음.
```

- [ ] **Step 12: "Action items" 섹션**

```markdown
## Action items

| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | dev/prod BFF 헤더 parity test 추가 (Vite proxy와 Pages function이 동일 입력에 동일 헤더를 생성함을 검증) | P1 | front | Open | TBD |
| 2 | BFF host 헤더 정책 ADR 후속 작성 — shared fallback domain일 때 host 헤더 미전송 | P2 | docs | Open | TBD |
| 3 | 다른 라우트의 refresh path가 동일 패턴을 사용하는지 grep audit | P3 | front | Open | TBD |
```

(트래킹은 issue/PR이 생기면 갱신.)

- [ ] **Step 13: "Severity rationale" 섹션**

```markdown
## Severity rationale

SEV2로 분류:
- 사용자 영향이 *전 사용자*에 미치지만 (SEV1 후보), 우회(페이지 새로 진입)가 명확하고 데이터 손실 없음.
- 핵심 사용자 흐름(reading progress 저장)에서 발생하지만 mutation 자체는 성공.
- SEV3은 부적절 — 우회가 사용자에게 *직관적이지 않음*. 화면 메시지가 "아직 열린 세션이 없습니다"라 사용자는 자신의 mutation이 실패했다고 오인할 가능성.
```

- [ ] **Step 14: 검증**

```bash
grep -c "^## " docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md
```

기대: 11 이상 (TL;DR/영향/Timeline/탐지/Root cause/완화/영구 수정/검증/Lessons learned/Action items/Severity rationale).

```bash
./scripts/public-release-check.sh
```

기대: 통과. 본문에 실제 OCID/secret/실명 노출 없는지 manual scan.

---

## Task 4: spec에 post-mortem cross-link 추가

**Files:** 수정 `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`

- [ ] **Step 1: 상단 메타 박스에 link 추가**

기존 spec의 첫 메타 블록 (`Status:` `Owner:` `Last updated:`) 직후에 한 줄 추가:

```markdown
Post-mortem: [docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md](../../operations/postmortems/2026-05-11-current-session-refresh-club-context.md)
```

(상대 경로는 spec 파일 위치에서 정확하게.)

- [ ] **Step 2: 검증**

```bash
grep "Post-mortem:" docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md
```

기대: 1행 매칭.

---

## Task 5: case study 03와의 cross-link

**Files:** 수정 `docs/case-studies/03-multi-club-domain-platform.md` (case study plan과 함께 실행될 때만)

- [ ] **Step 1: case study 03가 존재하는가 확인**

```bash
test -f docs/case-studies/03-multi-club-domain-platform.md && echo "EXISTS" || echo "NOT YET"
```

존재하지 않으면 case study plan 실행 후 다시 시도. case study plan의 Task 4 Step 10에서 이미 post-mortem 링크를 본문에 적도록 안내함 — 두 plan이 통합되면 별도 수정 불필요.

- [ ] **Step 2: 존재한다면 link 검증**

```bash
grep "operations/postmortems/2026-05-11-current-session-refresh-club-context" docs/case-studies/03-multi-club-domain-platform.md
```

기대: 1행 매칭.

---

## Task 6: 최종 검증

- [ ] **Step 1: 파일 구조 확인**

```bash
ls docs/operations/
ls docs/operations/postmortems/
```

기대:
- `docs/operations/`: README.md, postmortems/
- `docs/operations/postmortems/`: README.md, template.md, 2026-05-11-current-session-refresh-club-context.md

- [ ] **Step 2: 인덱스 ↔ 본문 정합**

```bash
grep -oE "\[.*?\]\(2026-.*?\.md\)" docs/operations/postmortems/README.md | while read row; do
  file=$(echo "$row" | sed -E 's/.*\((.*)\)/\1/')
  test -f "docs/operations/postmortems/$file" && echo "OK: $file" || echo "MISSING: $file"
done
```

기대: 모두 OK.

- [ ] **Step 3: Public release 검증**

```bash
./scripts/public-release-check.sh
./scripts/verify-public-release-fixtures.sh
```

기대: 모두 통과.

- [ ] **Step 4: Sanitization manual scan**

```bash
grep -iE "(@gmail\.com|@naver\.com|@daum\.net|ocid1\.|192\.168\.|10\.0\.0\.|[/]Users[/]|[/]home[/])" docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md
```

기대: no match. 매치 시 placeholder로 교체.

- [ ] **Step 5: 커밋 분리 가이드**

post-mortem 작성과 코드 변경은 같은 커밋에 섞지 않는다. 단일 docs 커밋:

```text
docs(ops): introduce post-mortem practice; add 2026-05-11 current-session refresh post-mortem
```

(실제 커밋은 사용자 요청 시에만.)

---

## 위험과 완화 (실행 시점)

| 위험 | 완화 |
|------|------|
| commit timestamp만으로 정확한 시각 확보 어려움 | `추정:` 표기로 솔직히. 정확한 분 단위는 incident 가치를 손상하지 않음. |
| Action item이 영원히 Open | item 3개 이내. 다음 라운드에서 PR/issue 링크로 closed 처리. |
| Spec과 본문이 사실 차이를 가짐 | spec을 *링크*하고 본문은 timeline/severity/lessons에 집중. spec 본문을 복사하지 않음. |
| Sanitization 누락 | Task 6 Step 4의 manual grep + public-release-check 강제. |
| Severity 판단의 자의성 | Severity rationale 섹션 필수. 향후 incident에서도 동일 규약. |

---

## 완료 조건

- [ ] `docs/operations/`와 `docs/operations/postmortems/` 디렉토리 생성.
- [ ] README + template + incident 1 post-mortem 작성 완료.
- [ ] post-mortem 인덱스에 incident 1 등록.
- [ ] spec(`2026-05-11-current-session-refresh-club-context-design.md`)에 post-mortem cross-link.
- [ ] case study 03 (case study plan과 통합 시) 본문이 post-mortem을 link.
- [ ] `./scripts/public-release-check.sh` + sanitization manual scan 통과.
