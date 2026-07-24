# ReadMates 테스트 스위트 Phase 2~5 계획 검토·승인

## 1. 검토 범위

- 기준 candidate: `184e524336d4b72d2f0e72c7dc704a4e3a696535`
- 기준 설계: `docs/superpowers/specs/2026-07-24-readmates-test-suite-effectiveness-optimization-design.md`
- Phase 1 계획: `docs/superpowers/plans/2026-07-24-readmates-test-suite-audit-phase-1.md`
- Phase 1 inventory: `docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv`
- Phase 1 candidate ledger: `docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv`
- Phase 1 보고서: `docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md`
- active source of truth: 현재 코드, 테스트, migrations, scripts, `.github/workflows/ci.yml`, `docs/development/architecture.md`, `docs/development/test-guide.md`

이번 검토는 계획 문서의 실행 가능성과 범위 안전성을 승인한다. Phase 2~5 테스트 변경 자체를 실행하거나 승인한 것은 아니며, 각 구현 candidate는 해당 계획의 검증과 별도 same-HEAD 리뷰를 다시 통과해야 한다.

## 2. 승인 결과

| 순서 | 계획 | 후보·위험 범위 | 승인 | 실행 선행 조건 |
| --- | --- | --- | --- | --- |
| 2 | `2026-07-24-readmates-test-suite-server-phase-2.md` | server 후보 61개, R03~R09 | `APPROVED_FOR_EXECUTION` | Phase 1 candidate, JDK 25, reachable Docker |
| 3 | `2026-07-24-readmates-test-suite-frontend-bff-phase-3.md` | frontend node/jsdom 후보 33개, R01~R02와 browser-facing R03/R10 | `APPROVED_FOR_EXECUTION` | committed Phase 2 report, Node 24.18.0, pnpm 11.13.1 |
| 4 | `2026-07-24-readmates-test-suite-e2e-ct-ci-phase-4.md` | E2E/CT 후보 7개, CI/scripts, browser R02~R05/R08/R10 | `APPROVED_FOR_EXECUTION` | committed Phase 3 report, Docker, MySQL CLI/service, Chromium, ShellCheck |
| 5 | `2026-07-24-readmates-test-suite-final-verification-phase-5.md` | 510개 전체 reconciliation, R01~R10 mutation, 전체 gate와 잔여 위험 | `APPROVED_FOR_EXECUTION` | committed Phase 4 report, inherited `UNVERIFIED_ENV` 해소 |

계획은 반드시 2 → 3 → 4 → 5 순서로 실행한다. 각 단계는 직전 단계의 committed report를 요구하므로 병렬 실행하지 않는다.

## 3. 설계 요구사항 추적

| 승인 설계 요구사항 | 계획 근거 |
| --- | --- |
| 510개 파일 전체의 최종 판정 | Phase 5 Task 1이 Phase 1 baseline 510개와 신규 경로를 reconciliation |
| 정적 flag를 삭제 근거로 사용하지 않음 | Phase 2/3/4 decision ledger가 production target, failure mode, assertion, duplicate 관계를 필수화 |
| 유지·강화·통합·삭제·계층 이동·분리 판정 | Phase 2/3/4 ledger의 고정 disposition enum |
| R01~R10 보안·데이터·lifecycle·운영 위험 | Phase 2 R03~R09, Phase 3 R01~R02/R03/R10, Phase 4 browser runtime, Phase 5 통합 mutation |
| 실제 DB/Redis/Kafka/browser 경계 유지 | Phase 2 integration tasks와 Phase 4 environment/runtime gate |
| 제한된 결함 주입 | Phase 5 Task 2의 one-mutation-at-a-time fail/restore/green 계약 |
| coverage gate 유지 | frontend `80/79/80/75`, server JaCoCo `0.23`를 모든 계획에 고정 |
| flake와 실행시간 비교 | 영향 lane 3회 min/median/max, retry·timeout·worker 변경 금지 |
| CI 중복·누락 확인 | Phase 4 Task 5가 workflow, aggregate scripts, runner selection을 함께 비교 |
| 공개 저장소 안전성 | 각 계획의 금지값과 Phase 5 safety/public-release scan |
| 최종 잔여 위험과 release readiness | Phase 5 Task 5~6이 whole-branch review와 최종 보고를 생성 |

