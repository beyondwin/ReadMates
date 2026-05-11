# Post-mortem Follow-up Consolidation 설계

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: docs / operations · portfolio

## 목적

2026-05-11 라운드에서 작성한 spec/plan + post-mortem이 main 워크트리에 *미커밋*이거나 *cross-link가 잠재적으로 깨질 수 있는 상태*다. 본 작업은 이번 라운드의 portfolio polish가 머지된 후 발생할 신뢰성 손상을 막기 위한 **저비용 후속 정리**를 한 번에 묶는다.

다음 4가지를 한 spec/plan 쌍으로 묶는다:

1. **Post-mortem 본문 갱신** — 본 라운드의 R2/R3 재평가 결과를 incident post-mortem의 *Action items* 표에 반영. P3=closed (grep으로 검증됨), P2=ADR-0013 spec link 추가.
2. **Post-mortem spec/plan commit** — 현재 untracked 상태인 본 라운드의 incident-postmortem-practice spec/plan 2개 파일을 git에 등록.
3. **ADR-0010 placeholder 보존 확인** — 병행 ADR 세션이 작성 중인 `docs/development/adr/0010-public-repo-safety-automation.md:223`의 OCID 형식 예시가 placeholder(`<ocid-format-example>`)로 유지되었는지, 그 세션이 머지된 후 확인.
4. **Case study ↔ ADR cross-link 정합 확인** — 본 라운드의 case study 3건이 인용한 ADR-0001/0004/0005/0006/0008/0009 파일이 ADR plan 머지 후 실재함을 검증.

이 4가지는 *결정*이 아니라 *확인/갱신*이다. ADR 등급의 의사결정은 별도 spec/plan(`2026-05-11-bff-host-header-policy-design`)에서 다룬다.

## 현재 맥락

### 본 라운드의 진행 상태

| 산출물 | 위치 | 상태 |
|--------|------|------|
| 본 라운드 spec 4개 + plan 4개 | `docs/superpowers/{specs,plans}/2026-05-11-*` | 4쌍 중 3쌍 (ADR/case-study/observability) 머지됨, 1쌍 (postmortem-practice) **untracked** |
| ADR 디렉토리 | `docs/development/adr/` | 병행 세션이 작성 중, ADR-0010 placeholder 수정 본 세션에서 적용함 (untracked 보존) |
| Case study 3건 | `docs/case-studies/` | 머지됨, ADR cross-link 6건의 정합성은 ADR 머지 후 검증 필요 |
| Post-mortem 디렉토리 | `docs/operations/postmortems/` | 머지됨 (commit `25fdec0` 추정), 본문의 action item 표는 *Open + TBD* 상태 |

### Action item 표 현재 상태

`docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`의 *Action items* 섹션:

```markdown
| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | dev/prod BFF 헤더 parity test 추가 | P1 | front | Open | TBD |
| 2 | BFF host 헤더 정책 ADR 후속 작성 — shared fallback domain일 때 host 헤더 미전송 | P2 | docs | Open | TBD |
| 3 | 다른 라우트의 refresh path가 동일 패턴을 사용하는지 grep audit | P3 | front | Open | TBD |
```

본 세션의 R2/R3 재평가에서 grep으로 확인된 사실:

- **#3 (P3)** — `READMATES_ROUTE_REFRESH_EVENT`의 production 사용처는 `front/features/current-session/route/current-session-route.tsx`의 단 1개. 다른 라우트의 `loadMemberAppAuth` 호출은 React Router loader args를 그대로 forward → 초기 loader는 안전. **사실상 closed**.
- **#2 (P2)** — 별도 spec `2026-05-11-bff-host-header-policy-design.md`(ADR-0013)에서 처리. **트래킹 = 그 spec link**.
- **#1 (P1)** — R2 재평가 결과 *시급성 낮음* (잠복 incident 없음, 예방 가드 가치만). 본문 트래킹은 `Deferred — see <분석 link>` 로 표기.

### Untracked spec/plan

```
?? docs/superpowers/plans/2026-05-11-incident-postmortem-practice-implementation-plan.md
?? docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md
```

본 라운드 다른 3쌍은 commit됨. 추적성 일관성을 위해 함께 등록 필요.

### ADR-0010 placeholder 위험

본 세션에서 `docs/development/adr/0010-public-repo-safety-automation.md:223`을:

```
- fixture에 OCI OCID 형식 문자열(`<literal-OCID-pattern-that-matches-readmates-oci-ocid-rule>`) 삽입 → ...
```

