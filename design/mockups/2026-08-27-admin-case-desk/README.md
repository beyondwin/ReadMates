# 어드민 재설계 방향 시안 — 케이스 데스크 + 운영 서사 (2026-08-27)

`docs/development/2026-08-27-readmates-admin-case-desk-narrative-redesign-design.md` 스펙의
방향 검증용 정적 목업이다. **시각 권위가 아니다** — 구현 기준은 스펙 본문과 `front/DESIGN.md`이며,
이 시안은 레이아웃 의도와 카피 톤을 참고하는 용도다.

승인된 방향: **A안(케이스 데스크) 기반 + B안(운영 서사) 흡수.** C안은 비교용 기록.

| 파일 | 내용 |
| --- | --- |
| `adm-a-today-desktop.{html,png}` | A안 · 오늘 케이스 데스크 (알람 바 + 좌 큐 + 우 증거 도켓, 이전/다음 순회) — 1440px |
| `adm-a-mobile.{html,png}` | A안 · 온콜 모바일 (확인/보류/재발송/메모만, 파괴 명령 없음) — 390px |
| `adm-b-home-desktop.{html,png}` | B안 · 운영 서사 홈 (한 문장 서사 + 주의 카드 + 색인, 정상은 숫자 숨김) — 1440px |
| `adm-c-register-desktop.{html,png}` | C안(비교용) · 원장책 (결정 대기 표 + 오늘의 기입 + 영수증) — 1440px |
| `tokens.css` | 제작 시점의 디자인 토큰 스냅샷 (live 소스: `design/system/src/styles/tokens.css`) |
| `mock.css` | 목업 전용 셸 스타일 (제품 코드 아님) |

HTML을 브라우저로 열면 그대로 렌더링된다. 데이터는 전부 허구이며 실제 멤버·도메인·토큰을
포함하지 않는다.
