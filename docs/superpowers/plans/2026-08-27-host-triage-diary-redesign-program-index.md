# 호스트 트리아지·다이어리 리디자인 — 프로그램 인덱스

스펙 `docs/development/2026-08-27-readmates-host-triage-diary-redesign-design.md`(§9 단계적 구현)의 실행 계획 묶음. 순서대로 실행하며, 각 단계는 독립 릴리스 가능하다. 각 계획의 Task 0(앵커 재확인)을 건너뛰지 않는다 — 앞 단계가 코드를 바꾼 뒤 문서의 파일·행 참조가 낡았을 수 있다.

| 순서 | 계획 문서 | 범위 | 선행 조건 |
| --- | --- | --- | --- |
| 1 | `2026-08-27-host-meeting-language-stage1.md` | 용어·상태 사전 통일 (라벨 단일화, 화면 불변) | 없음 |
| 2 | `2026-08-27-host-today-triage-stage2.md` | 오늘(홈) 트리아지 — 처리할 일 큐 + 다음 모임 히어로 | 1단계 |
| 3 | `2026-08-27-host-meeting-list-stage3.md` | 모임 목록 통합 — 차례식 두 구역 + 휴지통 단일 진입 | 1단계 (2단계와 병행 가능) |
| 4 | `2026-08-27-host-meeting-diary-stage4.md` | 다이어리 상세 — 타임라인 + 장부 마감 + 알림 레일 + 당일 출석 | 1·2단계 (홈 D-day 임베드 포함) |
| 5 | `2026-08-27-host-members-invitations-stage5.md` | 멤버+초대 통합 — 승인 대기 구역 + 명단 원장 + 초대 구역 | 1단계 |
| 6 | `2026-08-27-host-nav-3tab-stage6.md` | 3탭 전환 + 구 라우트 리다이렉트 (마지막 스위치) | 2·3·4·5단계 전부 |

참고 자료:

- 설계 스펙: `docs/development/2026-08-27-readmates-host-triage-diary-redesign-design.md`
- ADR: `docs/development/adr/0046-host-triage-home-meeting-diary-composition.md` (Proposed — 6단계 완료 후 승격)
- 시안(비규범): `docs/development/host-redesign-mockups/`

서버 작업이 필요해 이 프로그램에서 제외된 후보(별도 스펙): 다이제스트 알림, 다단(D-7/D-1) 리마인드, 종료 시 소감 요청 자동 발송, 멤버별 참석·불참 누계 API, 명명된 초대 링크(사용 횟수 제한).
