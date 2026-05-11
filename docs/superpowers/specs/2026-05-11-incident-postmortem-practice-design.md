# Incident Post-mortem 실천 설계

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: docs / portfolio · operations

## 목적

ReadMates에 운영 incident를 기록하는 표준 post-mortem 실천을 도입한다. 1순위 독자는 *"이 사람이 운영 incident에 어떻게 반응하는가"*를 보고 싶은 시니어 면접관, 2순위는 향후 합류할 동료. 첫 라운드는 디렉토리 + 템플릿 + 이미 발생한 incident 1~2건을 sanitized post-mortem으로 backfill한다.

기존 코드/문서에는 spec(설계)과 plan(실행)은 풍부하지만 **운영 incident 기록**이 없다. 이는 *production을 운영하지 않는 후보*와 *운영하지만 기록을 안 하는 후보*가 표면적으로 같아 보이는 약점이다. 본 작업은 그 gap을 채운다.

## 현재 맥락

### 이미 존재하는 것

- `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md` — incident root cause를 spec 양식으로 매우 상세히 분석한 문서. *spec*이지만 내용은 사실상 post-mortem.
- `CHANGELOG.md` — 릴리즈별 변경 사항. incident 회고 형식은 아님.
- `docs/superpowers/specs/2026-05-09-public-repo-hygiene-remediation-spec.md`, `docs/superpowers/plans/2026-05-09-security-history-rewrite-detailed-execution.md` — 보안 이력 rewrite. 광의의 incident response.

### 빠진 것

- 표준 post-mortem 포맷 (Severity / Impact / Timeline / Detection / Root cause / Resolution / Lessons learned / Action items).
- *시간 축*에 따른 incident response 서사 (탐지→분류→진단→완화→영구 수정→회고).
- 회고 결과가 코드/테스트/runbook으로 어떻게 환류되었는지 추적.
- 면접관 친화적 단일 진입점 (`docs/operations/postmortems/`).

### 후보 incident 2건

#### Incident 1 — Current session refresh가 production에서만 빈 상태로 collapse (2026-05-11, S2)

이미 spec(`2026-05-11-current-session-refresh-club-context-design.md`)에 root cause 분석이 풍부하게 있어 *post-mortem 양식으로 재구조화*만 하면 된다. 운영 사용자에게 영향 발생, dev에서는 재현 안 됨, BFF 정책 + frontend refresh path가 만나는 지점이라 post-mortem 가치가 매우 높음.

#### Incident 2 — Public 저장소로 secret이 commit history에 남아있던 사례 (2026-05-09 무렵)

`docs/superpowers/plans/2026-05-09-security-history-rewrite-detailed-execution.md`가 history rewrite 실행 계획을 담고 있다. *어떤 secret이 어디에 있었는지*는 sanitization 필요. **포트폴리오로서는** "secret leak이 있었음"을 솔직히 적고 *발견→대응→재발 방지*를 보여주는 것이 강한 신호. 단 sanitization 룰을 엄격히 지켜 실제 secret value/패턴은 절대 노출 금지.

이 케이스는 spec/plan 작성자가 *공개 가능한 수준의 sanitization을 어디까지 할지* 별도 판단이 필요하므로, 첫 라운드에서는 **incident 1만 작성하고 incident 2는 후속**으로 한다.

## 결정

### 디렉토리 구조

```text
docs/operations/
  README.md                                       # operations 문서 허브
  postmortems/
    README.md                                     # post-mortem 인덱스 + 작성 규약
    template.md                                   # post-mortem 템플릿
    2026-05-11-current-session-refresh-club-context.md
```

### Post-mortem 템플릿

