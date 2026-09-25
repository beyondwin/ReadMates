# Guest-Mode Walkthrough

로그인 없이 볼 수 있는 공개 화면과, 볼 수 없는 비공개 흐름을 어떤 근거로 확인할지 정리합니다.

현재 동작의 기준은 public route 코드와 `docs/development/architecture.md`입니다.

## 로그인 없이 볼 수 있는 것

게스트는 클럽이 `ACTIVE`이고 `PUBLIC`이면 아래 화면을 볼 수 있습니다.

| 표면 | 경로 | 확인할 수 있는 것 |
| --- | --- | --- |
| 클럽 소개 | `/clubs/<club-slug>` 또는 `/clubs/<club-slug>/about` | 클럽의 공개 소개와 공개 진입 경험 |
| 공개 기록 | `/clubs/<club-slug>/records` | 공개된 회차 목록과 archive 흐름 |
| 공개 세션 상세 | `/clubs/<club-slug>/sessions/<session-id>` | 공개 요약, 하이라이트, 한줄평 등 공개 범위에 포함된 기록 |
| 게스트 앱 | `/clubs/<club-slug>/app` | 읽기 전용 둘러보기. `GUEST_READABLE` 세션의 현재·예정·기록을 보고, 쓰기와 피드백 문서는 잠겨 있습니다. |

기본 경로는 Cloudflare Pages 기본 도메인의 `/clubs/<club-slug>`입니다. 연결된 custom domain은 운영 설정에 따라 다르므로 이 문서는 경로만 적습니다.

## 추천 관람 순서

1. 클럽 소개에서 공개 첫인상을 봅니다.
2. 공개 기록 목록에서 회차가 쌓이는 방식을 봅니다.
3. 공개 세션 상세에서 모임 후 기록이 어떻게 읽히는지 봅니다.
4. 게스트 앱에서 멤버 화면이 권한에 따라 어떻게 잠기는지 봅니다.
5. README의 Engineering Highlights로 돌아가 BFF, 공개 범위, 알림, AI 생성 근거를 봅니다.

## 로그인 없이 볼 수 없는 것

아래 흐름은 권한상 게스트에게 열지 않습니다.

| 비공개 흐름 | 열지 않는 이유 | 확인 근거 |
| --- | --- | --- |
| 멤버 현재 세션 참여, RSVP, 질문, 서평 작성 | 정식 멤버 권한과 club membership이 필요합니다. | `docs/development/architecture.md`, frontend route guard test |
| 호스트 세션 생성/수정, 출석 확정, 기록 발행 | 클럽 host 권한이 필요합니다. | host route test, session server test, case study |
| 피드백 문서 열람 | 같은 클럽의 active 정식 멤버나 호스트만 읽습니다. | `FeedbackDocumentService`, `docs/development/architecture.md`의 피드백 문서 흐름 |
| 호스트 운영 → 멤버 reading loop | 호스트 운영 상태와 멤버 준비 상태는 membership과 role에 묶인 비공개 흐름입니다. | `front/shared/model/reading-loop.ts`, `front/tests/e2e/dev-login-session-flow.spec.ts`, member/host route test |
| Platform admin onboarding/domain/support | platform admin 권한이 필요합니다. | `front/tests/e2e/admin-*.spec.ts`, server authorization test |
| 앱 안 AI 세션 생성 | host 권한, feature flag, provider key, 비용/PII guard가 필요합니다. | `docs/case-studies/04-pii-safe-ai-session-generation.md`, AI runbook, `scripts/aigen-pii-check.sh` |
| 수동 알림 발송 | host 권한과 알림 outbox pipeline이 필요합니다. | `docs/case-studies/02-notification-pipeline-with-outbox.md`, `front/tests/e2e/manual-notifications.spec.ts` |

## Host -> Member Reading Loop Evidence

호스트는 세션 생성, 공개 범위, 누락 멤버, RSVP·읽기·질문 준비 상태를 운영 관점에서 닫습니다. 멤버는 같은 세션을 RSVP, 읽은 분량, 질문, 회고, 아카이브로 이어 갑니다.

이 흐름은 게스트 권한으로 열지 않습니다. 대신 아래로 확인합니다.

- role-safe 파생 모델: `front/shared/model/reading-loop.ts`, `reading-loop.test.ts`
- host/member/current-session 단위 테스트
- E2E: `front/tests/e2e/dev-login-session-flow.spec.ts`, `front/tests/e2e/member-reading-momentum.spec.ts`

문서에는 실제 멤버 데이터나 비공개 route 접근 권한을 추가하지 않습니다.

## Public-Safety Notes

- 이 walkthrough는 게스트 권한을 넓히지 않습니다.
- 실제 멤버 데이터, private domain, 운영 secret, provider key, 배포 상태는 쓰지 않습니다.
- screenshot은 synthetic 또는 sanitized fixture로만 만듭니다.
- 비공개 흐름은 권한을 열지 않고 테스트, runbook, sanitized 설명으로 보여 줍니다.
