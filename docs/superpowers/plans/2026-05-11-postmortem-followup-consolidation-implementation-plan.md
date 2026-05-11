# Post-mortem Follow-up Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-05-11 라운드의 4가지 후속 정리를 한 번에 처리한다 — (1) post-mortem 본문 Action items 갱신, (2) untracked spec/plan commit, (3) ADR-0010 placeholder 보존 확인, (4) Case study ↔ ADR cross-link 정합 확인. 코드 변경 0. 모든 작업이 *확인/갱신*이며, 새 결정은 별도 spec(`2026-05-11-bff-host-header-policy-design`)에 위임.

**Architecture:** 작업 1, 2는 *본 세션에서 즉시* 수행 가능. 작업 3, 4는 *조건부 — 병행 ADR 세션 머지 후*. 작업 3, 4는 본 plan의 검증 step에서 grep으로 trigger 여부 자동 결정.

**Tech Stack:** 마크다운 + git.

**Spec:** `docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md`

---

## File map

수정:
- `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md` (Action items 표 + Follow-up 갱신 이력 섹션)
- (조건부) `docs/development/adr/0010-public-repo-safety-automation.md` (placeholder 부활 시 hotfix)
- (조건부) `docs/case-studies/0{1,2,3}-*.md` (ADR plan 미완 시 link 임시 제거 또는 follow-up 명시)

신규 commit:
- `docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md` (이미 작성됨, 등록만)
- `docs/superpowers/plans/2026-05-11-incident-postmortem-practice-implementation-plan.md` (이미 작성됨, 등록만)
- 본 spec/plan 자체

수정 금지:
- post-mortem 본문의 timeline / severity / lessons 섹션.
- ADR-0010의 line 223 외 다른 부분 (병행 세션 산출물).
- Case study 본문의 incident 섹션 / trade-off / 다시 한다면 (ADR link만 변경 가능).
- 코드 (server/, front/).

---

## Task 1: Post-mortem 본문 Action items 갱신

**Files:** 수정 `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`

- [ ] **Step 1: 현재 표 위치 확인**

```bash
grep -n "^## Action items\|^## Lessons" docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md
```

기대: 두 헤더의 line number 출력. 표는 `## Action items` 직후.

- [ ] **Step 2: 표 3개 행을 spec의 결정대로 교체**

기존 표 3개 행을 다음으로 정확히 교체:

```markdown
| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | dev/prod BFF 헤더 parity test 추가 (Vite proxy와 Pages function이 동일 입력에 동일 헤더를 생성함을 검증) | P1 | front | Deferred | 본 라운드 R2 재평가에서 잠복 incident 거의 없음 확인 (`docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md`). 미래 BFF 헤더 의존 코드 추가 시 재평가. |
| 2 | BFF host 헤더 정책 ADR 후속 — shared fallback domain일 때 host 헤더 미전송 | P2 | docs / front | In progress | `docs/superpowers/specs/2026-05-11-bff-host-header-policy-design.md` (ADR-0011 후보) |
| 3 | 다른 라우트의 refresh path가 동일 패턴을 사용하는지 grep audit | P3 | front | Closed (2026-05-11) | `READMATES_ROUTE_REFRESH_EVENT`의 production 사용처는 `front/features/current-session/route/current-session-route.tsx` 단 1개임을 grep으로 확인. 다른 라우트의 `loadMemberAppAuth(args)`는 args forward로 초기 loader가 안전. |
```

`Edit`을 사용. `old_string`은 기존 3개 행 전체 (헤더 행 포함).

- [ ] **Step 3: Follow-up 갱신 이력 섹션 추가**

`## Severity rationale` 섹션 *바로 위*에 다음 섹션을 새로 삽입:

```markdown
## Follow-up 갱신 이력

| 일자 | 변경 | 출처 |
|------|------|------|
| 2026-05-11 | Action item #3 → Closed (grep audit 완료), #2 → In progress (ADR-0011 spec link), #1 → Deferred (시급성 재평가) | `docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md` |

```

- [ ] **Step 4: 검증 — 표 행 수와 섹션 존재**

```bash
grep -c "^| 1 \||^| 2 \||^| 3 \|" docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md
grep -c "^## Follow-up 갱신 이력" docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md
```

기대: 첫 번째 명령 ≥ 3, 두 번째 = 1.

- [ ] **Step 5: public release 통과**

```bash
./scripts/public-release-check.sh
```

기대: 통과.

---

## Task 2: Untracked spec/plan commit (incident-postmortem-practice)

**Files:** commit only — 본문 변경 없음

- [ ] **Step 1: 두 파일이 untracked임을 확인**

```bash
git status --short docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md docs/superpowers/plans/2026-05-11-incident-postmortem-practice-implementation-plan.md
```

기대: `??` 표시 두 줄. (이미 추가/커밋되었으면 다음 step 건너뛰기.)

- [ ] **Step 2: 두 파일 stage**