```markdown
# Post-mortem — <짧은 incident 제목>

- 발생일시: YYYY-MM-DD HH:MM (TZ)
- 탐지일시: YYYY-MM-DD HH:MM (TZ)
- 완화일시: YYYY-MM-DD HH:MM (TZ)
- 영구 수정일시: YYYY-MM-DD HH:MM (TZ) (해당 시)
- Severity: SEV1 | SEV2 | SEV3 | SEV4
- 영향 범위: <서비스/사용자/데이터>
- 작성자: <역할>
- 상태: Draft | Reviewed | Closed
- 관련: <ADR/spec/plan/PR/commit 링크>

## TL;DR

(2~3문장. 무엇이, 왜, 어떻게 끝났는지.)

## 영향

- 사용자 영향:
- 데이터 영향:
- 매출/계약/SLA 영향: (해당 시)
- 내부 리소스 (대응 시간):

## Timeline

| 시각 (KST) | 이벤트 |
|-----------|--------|
| HH:MM | ... |
| HH:MM | ... |

## 탐지

- 어떻게 알게 되었나 (사용자 보고 / alert / 본인 시연 등).
- 탐지까지 걸린 시간.
- 더 빨리 탐지할 수 있었는가 (alert/모니터링 gap).

## Root cause

(*5 whys* 또는 동등한 분석. 코드/설정/사람/프로세스 다층 분석.)

### 코드/시스템 차원

(파일 path:line, 데이터 흐름, 잘못된 가정.)

### 프로세스/조직 차원

(이 incident가 *발생할 수 있었던 환경*에 대한 분석. 예: dev/prod parity 검증 부재, 회귀 테스트 누락 등.)

## 완화 (단기 조치)

(완화 단계의 행동들. 영구 수정 전.)

## 영구 수정

(코드/설정 변경. spec/plan/PR 링크.)

## 검증

(영구 수정이 동작함을 어떻게 확인했나. 테스트/manual repro/모니터링.)

## Lessons learned

- 잘 한 것:
- 못 한 것:
- 운이 좋았던 것:

## Action items

| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | ... | P1 | ... | Open / Done | <PR/issue> |

## Severity rationale

(왜 이 severity였는지. boundary case 설명.)
```

### Severity 정의

| Severity | 정의 | 예시 |
|----------|------|------|
| SEV1 | 모든 사용자가 핵심 기능 사용 불가 또는 데이터 영구 손실 | 전체 다운, DB 손상, 인증 우회 |
| SEV2 | 일부 사용자/특정 환경에서 핵심 기능 영향, 데이터는 안전 | 특정 도메인에서 페이지 collapse, 알림 발송 일부 실패 |
| SEV3 | 우회 가능한 결함, UX 저하 | 비핵심 화면 레이아웃 깨짐, 비핵심 기능 중단 |
| SEV4 | 사용자 영향 거의 없음 (관측 가능한 anomaly) | metrics spike, 비정상 로그 패턴 |

### 작성 규약

- **Blameless**. 사람 이름·비난 표현 금지. 결정의 *환경*과 *시스템 신호*를 분석.
- **사실 기반**. 추정과 사실을 구분 (`추정:` prefix).
- **Sanitization**. 운영 secret/내부 호스트/실명/이메일은 placeholder. 단 이미 공개된 도메인(`readmates.pages.dev`)은 그대로 사용 가능.
- **Action item에 오너와 트래킹**. "검토 필요"같은 동사 명사화 금지. "X를 Y한다"로 적고 PR/issue 링크.
- **상태 갱신**. action item이 닫힐 때 post-mortem 본문 업데이트. 닫힘 후에도 *post-mortem 자체는 보존*.

### Severity 트리거 매핑 (운영 가이드)

| Severity | 즉시 행동 | 24h 이내 | 1주 이내 |
|----------|----------|---------|---------|
| SEV1 | 모든 작업 중단, 완화 | post-mortem draft | review + action item open |
| SEV2 | 완화 우선 | post-mortem draft | review + action item open |
| SEV3 | 다음 sprint에 처리 | post-mortem 작성 (선택) | — |
| SEV4 | 모니터링 노트만 | — | — |

본 첫 라운드에서는 SEV1/SEV2만 post-mortem 의무. 1인 운영자 부담을 고려.

## 비목표

- alert/oncall 시스템 도입. 본 작업은 *기록*에 한정.
- 모든 과거 incident 백필. 후보 1건만.
- 외부 사용자 대상 status page. 1인 운영 + 소규모 사용자 기반에 과잉.
- post-mortem 자동 생성 도구.
- 영어 번역.

## 검증

작성 완료 시:

1. `docs/operations/postmortems/`에 3개 파일 (README + template + incident 1).
2. `docs/operations/README.md`가 postmortems를 진입점으로 안내.
3. incident 1 post-mortem이 모든 섹션을 포함.
4. spec(`2026-05-11-current-session-refresh-club-context-design.md`)에서 post-mortem으로의 cross-link 추가.
5. case study 03(`docs/case-studies/03-multi-club-domain-platform.md`)의 incident 섹션이 post-mortem을 link.
6. `./scripts/public-release-check.sh` 통과.

## 위험과 완화