(원문은 `ocid1.<resource>.<realm>.<region>.<id>` 모양으로 16자 이상의 영문/숫자/`._-` 시퀀스 → `readmates-oci-ocid` 규칙에 매치.)

다음으로 수정함:

```
- fixture에 OCI OCID 형식 문자열(`<ocid-format-example>` — 실제 fixture에는 `ocid1.<resource>.<realm>.<region>.<id>` 형식의 표본 값 사용) 삽입 → ...
```

이 수정은 untracked 파일에 적용. 병행 ADR 세션이 같은 파일을 다시 작성·머지하면 placeholder 미반영본이 부활할 수 있음 → 게이트 회귀.

### Case study cross-link 의존성

`docs/case-studies/01-bff-security-and-secret-rotation.md`, `02-notification-pipeline-with-outbox.md`, `03-multi-club-domain-platform.md`가 인용한 ADR:

- 01 → ADR-0001 (Cloudflare Pages BFF), ADR-0005 (BFF secret rotation), ADR-0006 (session cookie)
- 02 → ADR-0004 (transactional outbox), ADR-0009 (Zod contract)
- 03 → ADR-0008 (multi-club domain)

ADR plan 머지 전이면 6개 link 모두 GitHub UI에서 404. 머지 후 즉시 검증 필요.

## 결정

본 spec은 *결정*이 아니라 *후속 확인/갱신 절차*를 정의한다. 모든 작업은 한 commit 또는 두 commit으로 closed.

### 작업 1 — Post-mortem 본문 갱신

대상: `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`

변경: Action items 표 3개 행을 다음으로 갱신:

```markdown
| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | dev/prod BFF 헤더 parity test 추가 | P1 | front | Deferred | 본 라운드 R2 재평가로 시급성 낮음 확인 (`docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md`). 미래 BFF 헤더 의존 코드 추가 시 재평가. |
| 2 | BFF host 헤더 정책 ADR 후속 작성 — shared fallback domain일 때 host 헤더 미전송 | P2 | docs | In progress | `docs/superpowers/specs/2026-05-11-bff-host-header-policy-design.md` (ADR-0013) |
| 3 | 다른 라우트의 refresh path가 동일 패턴을 사용하는지 grep audit | P3 | front | Closed (2026-05-11) | `READMATES_ROUTE_REFRESH_EVENT`의 production 사용처는 `front/features/current-session/route/current-session-route.tsx` 단 1개임을 grep으로 확인. 다른 라우트의 `loadMemberAppAuth(args)`는 args forward로 초기 loader가 안전. |
```

추가로 *Lessons learned* 섹션 아래에 새 섹션 추가:

```markdown
## Follow-up 갱신 이력

| 일자 | 변경 | 출처 |
|------|------|------|
| 2026-05-11 | Action item #3 → Closed, #2 → ADR-0013 spec link, #1 → Deferred | `docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md` |
```

본문 timeline / severity / lessons는 변경하지 않음.

### 작업 2 — Untracked spec/plan commit

대상:
- `docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md`
- `docs/superpowers/plans/2026-05-11-incident-postmortem-practice-implementation-plan.md`

본 spec/plan(consolidation)과 별도 commit으로 분리할지, 한 commit에 묶을지는 plan에서 결정. 추천: **두 commit으로 분리** (incident-postmortem-practice는 *별도 결정*이므로 추적성에 유리).

### 작업 3 — ADR-0010 placeholder 보존 확인

대상: `docs/development/adr/0010-public-repo-safety-automation.md`

조건부 작업. 병행 ADR 세션이 머지된 후 다음 grep:

```bash
grep -n "ocid1\.instance\.oc1\.ap-tokyo-1\.aaaaaaa" docs/development/adr/0010-public-repo-safety-automation.md
```

- 0건 → placeholder 보존됨. 작업 종료.
- 1건 이상 → placeholder 부활. 본 spec의 plan Task 3 Step 3에 정의된 hotfix 적용.

### 작업 4 — Case study ↔ ADR cross-link 검증

대상: `docs/case-studies/0{1,2,3}-*.md`

조건부 작업. ADR plan이 머지된 후:

```bash
for f in docs/case-studies/*.md; do
  grep -oE "ADR-[0-9]{4}" "$f" | sort -u | while read adr; do
    num=${adr#ADR-}
    ls docs/development/adr/${num}-*.md 2>/dev/null || echo "MISSING $adr in $f"
  done
done
```

