# Guest-Mode Walkthrough

이 문서는 ReadMates를 처음 보는 리뷰어가 로그인 없이 확인할 수 있는 공개 제품 표면과, 로그인 없이 볼 수 없는 private workflow를 어떤 evidence로 확인할지 정리합니다.

현재 동작의 source of truth는 public route code와 `docs/development/architecture.md`입니다.

## 로그인 없이 볼 수 있는 것

Guest는 클럽이 `ACTIVE`이고 `PUBLIC`인 경우 아래 표면을 볼 수 있습니다.

| 표면 | 경로 | 확인할 수 있는 것 |
| --- | --- | --- |
| 클럽 소개 | `/clubs/<club-slug>` 또는 `/clubs/<club-slug>/about` | 클럽의 공개 소개와 공개 진입 경험 |
| 공개 기록 | `/clubs/<club-slug>/records` | 공개된 회차 목록과 archive 흐름 |
| 공개 세션 상세 | `/clubs/<club-slug>/sessions/<session-id>` | 공개 요약, 하이라이트, 한줄평 등 공개 범위에 포함된 기록 |

운영 fallback 경로는 `https://readmates.pages.dev/clubs/<club-slug>` 형태입니다. 등록된 custom domain은 운영 설정에 따라 달라지므로 이 문서에서는 placeholder만 사용합니다.

## 추천 관람 순서

1. 클럽 소개에서 제품의 공개 첫인상을 확인합니다.
2. 공개 기록 목록에서 회차가 누적되는 방식을 확인합니다.
3. 공개 세션 상세에서 모임 후 기록이 어떻게 읽히는지 확인합니다.
4. README의 Engineering Highlights로 돌아가 공개 화면 뒤의 BFF, publication visibility, notification, AI generation 근거를 확인합니다.

## 로그인 없이 볼 수 없는 것

아래 흐름은 제품 권한상 guest에게 공개하지 않습니다.

| Private workflow | 공개하지 않는 이유 | 확인 evidence |
| --- | --- | --- |
| 멤버 현재 세션 참여, RSVP, 질문, 서평 작성 | 정식 멤버 권한과 club membership이 필요합니다. | `docs/development/architecture.md`, frontend route guard tests |
| 호스트 세션 생성/수정, 출석 확정, 기록 발행 | 클럽 host 권한이 필요합니다. | host route tests, session server tests, case studies |
| Platform admin onboarding/domain/support access | platform admin 권한이 필요합니다. | platform admin plan/spec, server authorization tests |
| In-app AI 세션 생성 | host 권한, feature flag, provider key, cost/PII guard가 필요합니다. | `docs/case-studies/04-pii-safe-ai-session-generation.md`, AI runbook, `scripts/aigen-pii-check.sh` |
| 수동 알림 발송 | host 권한과 notification outbox pipeline이 필요합니다. | `docs/case-studies/02-notification-pipeline-with-outbox.md`, notification tests |

## Public-Safety Notes

- 이 walkthrough는 guest 권한을 넓히지 않습니다.
- 실제 멤버 데이터, private domain, 운영 secret, provider key, deployment state는 사용하지 않습니다.
- Screenshot을 추가할 때는 synthetic 또는 sanitized fixture만 사용합니다.
- Private workflow를 보여줄 필요가 있으면 접근 권한을 열지 않고 테스트, runbook, sanitized 설명으로 연결합니다.
