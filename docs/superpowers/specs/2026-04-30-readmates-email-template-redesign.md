# ReadMates Email Template Redesign

## Summary

ReadMates notification email should feel like a quiet, mature reading-club operating notice: warm, precise, and immediately actionable. The current plain text emails are too sparse for the product's operational quality. This design upgrades the five current email templates to a restrained HTML transactional format with a plain text fallback and preserves public-repo safety.

The selected visual direction is **Editorial ledger**: paper-like surfaces, ink-toned hierarchy, left-aligned reading rhythm, compact context rows, and one clear action. It should feel like a private reading-room notice or operating ledger, not a marketing newsletter.

## Goals

- Redesign the five current emails:
  - test mail
  - `NEXT_BOOK_PUBLISHED`
  - `SESSION_REMINDER_DUE`
  - `FEEDBACK_DOCUMENT_PUBLISHED`
  - `REVIEW_PUBLISHED`
- Make each email answer:
  - what happened
  - which session and book it concerns
  - what the member should do next
  - where to confirm it in ReadMates
- Send HTML email with a `text/plain` fallback.
- Keep notification implementation inside the existing server notification architecture.
- Add frontend login continuity so email CTA links return users to the original target after Google login.
- Avoid raw token, secret, private host, internal URL, raw member data, or private deployment values in code, tests, docs, or output.

## Non-Goals

- No marketing newsletter layout, illustrations, promotional sections, open tracking, or click tracking.
- No unsubscribe or preference deep link in this phase. The footer can say notification settings are available in the ReadMates profile.
- No dark-mode-specific email template in this phase. Email client support varies too much for the first implementation.
- No deployment or production SMTP configuration changes.
- No scheduler work for `SESSION_REMINDER_DUE`; the template can exist before production scheduling is completed.

## Architecture

### Server Notification Email

The server remains the source of notification delivery. The implementation should stay inside the `notification` package boundary:

```text
notification
  application.port.out
  application.service
  adapter.out.persistence
  adapter.out.mail
```

Current `NotificationDeliveryRowMappers.copyFor(...)` mixes in-app copy, email subject/body, and deep link construction. The redesigned HTML/plain templates would make that method too large. Introduce a feature-local template helper/value object under the notification package, owned by the email/notification slice. It should produce:

- in-app title/body/deep link where needed
- email subject
- email plain text
- email HTML
- CTA URL for member notification emails

`MailDeliveryCommand` should carry both `text` and optional `html`. `SmtpMailDeliveryAdapter` should switch from `SimpleMailMessage` to `MimeMessage` with `multipart/alternative` when HTML is present. Plain text must always be sent.

The existing `readmates.app-base-url` / `READMATES_APP_BASE_URL` setting should be reused to build absolute CTA URLs:

```text
{readmates.app-base-url}{deepLinkPath}
```

Tests should use only public-safe values such as `https://app.readmates.example`.

### Frontend Login Continuity

Email CTA links should point to actual app screens, not directly to OAuth. This gives the best behavior:

- already logged in: opens the target screen directly
- logged out: protected route redirects to login with a safe `returnTo`
- after Google OAuth: backend validates signed `returnTo` and redirects back to the target screen

The backend already supports signed `returnTo` through `OAuthReturnState` and `OAuthInviteTokenCaptureFilter`. The frontend should preserve the original target by redirecting unauthenticated protected routes to:

```text
/login?returnTo=<relative-current-path-and-query>
```

The login button should call:

```text
/oauth2/authorization/google?returnTo=<safe-relative-path>
```

Only same-origin relative paths should be accepted in frontend login continuity. Absolute URLs, protocol-relative URLs such as `//evil.example`, backslash-containing paths, and control characters should not be used by the login UI. Server-side validation remains the final authority.

## Visual Direction

Use the approved **Editorial ledger** direction:

- warm paper background
- ink-blue hierarchy
- restrained borders
- no gradients, glows, glassmorphism, tracking pixels, or decorative image assets
- left-aligned message structure
- compact context rows for session metadata
- one prominent CTA
- footer that clearly marks the email as a ReadMates transactional notification

Email CSS should be conservative because email clients vary. Prefer inline styles and table-compatible structure where practical. Avoid relying on external fonts, scripts, media queries as the only layout mechanism, or CSS features with poor email support.

## Common Email Structure

Each HTML email should include:

1. Brand row: `ReadMates` and a short event label.
2. Natural greeting: `{displayName ?: "멤버"}님,`.
3. One-sentence event summary.
4. Brief context: session number, book title, and what to review.
5. A clear CTA for member notification emails.
6. Short closing.
7. Footer: transactional notice and notification-settings guidance.

Each plain text fallback should mirror the same structure:

```text
ReadMates

{displayName}님,

{what happened}

회차: {sessionNumber}회차
책: {bookTitle}
확인할 일: {actionContext}

확인 링크: {absoluteCtaUrl}

ReadMates 알림 설정에 따라 발송된 메일입니다.
```