## 4. 경계와 소유권 검토

- R01의 browser/BFF 계약과 R02의 OAuth return state는 Phase 3이 소유한다. Spring filter test를 변경할 필요가 생기면 Phase 2 server gate를 함께 실행한다.
- R03~R09의 domain/persistence/runtime 진실은 Phase 2가 소유하고, Phase 4는 browser 관찰점만 보강한다.
- R10 unit sanitization은 Phase 3, browser/config/profile runtime은 Phase 4, 통합 mutation과 잔여 위험은 Phase 5가 소유한다.
- Phase 2~4의 삭제·통합은 decision ledger 행이 먼저 존재해야 하며, Phase 5는 새 삭제 후보를 만들지 않는다.
- Phase 4는 기존 cache, shard, retry, timeout, worker, fork, screenshot tolerance를 유지한다. 성능 변경은 동일 조건 3회 비교가 개선을 입증할 때만 허용한다.
- Phase 5 production mutation은 한 번에 하나만 존재하고 commit하지 않는다. reverse와 restored-green이 없으면 다음 mutation 또는 전체 gate로 진행하지 않는다.

## 5. 계획 자체 검증

실행한 정적 검토:

```text
zsh -n <각 계획의 모든 bash code block을 순서대로 추출한 스트림>
git diff --check -- <Phase 2~5 계획>
candidate join 재계산: server=61, frontend=33, browser/CT=7
Phase 1 inventory 재계산: 510
핵심 source/test/config 경로 존재 검사
R01~R10 계획 포함 검사
미완성 표식과 내용 없는 단계 검사
```

검토 중 수정한 결함:

- 존재하지 않는 frontend observability test 경로를 실제 co-located 경로로 수정;
- optional Flyway fixture가 없을 때 `git add`가 실패하지 않게 수정;
- cleanup 단계의 class placeholder를 실제 전체 server lane 명령으로 교체;
- macOS/비재귀 glob과 광범위 staging을 exact/diff-derived staging으로 교체;
- Phase 5 baseline 누락 검사가 `/dev/stdin` file-size에 의존하지 않게 수정;
- mutation target, patch seal/reverse, R05 guard, R10 type을 구체화.

## 6. 승인 시 남아 있는 실행 리스크

- Phase 4 host에서 Docker provider를 시작할 수 없거나 MySQL CLI, Chromium, ShellCheck 설치 권한이 없으면 외부 환경 blocker다. 이 경우 Phase 5 완료를 주장하지 않는다.
- 101개 static candidate의 실제 disposition은 구현 중 source/assertion review와 runtime evidence로 결정된다. 이 승인 문서는 어떤 테스트 삭제도 미리 승인하지 않는다.
- mutation이 의도한 assertion이 아니라 compilation 또는 unrelated suite만 실패시키면 증거로 인정하지 않고 mutation 범위를 고친다.
- test 수 또는 wallclock 감소 자체는 성공이 아니다. 위험 탐지력이 유지되거나 증가하고 gate/flake가 악화되지 않아야 한다.
- 계획 작성자와 이번 계획 검토자는 동일 agent다. 따라서 구현 완료 시 별도의 fresh same-candidate review를 필수로 유지한다.

## 7. 최종 판정

네 계획은 승인 설계, Phase 1 증거, 현재 architecture/test/CI 경계와 일치하며 순차 실행 가능한 상태다.

```text
phase_2=APPROVED_FOR_EXECUTION
phase_3=APPROVED_FOR_EXECUTION_AFTER_PHASE_2
phase_4=APPROVED_FOR_EXECUTION_AFTER_PHASE_3
phase_5=APPROVED_FOR_EXECUTION_AFTER_PHASE_4
implementation=not_started
integration=not_observed
```