- MISSING 0건 → 정합. 작업 종료.
- MISSING n건 → ADR plan이 *미완료* 상태이거나 일부 ADR이 머지에서 누락된 것. 누락된 ADR 파일 생성 또는 case study에서 해당 link를 *제거*(deferred follow-up으로) 둘 중 선택. plan에서 절차 정의.

## 비목표

- ADR-0013 본문 작성 — 별도 spec/plan(`2026-05-11-bff-host-header-policy-design`)에서.
- Parity test (P1) 코드 변경.
- Action item issue를 GitHub Issues로 마이그레이션.
- Post-mortem template 자체 변경.
- ADR-0010 본문의 다른 부분 검토 (병행 세션 산출물).
- 영어 번역.

## 검증

작업 1 완료 시:
- post-mortem 본문 Action items 표 3개 행이 위 결정대로 갱신됨.
- Follow-up 갱신 이력 섹션 추가됨.
- `./scripts/public-release-check.sh` 통과.

작업 2 완료 시:
- `git status`에서 본 라운드 incident-postmortem-practice spec/plan이 더 이상 untracked 아님.
- commit history에 본 라운드 4쌍 모두 등록됨.

작업 3 완료 시:
- grep 결과 0건.
- (부활 시) hotfix 후 0건 + `./scripts/public-release-check.sh` 통과.

작업 4 완료 시:
- MISSING 결과 0건. 또는 누락 ADR에 대한 follow-up이 본 spec의 *후속* 섹션에 명시됨.

## 위험과 완화

| 위험 | 완화 |
|------|------|
| 작업 1 본문 갱신 후 *Action items 트래킹 컬럼*이 미래에 다시 stale로 되돌아감 | Follow-up 갱신 이력 섹션이 *영구 보존 기록*. 추가 갱신 시 같은 표에 새 행 추가. 본문 다른 곳은 손대지 않음. |
| 작업 2 commit이 본 라운드 다른 commit과 *시간순으로 어색*함 | 본 라운드 incident-postmortem-practice spec/plan을 *지금 시점의 commit*으로 등록. commit 메시지에 "originally drafted on 2026-05-11 alongside sibling specs; landed after the post-mortem itself" 명시. |
| 작업 3에서 병행 세션이 같은 파일을 *덮어쓰기 외 방식*으로 머지 (예: cherry-pick으로 placeholder 미반영 commit 적용) | grep 검증이 잡음. hotfix는 plan에 코드 변경 없이 한 줄 Edit로 정의. |
| 작업 4에서 ADR plan이 *일부*만 완료된 채 머지 | MISSING 결과를 *follow-up 항목*으로 본 spec 후속에 기록 → case study에서 link 임시 제거 또는 ADR plan 잔여 task 완료 둘 중 선택. |
| 본 spec/plan 자체가 *작업 1~4의 후속*을 만들면 무한 재귀 | 본 spec의 비목표 명시. 추가 발견 항목은 별도 spec으로 분기. |
| 본 spec이 너무 메타하게 보임 ("문서를 갱신하기 위한 문서") | OK. 이번 라운드의 *추적성 일관성* 자체가 portfolio 신호. 작업 단위가 작아도 일관 포맷이 강점. |

## 대안과 기각 사유

| 대안 | 기각 이유 |
|------|----------|
| 1~5번을 spec/plan 없이 *세션 ad-hoc*으로 처리 | 본 라운드의 *모든 변경에 spec/plan 동반* 원칙과 어긋남. 추적성 손상. |
| 1~5번을 5쌍의 별도 spec/plan으로 | 작업 단위가 5~10분인 항목까지 ~10KB spec을 가짐. 보일러플레이트 비중 높음. |
| 1~5번을 1쌍에 ADR-0013까지 통합 | ADR-0013은 *결정*이고 본 spec은 *후속*. 청중과 톤이 다름. |
| Action items를 GitHub Issues로 마이그레이션 | 1인 프로젝트 + spec/plan 중심 워크플로에 issue 추가 도입은 *중복 트래킹*. R3 재평가에서 이미 격하됨. |

## 후속 (범위 밖)

- 작업 4에서 누락 ADR 발견 시 follow-up spec.
- ADR-0013 작성 후, parity test (P1)의 시급성 재평가 — 필요 시 별도 spec.
- Action item *closed 후 본문 갱신* 강제 메커니즘 (예: linter 또는 PR template).
- Post-mortem template에 *Follow-up 갱신 이력* 섹션 추가 (현재는 incident별로 ad-hoc).
