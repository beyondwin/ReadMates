# ReadMates Host-to-Member Session Record Loop

작성일: 2026-06-18
상태: APPROVED DESIGN SPEC
대상 표면: front, host UX, member home/archive, session record consumption, local release evidence

## 1. 배경

ReadMates의 세션 기록 흐름은 이미 호스트 기록 완성 쪽으로 크게 정리되어 있다.

- 호스트는 세션 편집기의 `세션 기록 완성` 패널에서 AI 생성 또는 외부 JSON 가져오기로 기록 패키지를 만든다.
- 최근 작업으로 외부 JSON preview가 저장 전 검토 화면에 가까워졌다.
- 저장 경로는 세션 공개 요약, 하이라이트, 한줄평, 피드백 문서를 하나의 패키지로 교체한다.
- 멤버는 홈, 현재 세션, 아카이브, 피드백 문서 route에서 발행된 기록을 소비한다.

남은 빈칸은 end-to-end 연결이다.

- 호스트는 commit 이후 실제로 어떤 항목이 교체되었는지 빠르게 확인하기 어렵다.
- commit 실패가 파일 문제, preview 재검증 문제, 공개 범위 문제, refresh 문제 중 무엇인지 화면에서 구분하기 어렵다.
- 멤버 홈과 아카이브는 새로 발행된 기록을 더 분명한 "이어보기" 동선으로 묶지 못한다.
- 호스트가 완성한 기록이 멤버 소비 표면에서 public-safe하게 노출된다는 end-to-end evidence가 부족하다.

이 설계는 A안(호스트 기록 완성 감사·복구)과 B안(멤버 기록 소비 경험 강화)을 하나의 얇은 제품 slice로 묶는다.

## 2. 목표

성공 기준은 "저장 버튼 주변을 꾸민다"가 아니다. 호스트가 기록을 완성한 뒤 멤버가 그 기록을 자연스럽게 이어 읽을 수 있어야 한다.

구체 목표:

- 호스트가 preview 이후 commit 성공 결과를 항목별로 확인할 수 있다.
- 호스트가 commit 실패와 refresh 실패를 구분하고 다음 행동을 알 수 있다.
- 멤버 홈이나 아카이브가 최근 발행 기록을 더 분명한 진입으로 보여준다.
- 피드백 문서, 질문, 서평으로 이어지는 archive 동선을 권한 상태에 맞게 정리한다.
- server contract 변경 없이 기존 응답으로 먼저 구현한다.
- host-to-member E2E가 public-safe fixture로 기록 완성 후 멤버 소비 진입을 검증한다.

## 3. Non-goals

- 새 AI provider, model catalog, prompt, cost policy 변경.
- admin 콘솔 확장.
- DB schema 변경.
- notification outbox, email dispatch, Kafka worker 변경.
- public site SEO, RSS, SSR 변경.
- 피드백 문서 PDF download 활성화.
- CI visual regression infrastructure 도입.
- production deploy, release tag push, provider-console smoke.

## 4. 선택한 접근

선택한 접근은 **호스트 기록 완성 결과 요약 + 멤버 최근 기록 이어보기**다.

검토한 대안:

1. **호스트 기록 완성만 닫기**
   - 장점: 작고 release risk가 낮다.
   - 단점: 멤버가 체감하는 기록 소비 루프는 그대로 남는다.

2. **멤버 소비 경험만 확장**
   - 장점: 사용자 체감이 빠르다.
   - 단점: 기록 생성·교체·실패 원인 추적이 약해 향후 디버깅이 어렵다.

3. **호스트 결과 요약과 멤버 이어보기를 함께 연결**
   - 장점: 최근 host session record preview 작업과 자연스럽게 이어지고, 제품 가치와 검증 증거가 한 흐름으로 닫힌다.
   - 단점: host와 member 표면을 함께 만지므로 구현 계획에서 경계를 작게 유지해야 한다.