Test mail can omit CTA because hosts may send it to arbitrary recipients for delivery checks.

All dynamic HTML values must be escaped.

## Template Copy

### Test Mail

- Subject: `ReadMates 알림 테스트`
- Label: `delivery check`
- Title: `알림 메일 발송이 준비되었습니다`
- Body: ReadMates 알림 발송 설정이 정상적으로 동작하는지 확인하기 위한 테스트 메일.
- Context:
  - `용도`: `SMTP 발송 점검`
  - `범위`: `테스트 메일`
- CTA: none
- Closing: 실제 알림은 회차, 책, 확인할 일을 함께 담아 발송된다는 안내.

### `NEXT_BOOK_PUBLISHED`

- Subject: `{sessionNumber}회차 책이 공개되었습니다`
- Label: `next book`
- Title: `{sessionNumber}회차 책이 공개되었습니다`
- Body: 다음 모임에서 함께 읽을 책이 정해졌고, 모임 전 회차 정보와 준비 내용을 확인하라는 안내.
- Context:
  - `회차`: `{sessionNumber}회차`
  - `책`: `{bookTitle}`
  - `확인`: `일정과 준비 메모`
- CTA label: `ReadMates에서 회차 확인하기`
- Link: `/clubs/{clubSlug}/app/sessions/{sessionId}`

### `SESSION_REMINDER_DUE`

- Subject: `내일 {sessionNumber}회차 모임이 있습니다`
- Label: `session reminder`
- Title: `내일 {sessionNumber}회차 모임이 있습니다`
- Body: 모임 전 질문, 읽은 분량, 참석 상태를 확인하라는 운영 알림.
- Context:
  - `회차`: `{sessionNumber}회차`
  - `책`: `{bookTitle}`
  - `준비`: `질문, 읽은 분량, 참석 상태`
- CTA label: `모임 준비 확인하기`
- Link: `/clubs/{clubSlug}/app/sessions/{sessionId}`

### `FEEDBACK_DOCUMENT_PUBLISHED`

- Subject: `{sessionNumber}회차 피드백 문서가 올라왔습니다`
- Label: `feedback document`
- Title: `{sessionNumber}회차 피드백 문서가 올라왔습니다`
- Body: 참석했던 회차의 정리와 다음 읽기를 위한 메모를 확인하라는 안내.
- Context:
  - `회차`: `{sessionNumber}회차`
  - `책`: `{bookTitle}`
  - `확인`: `피드백 문서와 모임 정리`
- CTA label: `피드백 문서 확인하기`
- Link: `/clubs/{clubSlug}/app/feedback/{sessionId}`

This intentionally changes the email CTA from the current archive report view to the session-specific feedback document route.

### `REVIEW_PUBLISHED`

- Subject: `{sessionNumber}회차에 새 서평이 공개되었습니다`
- Label: `new review`
- Title: `{sessionNumber}회차에 새 서평이 공개되었습니다`
- Body: 같은 회차의 새 공개 서평이 올라왔고, ReadMates에서 서평 흐름을 확인하라는 안내.
- Context:
  - `회차`: `{sessionNumber}회차`
  - `책`: `{bookTitle}`
  - `확인`: `새로 공개된 서평`
- CTA label: `서평 확인하기`
- Link: `/clubs/{clubSlug}/app/notes?sessionId={sessionId}`

## Security And Privacy

- Do not include raw tokens, secrets, credentials, DB values, private domains, internal hosts, raw recipient emails, or private member data in subject, HTML body, plain text body, logs, tests, docs, or API responses.
- Keep host notification detail API responses body-free. Host detail may expose subject, masked recipient email, deep link path, and allowlisted metadata such as `sessionNumber` and `bookTitle`.
- Test fixtures must use `example.com`, `example.test`, or `https://app.readmates.example`.
- Dynamic email values must be HTML-escaped.
- The frontend login continuity must only forward safe relative `returnTo` values to OAuth.

## Testing Plan

Follow TDD:

1. Add or update tests for template rendering before implementation.
2. Implement template helper and command/model changes.
3. Implement `MimeMessage` delivery with plain text fallback.
4. Add frontend login continuity tests before changing the login flow.

Targeted checks:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.*'
pnpm --dir front test
```

Because this touches auth route/user flow, also run if feasible:

```bash
pnpm --dir front test:e2e
```

Depending on touched backend auth code and blast radius, run targeted auth tests or full server tests before claiming completion:

```bash
./server/gradlew -p server clean test
```

## Remaining Risks

- Gmail SMTP deliverability and client-specific HTML rendering cannot be fully proven by unit tests.
- HTML email support varies by client; the implementation must remain conservative and keep plain text fallback.
- `SESSION_REMINDER_DUE` still depends on production scheduler/caller work outside this template redesign.
- Login return continuity improves email CTA behavior, but role/membership authorization can still block users after login if they do not have access to the target club/session.
