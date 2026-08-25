# ADR-0025: 모임 참여자 snapshot이 응답 분모를 소유

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 제품·서버
- 관련: ADR-0021, `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

## 컨텍스트

현재 club member 수를 응답 분모로 사용하면 모임 준비 시작 뒤 가입·탈퇴·정지된 membership이 과거 응답률과 `SESSION_PARTICIPANTS` 기반 준비 알림 대상을 바꾼다. 운영자는 “이 모임에 누구의 응답을 기다리는지”를 재현할 수 있어야 한다.

## 결정

`멤버와 준비 시작` transaction에서 active participant snapshot을 만들고 그 snapshot이 참석 응답 분모, `SESSION_PARTICIPANTS` 기반 준비 알림 대상, close preview를 소유한다. 이후 participation status 변경은 별도 revision과 audit로 반영하며 membership 변화가 과거 응답·출석 history를 삭제하지 않는다. `CONFIRMED_ATTENDEES`는 actual attendance snapshot, `ALL_ACTIVE_MEMBERS`는 confirm 시점의 active membership, `SELECTED_MEMBERS`는 preview에서 명시 선택하고 confirm에서 재검증한 active membership snapshot이 각각 소유한다.

## 근거

- 응답률과 participant 기반 알림 대상을 시간에 따라 재현할 수 있다.
- club membership lifecycle과 meeting participation을 분리한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 항상 current member 수 사용 | 과거 응답률과 대상이 자동으로 변한다. |
| Participant 알림 때마다 임시 대상 계산 | 화면 분모와 실제 발송 대상이 drift할 수 있다. |

## 결과

긍정적:
- 응답·participant 기반 알림·close preview가 같은 참여자 집합을 공유한다.

부정적/감수한 비용:
- snapshot persistence와 membership-change matrix가 필요하다.

## 검증

- Open 전후 가입·탈퇴·정지·재활성화와 participant 제외/복귀 matrix를 integration test한다.
- 네 notification audience의 authoritative source와 관련 revision을 preview/confirm integration test로 검증한다.

## 후속 작업

- 코드·migration·tests·active architecture가 일치하면 `Accepted`로 승격한다.