이번 작업은 3번을 선택한다. Server contract는 먼저 재사용하고, 구현 중 기존 응답만으로 불가능한 경우에만 additive field를 별도 승인 대상으로 둔다.

## 5. 설계 범위

주요 변경 후보:

- `front/features/host/model/session-import-model.ts`
- `front/features/host/model/host-session-editor-model.ts`
- `front/features/host/ui/session-editor/session-import-panel.tsx`
- `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- `front/features/member-home/model/*`
- `front/features/member-home/ui/*`
- `front/features/archive/model/*`
- `front/features/archive/ui/*`
- `front/tests/e2e/host-session-record-preview.spec.ts` 또는 신규 targeted E2E
- `CHANGELOG.md`
- 필요 시 `docs/development/test-guide.md`

Server production code는 기본 범위가 아니다. 저장 결과 요약에 필요한 데이터가 기존 frontend state로 계산 가능하면 서버를 건드리지 않는다.

## 6. Frontend Architecture

프런트엔드는 route-first 경계를 유지한다.

```text
src/app -> src/pages -> features -> shared
```

Host와 member feature가 서로 직접 import하지 않는다.

- Host feature는 기록 완성 상태, commit 결과, refresh 상태를 host-local model로 계산한다.
- Member feature는 최근 발행 기록과 archive 진입 상태를 member-local model로 계산한다.
- 두 feature가 같은 단순 표시 정책을 공유해야 할 때만 `front/shared/model`에 작은 primitive를 둔다.
- UI component는 props/callback 기반으로 유지하고, fetch/query/route param을 직접 소유하지 않는다.
- Query invalidation과 loader seeding은 route/queries 계층에서 처리한다.

의존성 예:

```text
host route/query
  -> host model
  -> host ui

member route/query
  -> member/archive model
  -> member/archive ui
```

## 7. Host UX

호스트의 `세션 기록 완성` 패널은 저장 전 검토와 저장 후 결과를 분리해 보여준다.

### 7.1 Preview 상태

기존 preview 개선 흐름을 유지한다.

- 회차 번호, 책 제목, 모임 날짜.
- 공개 요약 교체 여부.
- 하이라이트 수.
- 한줄평 수.
- 피드백 문서 제목 또는 파일명.
- 작성자 매칭 완료/불일치 목록.
- 저장 차단 issue.

### 7.2 Commit 성공 상태

Commit이 성공하면 같은 패널 안에 짧은 결과 ledger를 보여준다.

- `저장 완료` 상태.
- 교체된 공개 요약.
- 저장된 하이라이트 수.
- 저장된 한줄평 수.
- 피드백 문서 parser 통과 여부.
- 기록 발행이나 공개 범위상 추가 조치가 필요한지 여부.

이 상태는 raw JSON이나 피드백 문서 본문을 보여주지 않는다. 호스트에게 필요한 것은 diff 전문이 아니라 "이번 저장이 어떤 표면에 영향을 줬는가"이다.

### 7.3 Commit 실패 상태

실패는 원인별로 구분한다.

- 권한 또는 세션 상태 문제: 현재 클럽/호스트 권한을 확인하라고 안내한다.
- 재검증 실패: preview를 다시 실행하라고 안내한다.
- 공개 범위 문제: 기록 공개 범위를 조정해야 한다고 안내한다.
- 네트워크 또는 서버 오류: 저장이 완료되지 않았을 가능성을 전제로 재시도 안내를 제공한다.
- 저장 후 refresh 실패: 저장은 되었을 수 있으므로 화면 새로고침 또는 세션 상세 재조회로 확인하게 한다.

## 8. Member UX

멤버 쪽은 "최근 기록 이어보기"를 강화한다.

### 8.1 Member home

최근 발행 기록이 있으면 멤버 홈에 짧은 진입을 제공한다.

- 세션 번호와 책 제목.
- 한 줄 summary 또는 기록 존재 상태.
- `기록 보기` 진입.
- 피드백 문서 열람 가능 시 `피드백 보기` 진입.

데이터가 없으면 기존 빈 상태를 유지한다. 아직 발행된 기록이 없는 클럽에서 가짜 활동감을 만들지 않는다.

### 8.2 Archive

Archive의 기록 카드나 상세에서 다음 진입을 더 명확히 한다.

- 공개 요약.
- 하이라이트와 한줄평.
- 내 질문/서평.
- 피드백 문서 가능/불가 상태.

피드백 문서가 없거나 권한이 없으면 같은 빈 상태로 뭉개지 않는다. 멤버가 참석하지 않았는지, 문서가 아직 없는지, 기록이 아직 발행되지 않았는지 구분한다.

### 8.3 Mobile

모바일은 desktop의 정보를 줄이지 않고 밀도를 낮춘다.

- 최근 기록 진입은 한 줄 ledger row 또는 접힌 section으로 표현한다.
- 버튼 text는 짧게 유지한다.
- 긴 책 제목, 긴 작성자명, 긴 파일명은 wrapping으로 처리한다.

## 9. Data Flow

기본 흐름:

```text
Host import or AI commit
  -> preview
  -> commit
  -> host editor refresh
  -> publication/archive/feedback state reflects saved package
  -> member home/archive shows latest published record entry
```

구현 우선순위:

1. 기존 host detail/editor state로 commit result summary를 계산한다.
2. 기존 member home/archive API 응답으로 최근 발행 기록 진입을 계산한다.
3. 부족한 데이터가 있으면 route loader에서 이미 받은 detail/list 조합으로 보완한다.
4. 그래도 불가능한 경우에만 additive server response field를 별도 구현 계획에 포함한다.

## 10. Error Handling

### 10.1 File and preview errors

파일 파싱 실패, schema 불일치, preview validation issue는 저장 전 차단한다. Raw JSON, stack trace, internal field dump는 노출하지 않는다.

### 10.2 Commit revalidation errors

Preview 이후 세션 상태, 참석자, 공개 범위가 바뀌었을 수 있다. 이 경우 commit은 부분 저장하지 않고 preview 재실행 또는 공개 범위 수정을 안내한다.

### 10.3 Post-commit refresh errors

Commit API가 성공했지만 editor refresh가 실패한 경우, "저장이 실패했다"로 단정하지 않는다. 저장 완료 가능성을 안내하고 다시 조회하게 한다.

### 10.4 Member consumption errors

멤버 표면은 아래 상태를 구분한다.

- 발행된 기록이 없음.
- 피드백 문서가 없음.
- 참석하지 않아 피드백 문서를 볼 수 없음.
- 권한 또는 로그인 상태가 맞지 않음.

## 11. Public Safety

테스트 fixture와 문서 예시는 public-safe 값만 사용한다.

허용 예:

- `host@example.com`
- `member@example.com`
- `E2E 호스트`
- `E2E 멤버`
- `E2E 책`
- `E2E 세션`

금지:

- 실제 멤버 실명/이메일.
- private domain.
- local absolute path.
- raw transcript.
- provider token 또는 API key.
- token-shaped example.
- private feedback document body.
- raw JSON body를 그대로 렌더링하는 debug UI.

E2E는 private sentinel과 raw JSON sentinel이 화면에 렌더링되지 않음을 검증한다.

## 12. Testing Plan

### 12.1 Frontend model and unit

Targeted commands:

```bash
pnpm --dir front test -- session-import
pnpm --dir front test -- member-home
pnpm --dir front test -- archive
```

검증:

- Host commit result summary를 계산한다.
- Commit failure type별 안내 상태를 계산한다.
- Member home 최근 기록 진입을 계산한다.
- Archive에서 피드백 문서 가능/불가 상태를 구분한다.
- 긴 한국어/영어 title이 UI를 깨지 않는다.

### 12.2 E2E

Targeted command:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-to-member-session-record-loop.spec.ts
```

구현 계획에서 기존 `host-session-record-preview.spec.ts` 확장이 더 작고 명확하다고 판단하면, 위 명령의 파일명은 실제 확장된 spec 파일로 대체한다.

검증:

- Host가 public-safe fixture로 기록 패키지를 저장한다.
- Host 화면에 commit 결과 summary가 보인다.
- Member home 또는 archive에 최근 발행 기록 진입이 보인다.
- 피드백 문서 진입은 권한 상태에 맞게 보인다.
- private sentinel, raw JSON sentinel, token-shaped sentinel이 화면에 없다.

기존 `host-session-record-preview.spec.ts`에 자연스럽게 합칠 수 있으면 새 파일 대신 해당 spec을 확장한다.

### 12.3 Full local gate

완료 전 실행:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/host-to-member-session-record-loop.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Targeted E2E 파일명은 12.2의 결정과 동일하게 맞춘다.

Server production code 또는 contract가 변경되면 추가:

```bash
./server/gradlew -p server clean test
```

## 13. Documentation and CHANGELOG

사용자-visible host/member workflow가 바뀌므로 `CHANGELOG.md`의 `## Unreleased`에 기록한다.

문서 갱신 기준:

- 테스트 절차가 새 targeted command를 요구하면 `docs/development/test-guide.md`에 추가한다.
- Session import generator 사용법 자체가 바뀌지 않으면 `docs/development/session-import-generator.md`는 수정하지 않는다.
- Architecture source of truth가 바뀌는 server/API boundary 변경이 없으면 `docs/development/architecture.md`는 수정하지 않는다.

`docs/superpowers/`는 historical planning archive다. 구현 후 source-of-truth 설명이 필요하면 `docs/development/`에 반영한다.

## 14. Risks and Mitigations

### Risk: Scope grows across host, member, archive, server

Mitigation: Server contract 변경 없이 frontend model/UI slice로 먼저 닫는다. Archive는 최근 기록 진입과 피드백 상태 구분에 필요한 최소 변경만 한다.

### Risk: Host commit result looks like an audit ledger but is only local UI state

Mitigation: Copy는 "이번 저장 결과"로 제한한다. 장기 감사 원장이나 admin audit 기능처럼 표현하지 않는다.

### Risk: Member home duplicates archive

Mitigation: Member home은 최근 기록 진입만 제공하고, 세부 소비는 archive/session detail이 소유한다.

### Risk: Permission state is hidden for a cleaner UI

Mitigation: 문서 없음, 미참석, 권한 없음, 미발행을 구분한다. 색상만으로 상태를 전달하지 않는다.

### Risk: E2E becomes broad and flaky

Mitigation: One happy path와 one blocked/permission path만 검증한다. Provider, Kafka, email, production OAuth는 scope 밖이다.

## 15. Acceptance Criteria

- 호스트는 기록 패키지 commit 성공 후 교체된 항목 summary를 볼 수 있다.
- 호스트는 commit 실패와 post-commit refresh 실패를 구분할 수 있다.
- 멤버 홈 또는 아카이브는 최근 발행 기록으로 이어지는 명확한 진입을 제공한다.
- 피드백 문서 가능/불가 상태가 문서 없음, 미참석, 권한 없음, 미발행을 구분한다.
- Host feature와 member/archive feature가 서로 직접 import하지 않는다.
- UI component는 props/callback 기반을 유지한다.
- Raw JSON, transcript, private member data, token-shaped 값이 화면·fixture·docs에 노출되지 않는다.
- Targeted host/member/archive unit tests가 통과한다.
- Targeted host-to-member E2E가 통과한다.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`가 통과한다.
- Public release candidate build/check가 통과한다.
- Server contract를 바꿨다면 `./server/gradlew -p server clean test`도 통과한다.
