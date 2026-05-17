# ReadMates Engineering Case Studies

운영 중인 ReadMates에서 풀어낸 비자명한 문제들의 deep-dive입니다. 각 case는 *문제 → 접근 → 구현 → 검증 → trade-off → 다시 한다면* 흐름을 따릅니다.

ADR(`docs/development/adr/`)이 결정의 결과 카드라면, case study는 그 결정에 도달한 사고 과정과 운영 검증 이야기입니다.

## 목록

1. [BFF 보안 경계와 무중단 secret rotation](01-bff-security-and-secret-rotation.md)
2. [Mutation과 알림 발송의 결합 분리 (transactional outbox)](02-notification-pipeline-with-outbox.md)
3. [Multi-club domain platform — host vs slug 우선순위](03-multi-club-domain-platform.md)
4. [PII-safe in-app AI session generation](04-pii-safe-ai-session-generation.md)