| 위험 | 완화 |
|------|------|
| Sanitization 누락으로 secret/실명 노출 | 작성 후 `gitleaks` + targeted scanner 강제. 인용한 모든 호스트/이메일이 placeholder 또는 이미 공개된 도메인인지 직접 grep. |
| Post-mortem이 spec과 단순 중복 | spec은 *결정/설계*, post-mortem은 *시간 축 incident response*. 같은 사실을 다른 frame으로. spec을 *링크*하고 timeline/action item에 집중. |
| Blameless 규약을 어김 | 1인 프로젝트라 비난 대상이 본인뿐이지만, 규약은 동일 적용 (조직 합류 시 그대로 사용 가능한 형태). |
| Action item이 영원히 Open | 첫 incident에서 action item 3개 이내로 제한. 트래킹은 PR/issue 링크 필수. |
| Severity 자의적 판단 | Severity rationale 섹션을 매번 작성. 첫 incident에서 boundary case 명시. |

## 대안과 기각 사유

| 대안 | 기각 이유 |
|------|----------|
| `docs/incidents/` (개별) | "post-mortem"이 통상 용어. ops 문서 허브와 함께 묶으면 탐색성 좋음. |
| spec/plan과 같은 디렉토리 | spec/plan은 *예정된 작업*, post-mortem은 *발생한 사건*. 청중과 톤이 다름. |
| Confluence/Notion 외부 도구 | 1인 + 공개 저장소 + 코드와의 cross-link 필요 → repo가 적합. |
| GitHub issues로만 | issue는 *해결 트래킹*용. 시계열 회고 본문이 어색. |

## Incident 1 — Post-mortem 본문 개요 (plan에서 정밀화)

- **발생**: 2026-05-11 (실측 시각은 plan에서 git log로 확인).
- **Severity**: SEV2 — 운영 사용자가 reading progress 저장 후 페이지가 빈 상태로 collapse. 데이터는 안전, 우회(페이지 새로고침) 가능. 핵심 사용자 흐름.
- **영향**: production만 영향 (`readmates.pages.dev`). dev 환경 영향 없음. 모든 클럽의 멤버가 current session route에서 mutation 후 영향.
- **탐지**: 본인 시연 중 발견 (운영 alert는 없었음 — gap).
- **Root cause**: 다층 분석:
  - 코드: refresh handler가 `useParams()` 없이 `loadCurrentSessionRouteData()`를 호출 → `clubSlug` 없는 `/api/auth/me` 요청 → BFF가 host 헤더 자동 첨부 → server가 host로 club lookup → shared fallback domain은 `club_domains`에 없음 → degraded auth.
  - 프로세스: dev/prod parity 검증 부재 (Vite proxy와 Pages function이 host 헤더를 다르게 다룸).
  - 디자인: BFF가 *모든 요청*에 host 헤더를 첨부하는 정책의 잠재 risk가 spec에 명시되지 않음.
- **완화**: 즉시 수정 PR 작성. (실측 PR 링크는 plan에서.)
- **영구 수정**: spec `2026-05-11-current-session-refresh-club-context-design.md` + plan으로 client refresh path가 `clubSlug`를 명시 전달하도록 수정.
- **검증**: 신규 unit test (`current-session.test.tsx`)가 club-scoped path에서 mount → refresh dispatch → 모든 `/api/sessions/current` 요청이 `clubSlug=reading-sai`를 포함하는지 확인. 실측 manual repro로 production 빈 상태 미발생 확인.
- **Lessons learned**:
  - 잘 한 것: 재현 → root cause 분석 → spec/plan → 영구 수정이 같은 날 안에 closed.
  - 못 한 것: dev/prod parity 자동 검증 없음. host 헤더 정책의 risk가 case study/ADR에 사전 기록되지 않았음.
  - 운이 좋았던 것: 본인 시연 중 발견. 사용자 보고 전.
- **Action items**:
  1. dev/prod BFF 헤더 parity test 추가 (P1, plan 후속).
  2. BFF host 헤더 정책 ADR 후속 작성 (shared fallback에서 미전송) (P2).
  3. (선택) 모든 route의 refresh path에서 `useParams` 사용 grep audit (P3).

## 후속(범위 밖)

- Incident 2 (security history rewrite) post-mortem — sanitization 룰 검토 후 별도 라운드.
- alert 시스템 도입 (Prometheus alertmanager + 이메일/SMS).
- post-mortem review meeting 프로세스 (1인 운영 시 self-review checklist로 대체).
- 영어 번역 (해외 채용).
- post-mortem search/필터 (개수 누적 시).
