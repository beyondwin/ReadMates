# ReadMates Notification UI Completion Design

## Context

ReadMates already has a server-side email notification pipeline built around a MySQL transactional outbox. The current backend records notification events, retries failed delivery, exposes host summary counts, and supports SMTP or logging delivery depending on runtime configuration. The frontend only partially exposes this capability: the host dashboard shows a small delivery summary, while the member my-page notification section is read-only and marked as 준비 중.

This design completes the product surface for email notifications. Members get real email preference controls. Hosts get a dedicated notification operations screen for delivery visibility, retries, dead-letter recovery, and test mail verification.

## Goals

- Replace the member my-page read-only notification rows with working email notification preferences.
- Add a host notification operations page at `/app/host/notifications`.
- Keep `notification_outbox` as the source of truth for member notification delivery.
- Add the fourth product notification, `REVIEW_PUBLISHED`, for newly public reviews on already published sessions.
- Let hosts process pending and failed delivery, retry individual items, restore dead items, and send test mail.
- Keep test mail separate from member notification outbox records.
- Minimize privacy exposure by avoiding raw test recipient email storage in audit records.

## Non-Goals

- Quiet hours, digest mode, frequency limits, push notifications, Kakao, SMS, or multi-channel delivery.
- Arbitrary outbox body edits.
- Manual `SENT`, `FAILED`, `PENDING`, or `DEAD` state changes outside the explicit restore/retry flows.
- Re-sending already `SENT` member notification rows.
- Host-composed test mail subject or body.
- Public-facing notification administration.

## Notification Events

The product supports four member email notification types:

| Event | Default | Trigger |
| --- | --- | --- |
| `NEXT_BOOK_PUBLISHED` | On | A host changes a draft session visibility from host-only to member/public. |
| `SESSION_REMINDER_DUE` | On | The scheduler enqueues reminders for tomorrow's visible draft/open sessions. |
| `FEEDBACK_DOCUMENT_PUBLISHED` | On | A host uploads a feedback document for a closed/published session with attended members. |
| `REVIEW_PUBLISHED` | Off | A public long review is newly saved for an already published, member/public session. |

The first three events preserve current delivery behavior for members who have not changed preferences. The new review event is opt-in by default because it is more social and potentially noisier than the existing operational notifications.

## Data Model

### Member Preferences

Add a `notification_preferences` table keyed by membership and club:

- `membership_id`
- `club_id`
- `email_enabled`
- `next_book_published_enabled`
- `session_reminder_due_enabled`
- `feedback_document_published_enabled`
- `review_published_enabled`
- `created_at`
- `updated_at`

`membership_id, club_id` should reference `memberships(id, club_id)` and be unique. The server treats a missing preference row as the default set:

- `email_enabled = true`
- `next_book_published_enabled = true`
- `session_reminder_due_enabled = true`
- `feedback_document_published_enabled = true`
- `review_published_enabled = false`

Preference rows are created or updated when a member saves settings. Delivery queries must apply both the global `email_enabled` flag and the event-specific flag. Only active memberships are eligible delivery recipients.

### Test Mail Audit

Add a separate `notification_test_mail_audit` table. Test mail is not inserted into `notification_outbox`.

The audit row stores:

- `id`
- `club_id`
- `host_membership_id`
- `recipient_masked_email`
- `recipient_email_hash`
- `status`
- `last_error`
- `created_at`
- `updated_at`

The audit record must not store the raw recipient email. The hash supports repeated-recipient investigation without exposing the address. The masked value supports host-facing readability, such as `a***@example.com`.

## Server Architecture

Extend the existing `notification` slice and preserve the current clean architecture shape:

```text
notification
  adapter.in.web / adapter.in.scheduler
  application.port.in
  application.service
  application.port.out
  adapter.out.persistence / adapter.out.mail
```

New inbound ports should cover:

- Reading and saving current member notification preferences.
- Listing host notification outbox items.
- Reading host notification item detail.
- Retrying a single eligible item.
- Restoring a dead item.
- Sending test mail.
- Listing recent test mail audit rows.

Persistence details stay in `notification.adapter.out.persistence`. Mail delivery stays behind `MailDeliveryPort`; test mail uses the same delivery port but writes audit records instead of outbox records.

## Member API

Add `/api/me/notifications/preferences`:

- `GET`: returns the current member's effective preferences, including defaults when no row exists.
- `PUT`: saves and returns the current member's preferences.

The response shape should include:

- `emailEnabled`
- `events.NEXT_BOOK_PUBLISHED`
- `events.SESSION_REMINDER_DUE`
- `events.FEEDBACK_DOCUMENT_PUBLISHED`
- `events.REVIEW_PUBLISHED`

The API authorizes only the current member's own membership. Members who can access the member app may read and save preferences, but delivery eligibility remains limited to active memberships.

## Host API

Extend `/api/host/notifications`:

- `GET /summary`: keep the existing summary endpoint.
- `GET /items`: list current club outbox rows with pagination and filters.
- `GET /items/{id}`: read one current club outbox row.
- `POST /process`: keep the existing club-scoped pending/failed batch processing endpoint.
- `POST /items/{id}/retry`: process one eligible `PENDING` or `FAILED` item.
- `POST /items/{id}/restore`: restore one `DEAD` item to a retryable state.
- `POST /test-mail`: send a fixed-template test email to the host email or one host-provided email address.
- `GET /test-mail/audit`: list recent test mail audit rows for the host's club.

All host endpoints require an active host in the same club. Cross-club access must return a denial or not-found response without leaking item existence.

`GET /items` filters:

- Status: `PENDING`, `SENDING`, `SENT`, `FAILED`, `DEAD`
- Event type
- Date range
- Recipient search, implemented carefully so raw email search does not leak outside host scope

