# Post-mortems

ReadMates에서 발생한 운영 incident의 회고 기록입니다. *blameless* 원칙을 따르며, 시간 축에 따라 탐지→완화→영구 수정→회고를 기록합니다.

새 post-mortem은 [`template.md`](template.md)를 복사해 작성합니다.

## 작성 규약

- **Blameless**. 사람 이름·비난 표현 금지. 결정의 *환경*과 *시스템 신호*를 분석.
- **사실 기반**. 추정과 사실을 구분 (`추정:` prefix).
- **Sanitization**. 운영 secret/내부 호스트/실명/이메일은 placeholder. 단 이미 공개된 도메인(`readmates.pages.dev`)은 그대로 사용 가능.
- **Action item에 오너와 트래킹**. "검토 필요"같은 동사 명사화 금지. "X를 Y한다"로 적고 PR/issue 링크.
- **상태 갱신**. action item이 닫힐 때 post-mortem 본문 업데이트. 닫힘 후에도 *post-mortem 자체는 보존*.

## Severity 정의

| Severity | 정의 | 예시 |
|----------|------|------|
| SEV1 | 모든 사용자가 핵심 기능 사용 불가 또는 데이터 영구 손실 | 전체 다운, DB 손상, 인증 우회 |
| SEV2 | 일부 사용자/특정 환경에서 핵심 기능 영향, 데이터는 안전 | 특정 도메인에서 페이지 collapse, 알림 발송 일부 실패 |
| SEV3 | 우회 가능한 결함, UX 저하 | 비핵심 화면 레이아웃 깨짐, 비핵심 기능 중단 |
| SEV4 | 사용자 영향 거의 없음 (관측 가능한 anomaly) | metrics spike, 비정상 로그 패턴 |

## Severity 트리거 매핑

| Severity | 즉시 행동 | 24h 이내 | 1주 이내 |
|----------|----------|---------|---------|
| SEV1 | 모든 작업 중단, 완화 | post-mortem draft | review + action item open |
| SEV2 | 완화 우선 | post-mortem draft | review + action item open |
| SEV3 | 다음 sprint에 처리 | post-mortem 작성 (선택) | — |
| SEV4 | 모니터링 노트만 | — | — |

본 첫 라운드에서는 SEV1/SEV2만 post-mortem 의무. 1인 운영자 부담을 고려.

## 인덱스

| 일자 | Severity | 제목 | 상태 |
|------|---------|------|------|
| 2026-05-11 | SEV2 | [Current session refresh — club context degradation in production](2026-05-11-current-session-refresh-club-context.md) | Closed |