```bash
git add docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md \
        docs/superpowers/plans/2026-05-11-incident-postmortem-practice-implementation-plan.md
```

- [ ] **Step 3: 별도 commit 생성**

```bash
git commit -m "$(cat <<'EOF'
docs(superpowers): add 2026-05-11 incident post-mortem practice spec/plan

Spec/plan pair for the post-mortem practice introduced in
docs/operations/postmortems/ — directory, template, severity
definitions, and the first incident (current-session refresh
club context degradation, SEV2).

Sibling specs/plans for the same 2026-05-11 portfolio polish
round (ADR backfill, case studies, observability runbook) were
landed in earlier commits; this pair is the late entry that was
drafted alongside but not committed at the same time.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(사용자가 commit 권한을 부여한 경우에만. 자동 commit이 정책상 금지된 환경이면 step을 *준비된 메시지 제공*으로 멈추고 사용자 트리거를 기다린다.)

- [ ] **Step 4: 검증**

```bash
git log -1 --stat
git status --short docs/superpowers/specs/2026-05-11-incident-postmortem-practice-design.md docs/superpowers/plans/2026-05-11-incident-postmortem-practice-implementation-plan.md
```

기대: log에 두 파일 add. status 출력 비어있음.

---

## Task 3: ADR-0010 placeholder 보존 확인 (조건부)

**Files:** 조건부 수정 `docs/development/adr/0010-public-repo-safety-automation.md`

이 task는 **병행 ADR 세션이 머지된 후에만** 실행 의미가 있다. 머지 전이면 *no-op*.

- [ ] **Step 1: 병행 세션 머지 여부 확인**

```bash
git log --oneline --all -- docs/development/adr/0010-public-repo-safety-automation.md | head -5
```

- 결과 0건 → 아직 안 머지됨. Step 2부터 *건너뛰기*. 본 plan의 다음 실행 라운드에서 재시도.
- 결과 1건 이상 → Step 2 진행.

- [ ] **Step 2: placeholder 보존 grep**

```bash
grep -n "ocid1\.instance\.oc1\.ap-tokyo-1\.aaaaaaa" docs/development/adr/0010-public-repo-safety-automation.md
grep -n "<ocid-format-example>" docs/development/adr/0010-public-repo-safety-automation.md
```

기대:
- 첫 번째 명령: **0건** (placeholder 보존됨).
- 두 번째 명령: **1건** (line 223 또는 인접).

둘 다 만족 → Task 종료. 다음 Task 진행.
첫 번째가 1건 이상 → Step 3 hotfix.

- [ ] **Step 3 (hotfix, 조건부): placeholder 재적용**

```bash
# 정확한 line은 grep 결과로 확인
```

`Edit` 사용. `old_string`은 grep으로 발견된 *literal OCID 형태*가 들어간 문장 전체 — 본 plan에 그 문자열을 그대로 인용하면 본 plan 파일 자체가 scanner를 trigger하므로, 작업자가 grep 결과의 line을 *직접 복사*해 사용한다. 핵심 변경은 다음 형태:

```
old_string  : <literal-OCID-pattern>이 들어간 한 줄 (grep 결과 그대로)
new_string  : `<ocid-format-example>` — 실제 fixture에는 `ocid1.<resource>.<realm>.<region>.<id>` 형식의 표본 값 사용
```

Edit 적용 후 line 223 주변이 다음 모양이 되어야 한다:

```
- fixture에 OCI OCID 형식 문자열(`<ocid-format-example>` — 실제 fixture에는 `ocid1.<resource>.<realm>.<region>.<id>` 형식의 표본 값 사용) 삽입 → `verify-public-release-fixtures.sh` 실행 → `readmates-oci-ocid` finding 보고 확인
```

- [ ] **Step 4 (조건부): 검증 + commit**

```bash
./scripts/public-release-check.sh
```

기대: 통과.

```bash
git add docs/development/adr/0010-public-repo-safety-automation.md
git commit -m "$(cat <<'EOF'
fix(docs): restore <ocid-format-example> placeholder in ADR-0010

Earlier session replaced a literal OCID-format example with a
placeholder (`<ocid-format-example>`) to clear the gitleaks
`readmates-oci-ocid` rule. The parallel ADR session re-introduced
the literal example via the originally-drafted ADR body.

This commit re-applies the placeholder so that the public-release
gate stays green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Case study ↔ ADR cross-link 정합 확인 (조건부)

**Files:** 조건부 수정 `docs/case-studies/0{1,2,3}-*.md`

병행 ADR plan이 *완료* 또는 *부분 완료*된 후에 실행.

- [ ] **Step 1: 모든 ADR 인용 검사**

```bash
for f in docs/case-studies/*.md; do
  echo "=== $f ==="
  grep -oE "ADR-[0-9]{4}" "$f" | sort -u | while read adr; do
    num=${adr#ADR-}
    file=$(ls docs/development/adr/${num}-*.md 2>/dev/null)
    if [ -z "$file" ]; then
      echo "MISSING $adr in $f"
    else
      echo "OK $adr → $(basename $file)"
    fi
  done
done
```