The item list and detail response return masked recipient emails, not raw recipient emails. Detail includes delivery metadata, deep link path, subject, status, attempt count, timestamps, and a summarized last error. Detail does not return `body_text` in v1. Message template inspection stays outside this scope.

## Delivery Rules

Existing enqueue queries must join or otherwise apply effective notification preferences. A member receives an event only when:

- The membership is active.
- `email_enabled` is true or no preference row exists.
- The event-specific flag is true by row value or by default.
- Existing event-specific eligibility rules still pass.

`REVIEW_PUBLISHED` is triggered when a long review is saved and all of these are true:

- The current session is already `PUBLISHED`.
- The session visibility is `MEMBER` or `PUBLIC`.
- The saved long review is public according to existing note visibility rules.
- The review body is non-empty after existing validation.
- The recipient is an active member in the same club.
- The recipient is not the author.
- The recipient has global email notifications and `REVIEW_PUBLISHED` enabled.

The dedupe key for review notifications should include event type, session id, author membership id, and recipient membership id. This prevents repeated emails for the same author's same-session review while still allowing different authors' reviews to notify the same recipient.

## Host UI

Keep the existing host dashboard notification summary, but add a clear link to `/app/host/notifications`.

The dedicated host page should feel like an operating ledger:

- Summary strip: pending, failed, dead, sent in the last 24 hours.
- Toolbar: status filter, event filter, date filter, recipient search.
- Primary actions: process pending/failed, open test mail dialog.
- List rows: event, status, masked recipient, attempt count, next attempt or updated time.
- Detail panel or modal: subject, deep link, timestamps, last error summary, available actions.
- `FAILED` and `PENDING` rows: individual retry action.
- `DEAD` rows: restore action with confirmation.
- Test mail modal: choose host email or enter one email address, then confirm before sending.
- Test audit section: recent test mail attempts with masked recipient, status, and time.

Dangerous actions should use confirmation modals that say how many rows or which recipient can result in real email delivery. The UI must not offer arbitrary state changes or sent-row resend actions.

## Member UI

Replace the `/app/me` read-only notification section with working controls:

- A top-level "이메일 알림" switch.
- Four event switches below it.
- Event labels use product language rather than enum names.
- Existing defaults are reflected on first load.
- When the global switch is off, event values remain visible but are visually disabled or grouped under "전체 알림 꺼짐".
- Save with an explicit button rather than autosave.
- On save failure, keep the user's edited state visible and show a concise error with retry affordance.

Recommended labels:

- 다음 책 공개
- 모임 전날 리마인더
- 피드백 문서 등록
- 다른 멤버의 서평 공개

The UI should keep the current ReadMates tone: calm, Korean-first, and operationally clear. It should not over-explain the feature inside the app.

## Test Mail Behavior

Test mail is a host operations tool.

Rules:

- One recipient per request.
- Recipient can be the host's own email or a host-entered email address.
- The host cannot edit the subject or body.
- The body identifies the message as a ReadMates notification delivery test.
- The raw recipient email is used only for the SMTP call and is not stored in audit.
- Success and failure are both recorded in audit.
- The UI displays only masked recipient email values.

The implementation adds a simple server-side cooldown: one test email per host membership every 60 seconds. It also validates one recipient per request and does not support bulk test mail.

## Error Handling

Delivery errors and operation errors are separate:

- SMTP failures update outbox or test audit status and retain a bounded error string.
- Host operations reject invalid state transitions, cross-club access, invalid email, and ineligible retry/restore targets.
- Preference save errors should return clear validation or authorization failures.
- UI messages should be concise and in Korean.

Expected host operation failures:

- Already sent or ineligible row.
- Dead row restore race.
- Invalid test email address.
- SMTP delivery failure.
- Unauthorized or non-host access.

## Privacy and Security

- Host notification APIs are club-scoped and require active host role.
- Member preference APIs only read and write the current membership.
- Test mail audit stores masked email and hash only.
- Logs, metric labels, cache keys, and public docs must not include raw email, display names, tokens, private domains, or message body.
- Public examples use `example.com` addresses only.
- The test mail template is fixed to prevent the app from becoming a general-purpose mail sender.
- `notification_outbox` remains an append-only operational record except explicit retry bookkeeping and dead restore.

## Testing

Server tests:

- Preference default response returns existing three events on and review off.
- Preference save persists global and event-level flags.
- Preference API rejects access outside the current member.
- Existing enqueue paths skip recipients who disabled global or event-specific email.
- `REVIEW_PUBLISHED` enqueues only for already published visible sessions.
- `REVIEW_PUBLISHED` excludes the author.
- `REVIEW_PUBLISHED` respects opt-in default and dedupe key.
- Host item list filters by club, status, event, and date.
- Retry rejects sent/dead rows and processes eligible pending/failed rows.
- Restore only accepts dead rows and makes them retryable.
- Test mail sends fixed content, records audit success/failure, and never stores raw recipient email.

Frontend tests:

- My-page notification preferences render defaults.
- Global toggle disables event controls without losing values.
- Save success updates clean state.
- Save failure keeps edited values and shows retryable error.
- Host notification page renders summary, filters, rows, and action availability by status.
- Test mail dialog confirms target and displays result.

Recommended final checks:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

For a narrow implementation pass, targeted notification server tests and affected frontend unit tests can run first, followed by the full checks before shipping.

## Rollout Notes

1. Add migrations with defaults that do not change existing three-event delivery for members without preference rows.
2. Deploy backend preference filtering before exposing the member settings UI.
3. Add the host operations page with clear confirmations before enabling test mail.
4. Watch host summary counts and notification metrics after deployment.
5. Update deployment docs only when runtime configuration, runbook behavior, or operator commands change.