- [ ] **Step 2: 결과 분류**

- 모든 행이 `OK` → Task 종료. 다음 Task로.
- `MISSING` 행 1건 이상 → Step 3 결정.

- [ ] **Step 3 (조건부): 누락 ADR 처리 결정**

각 MISSING ADR에 대해 둘 중 선택:

(A) **누락 ADR이 *곧 머지될* 상태** → 본 task를 *대기*로 두고, 며칠 후 재실행.

(B) **누락 ADR이 *오랜 기간 미작성* 상태** → case study에서 해당 link를 *임시 deferred 표기*로 변경:

```markdown
- ADR-0011 (BFF host 헤더 정책) — *작성 예정, 본 라운드 후속*
```

또는 link를 제거하고 본문에 inline으로 결정 요지만 유지.

선택은 작성자가 ADR plan 진행 상태를 보고 판단. plan은 두 옵션의 절차만 제공, 결정은 위임.

- [ ] **Step 4 (조건부, B 선택 시): case study 수정 + commit**

각 case study 파일을 Edit. commit 메시지:

```
docs(case-studies): mark deferred ADR links until ADR plan completes
```

---

## Task 5: 본 spec/plan + 작업 1 산출물 commit

**Files:** commit only

- [ ] **Step 1: stage**

```bash
git add docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md \
        docs/superpowers/plans/2026-05-11-postmortem-followup-consolidation-implementation-plan.md \
        docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md
```

(Task 3, 4가 변경한 파일이 있으면 별도 commit으로 분리 — 위 Task에서 이미 commit 완료.)

- [ ] **Step 2: commit**

```bash
git commit -m "$(cat <<'EOF'
docs(ops): consolidate 2026-05-11 post-mortem follow-up

- Update post-mortem action items table:
  * #3 (refresh path grep audit) → Closed; verified single
    READMATES_ROUTE_REFRESH_EVENT call site in current-session.
  * #2 (BFF host header ADR) → In progress; tracked by
    docs/superpowers/specs/2026-05-11-bff-host-header-policy-design.md
    (ADR-0011 candidate).
  * #1 (parity test) → Deferred; risk re-evaluation found low
    likelihood of latent incidents.
- Add Follow-up 갱신 이력 section to record this round of updates.
- Spec/plan describe the consolidation scope and verification.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 검증**

```bash
git log -1 --stat
git status --short
```

기대: log에 3개 파일 변경/추가. status에 잔여 untracked 없음 (Task 3, 4 산출물 별도 commit 완료 시).

---

## Task 6: 최종 게이트

- [ ] **Step 1: public release**

```bash
./scripts/public-release-check.sh
./scripts/verify-public-release-fixtures.sh
```

기대: 모두 통과.

- [ ] **Step 2: 본 라운드 spec/plan 인벤토리**

```bash
git log --oneline --all --since="2026-05-11" -- docs/superpowers/specs docs/superpowers/plans docs/operations docs/case-studies docs/development/adr
```

기대: 본 라운드 산출물이 모두 commit history에 보임.

- [ ] **Step 3: 최종 working tree 정리**

```bash
git status --short
```

기대: 비어있음 (또는 ADR-0011 작업이 동시 진행 중이면 그 파일들만 untracked).

---

## 위험과 완화 (실행 시점)

| 위험 | 완화 |
|------|------|
| Task 2 commit이 *git history 시간 순서*에서 어색 | commit 메시지에 "originally drafted on 2026-05-11 alongside sibling specs; landed late" 명시. |
| Task 3에서 병행 세션이 *commit 시점에는 placeholder 적용*하다가 이후 다시 덮어씀 | grep 검증을 정기적으로 (예: 분기별) 재실행. 본 plan의 Task 3 Step 1~4를 *재사용 가능* 한 형태로 둠. |
| Task 4 (B) 옵션 선택 시 case study가 일시적으로 ADR 링크가 약함 | "작성 예정" 표기 + 본문 inline으로 결정 요지 유지. 임시 상태가 *영원*이 되지 않도록 후속 spec 추가. |
| Task 5 commit에 너무 많은 변경이 묶임 | 본 plan은 Task 3, 4 변경을 *별도 commit*으로 분리하도록 정의. Task 5는 본 spec/plan + 작업 1 산출물만. |

---

## 완료 조건

- [ ] Task 1 완료: post-mortem Action items 표 갱신 + Follow-up 이력 섹션 추가.
- [ ] Task 2 완료: incident-postmortem-practice spec/plan commit.
- [ ] Task 3 완료: ADR-0010 placeholder 보존 확인 (조건부 hotfix).
- [ ] Task 4 완료: case study ↔ ADR link 정합 확인 (조건부 수정).
- [ ] Task 5 완료: 본 spec/plan + 작업 1 산출물 commit.
- [ ] Task 6 통과: 게이트 green + working tree 정리.
