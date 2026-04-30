# ReadMates Email Template Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship polished HTML transactional notification emails with plain text fallback and preserve email CTA return-to-login continuity.

**Architecture:** Keep copy rendering in a pure notification application/model helper so persistence, dispatch, processing, and test-mail code can share one source of truth without crossing adapter boundaries. Keep SMTP-specific MIME construction inside `notification.adapter.out.mail`. Add a small frontend auth-return helper so guarded routes and the login route preserve safe relative return targets.

**Tech Stack:** Kotlin 2.2, Spring Boot 4 mail (`JavaMailSender`, `MimeMessageHelper`), AssertJ/JUnit 5, React Router 7, Vite/Vitest, Testing Library.

---

## Scope Notes

- Existing uncommitted files are present before this work: `.gitignore`, `KafkaNotificationEventPublisherAdapter.kt`, and `KafkaNotificationEventPublisherAdapterTest.kt`. Do not revert or stage them unless the user explicitly asks.
- The approved design spec is `docs/superpowers/specs/2026-04-30-readmates-email-template-redesign.md`.
- This plan intentionally touches both server notification email and frontend auth continuity. It does not deploy, change SMTP credentials, or read `.server-config/`.

## File Structure

- Create `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`
  - Pure renderer for event copy, test-mail copy, HTML escaping, and absolute CTA URL construction.
- Create `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEmailTemplatesTest.kt`
  - Unit coverage for all five templates, HTML escaping, public-safe URL generation, and plain text fallback.
- Modify `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
  - Add `bodyHtml: String?` to email delivery models.
- Modify `server/src/main/kotlin/com/readmates/notification/application/port/out/MailDeliveryPort.kt`
  - Add optional `html: String?` to `MailDeliveryCommand`.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`
  - Delegate copy rendering to `NotificationEmailTemplates`; keep host detail body-free.
- Modify `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
  - Forward `bodyHtml` into `MailDeliveryCommand`.
- Modify `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
  - Forward `bodyHtml` into `MailDeliveryCommand`.
- Modify `server/src/main/kotlin/com/readmates/notification/application/service/NotificationTestMailService.kt`
  - Use the shared test-mail template.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt`
  - Send multipart HTML/plain MIME when HTML is present.
- Create `server/src/test/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapterTest.kt`
  - Verify MIME structure and fallback behavior.
- Update existing notification tests:
  - `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`
  - `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt`
  - `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt`
  - `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`
- Create `front/shared/auth/login-return.ts`
  - Pure safe-return helpers.
- Create `front/tests/unit/login-return.test.ts`
  - Pure helper tests.
- Modify `front/shared/auth/member-app-loader.ts`
  - Redirect anonymous loader auth to login with return target.
- Modify `front/shared/api/client.ts`
  - Redirect 401s to login with return target.
- Modify `front/src/app/route-guards.tsx`
  - Redirect anonymous guarded UI routes to login with return target.
- Modify `front/features/auth/route/login-route.tsx`
  - Pass safe OAuth href to login card and dev-login redirect.
- Modify `front/features/auth/ui/login-card.tsx`
  - Accept `googleLoginHref`.
- Update frontend tests:
  - `front/tests/unit/login-card.test.tsx`
  - `front/tests/unit/auth-context.test.tsx`
  - `front/tests/unit/member-app-access.test.ts`
  - `front/tests/unit/readmates-fetch.test.ts`
  - `front/tests/unit/spa-router.test.tsx`

---

### Task 1: Add Pure Email Template Tests

**Files:**
- Create: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEmailTemplatesTest.kt`
- Later implementation target: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`

- [x] **Step 1: Write the failing tests**

Create `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEmailTemplatesTest.kt`:

```kotlin
package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class NotificationEmailTemplatesTest {
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    @Test
    fun `renders next book email with editorial ledger structure and absolute cta`() {
        val copy = NotificationEmailTemplates.eventCopy(
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            sessionId = sessionId,
            sessionNumber = 8,
            bookTitle = "Distributed Systems",
            clubSlug = "reading-sai",
            displayName = "민서",
            appBaseUrl = "https://app.readmates.example",
        )

        assertThat(copy.title).isEqualTo("8회차 책이 공개되었습니다")
        assertThat(copy.body).isEqualTo("8회차 Distributed Systems 책이 공개되었습니다.")
        assertThat(copy.deepLinkPath).isEqualTo("/clubs/reading-sai/app/sessions/$sessionId")
        assertThat(copy.emailSubject).isEqualTo("8회차 책이 공개되었습니다")
        assertThat(copy.emailBodyText).contains(
            "ReadMates",
            "민서님,",
            "다음 모임에서 함께 읽을 책이 정해졌습니다.",
            "회차: 8회차",
            "책: Distributed Systems",
            "확인할 일: 일정과 준비 메모",
            "확인 링크: https://app.readmates.example/clubs/reading-sai/app/sessions/$sessionId",
        )
        assertThat(copy.emailBodyHtml).contains(
            "<strong>ReadMates</strong>",
            "next book",
            "8회차 책이 공개되었습니다",
            "민서님,",
            "Distributed Systems",
            "ReadMates에서 회차 확인하기",
            "https://app.readmates.example/clubs/reading-sai/app/sessions/$sessionId",
        )
    }

    @Test
    fun `renders all event subjects actions and links`() {
        val cases = listOf(
            NotificationEventType.SESSION_REMINDER_DUE to ExpectedEmail(
                subject = "내일 8회차 모임이 있습니다",
                label = "session reminder",
                context = "질문, 읽은 분량, 참석 상태",
                cta = "모임 준비 확인하기",
                path = "/clubs/reading-sai/app/sessions/$sessionId",
            ),
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to ExpectedEmail(
                subject = "8회차 피드백 문서가 올라왔습니다",
                label = "feedback document",
                context = "피드백 문서와 모임 정리",
                cta = "피드백 문서 확인하기",
                path = "/clubs/reading-sai/app/feedback/$sessionId",
            ),
            NotificationEventType.REVIEW_PUBLISHED to ExpectedEmail(
                subject = "8회차에 새 서평이 공개되었습니다",
                label = "new review",
                context = "새로 공개된 서평",
                cta = "서평 확인하기",
                path = "/clubs/reading-sai/app/notes?sessionId=$sessionId",
            ),
        )

        cases.forEach { (eventType, expected) ->
            val copy = NotificationEmailTemplates.eventCopy(
                eventType = eventType,
                sessionId = sessionId,
                sessionNumber = 8,
                bookTitle = "Distributed Systems",
                clubSlug = "reading-sai",
                displayName = null,
                appBaseUrl = "https://app.readmates.example/",
            )

            assertThat(copy.emailSubject).isEqualTo(expected.subject)
            assertThat(copy.emailBodyText).contains("멤버님,", expected.context, "https://app.readmates.example${expected.path}")
            assertThat(copy.emailBodyHtml).contains(expected.label, expected.cta, "https://app.readmates.example${expected.path}")
            assertThat(copy.deepLinkPath).isEqualTo(expected.path)
        }
    }

    @Test
    fun `escapes dynamic values in html while keeping readable text fallback`() {
        val copy = NotificationEmailTemplates.eventCopy(
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            sessionId = sessionId,
            sessionNumber = 8,
            bookTitle = """책 <script>alert("x")</script> & 기록""",
            clubSlug = "reading-sai",
            displayName = """민서 <img src=x onerror=alert(1)>""",
            appBaseUrl = "https://app.readmates.example",
        )

        assertThat(copy.emailBodyHtml)
            .contains("민서 &lt;img src=x onerror=alert(1)&gt;님")
            .contains("책 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; 기록")
            .doesNotContain("<script>")
            .doesNotContain("<img")
        assertThat(copy.emailBodyText)
            .contains("""민서 <img src=x onerror=alert(1)>님""")
            .contains("""책 <script>alert("x")</script> & 기록""")
    }

    @Test
    fun `renders test mail without cta`() {
        val copy = NotificationEmailTemplates.testMailCopy()

        assertThat(copy.emailSubject).isEqualTo("ReadMates 알림 테스트")
        assertThat(copy.emailBodyText).contains("알림 메일 발송이 준비되었습니다", "SMTP 발송 점검")
        assertThat(copy.emailBodyHtml).contains("delivery check", "알림 메일 발송이 준비되었습니다")
        assertThat(copy.emailBodyHtml).doesNotContain("<a ")
        assertThat(copy.deepLinkPath).isNull()
    }

    private data class ExpectedEmail(
        val subject: String,
        val label: String,
        val context: String,
        val cta: String,
        val path: String,
    )
}
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.model.NotificationEmailTemplatesTest'
```

Expected: compilation fails because `NotificationEmailTemplates` and its return type do not exist.

---

### Task 2: Implement Shared Email Template Rendering

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEmailTemplatesTest.kt`

- [x] **Step 1: Add the pure renderer**

Create `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`:

```kotlin
package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import java.net.URI
import java.util.UUID

data class NotificationRenderedCopy(
    val title: String,
    val body: String,
    val deepLinkPath: String?,
    val emailSubject: String,
    val emailBodyText: String,
    val emailBodyHtml: String,
)

object NotificationEmailTemplates {
    fun eventCopy(
        eventType: NotificationEventType,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        clubSlug: String,
        displayName: String?,
        appBaseUrl: String,
    ): NotificationRenderedCopy {
        val memberName = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: "멤버"
        val detail = detailFor(eventType, sessionId, sessionNumber, bookTitle, clubSlug)
        val ctaUrl = absoluteUrl(appBaseUrl, detail.deepLinkPath)
        val contextRows = listOf(
            "회차" to "${sessionNumber}회차",
            "책" to bookTitle,
            detail.contextLabel to detail.contextValue,
        )

        return NotificationRenderedCopy(
            title = detail.title,
            body = detail.inAppBody,
            deepLinkPath = detail.deepLinkPath,
            emailSubject = detail.subject,
            emailBodyText = textEmail(
                memberName = memberName,
                body = detail.body,
                contextRows = contextRows,
                ctaUrl = ctaUrl,
            ),
            emailBodyHtml = htmlEmail(
                label = detail.label,
                title = detail.title,
                memberName = memberName,
                body = detail.body,
                contextRows = contextRows,
                ctaLabel = detail.ctaLabel,
                ctaUrl = ctaUrl,
                footer = "이 메일은 ReadMates 알림 설정에 따라 발송되었습니다. 알림 설정은 ReadMates 내 프로필에서 변경할 수 있습니다.",
            ),
        )
    }

    fun testMailCopy(): NotificationRenderedCopy =
        NotificationRenderedCopy(
            title = "알림 메일 발송이 준비되었습니다",
            body = "ReadMates 알림 발송 설정을 확인하기 위한 테스트 메일입니다.",
            deepLinkPath = null,
            emailSubject = "ReadMates 알림 테스트",
            emailBodyText = """
                ReadMates

                알림 메일 발송이 준비되었습니다.

                용도: SMTP 발송 점검
                범위: 테스트 메일

                실제 알림은 회차, 책, 확인할 일을 함께 담아 발송됩니다.
            """.trimIndent(),
            emailBodyHtml = htmlEmail(
                label = "delivery check",
                title = "알림 메일 발송이 준비되었습니다",
                memberName = null,
                body = "ReadMates 알림 발송 설정이 정상적으로 동작하는지 확인하기 위한 테스트 메일입니다.",
                contextRows = listOf(
                    "용도" to "SMTP 발송 점검",
                    "범위" to "테스트 메일",
                ),
                ctaLabel = null,
                ctaUrl = null,
                footer = "실제 알림은 회차, 책, 확인할 일을 함께 담아 발송됩니다.",
            ),
        )

    private fun detailFor(
        eventType: NotificationEventType,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        clubSlug: String,
    ): EventEmailDetail =
        when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> EventEmailDetail(
                label = "next book",
                subject = "${sessionNumber}회차 책이 공개되었습니다",
                title = "${sessionNumber}회차 책이 공개되었습니다",
                body = "다음 모임에서 함께 읽을 책이 정해졌습니다. 모임 전 ReadMates에서 회차 정보와 준비할 내용을 확인해 주세요.",
                contextLabel = "확인",
                contextValue = "일정과 준비 메모",
                ctaLabel = "ReadMates에서 회차 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/sessions/$sessionId"),
                inAppBody = "${sessionNumber}회차 $bookTitle 책이 공개되었습니다.",
            )

            NotificationEventType.SESSION_REMINDER_DUE -> EventEmailDetail(
                label = "session reminder",
                subject = "내일 ${sessionNumber}회차 모임이 있습니다",
                title = "내일 ${sessionNumber}회차 모임이 있습니다",
                body = "내일은 $bookTitle 모임이 있습니다. 모임 전 질문, 읽은 분량, 참석 상태를 확인해 주세요.",
                contextLabel = "준비",
                contextValue = "질문, 읽은 분량, 참석 상태",
                ctaLabel = "모임 준비 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/sessions/$sessionId"),
                inAppBody = "내일 ${sessionNumber}회차 $bookTitle 모임이 있습니다.",
            )

            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> EventEmailDetail(
                label = "feedback document",
                subject = "${sessionNumber}회차 피드백 문서가 올라왔습니다",
                title = "${sessionNumber}회차 피드백 문서가 올라왔습니다",
                body = "$bookTitle 모임의 피드백 문서가 준비되었습니다. 참석했던 회차의 정리와 다음 읽기를 위한 메모를 확인해 주세요.",
                contextLabel = "확인",
                contextValue = "피드백 문서와 모임 정리",
                ctaLabel = "피드백 문서 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/feedback/$sessionId"),
                inAppBody = "${sessionNumber}회차 $bookTitle 피드백 문서가 올라왔습니다.",
            )

            NotificationEventType.REVIEW_PUBLISHED -> EventEmailDetail(
                label = "new review",
                subject = "${sessionNumber}회차에 새 서평이 공개되었습니다",
                title = "${sessionNumber}회차에 새 서평이 공개되었습니다",
                body = "$bookTitle 회차에 새 공개 서평이 올라왔습니다. ReadMates에서 같은 회차의 서평 흐름을 확인해 주세요.",
                contextLabel = "확인",
                contextValue = "새로 공개된 서평",
                ctaLabel = "서평 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/notes?sessionId=$sessionId"),
                inAppBody = "${sessionNumber}회차 $bookTitle 에 새 서평이 공개되었습니다.",
            )
        }

    private fun textEmail(
        memberName: String,
        body: String,
        contextRows: List<Pair<String, String>>,
        ctaUrl: String,
    ): String =
        buildString {
            appendLine("ReadMates")
            appendLine()
            appendLine("${memberName}님,")
            appendLine()
            appendLine(body)
            appendLine()
            contextRows.forEach { (label, value) -> appendLine("$label: $value") }
            appendLine()
            appendLine("확인 링크: $ctaUrl")
            appendLine()
            append("ReadMates 알림 설정에 따라 발송된 메일입니다.")
        }

    private fun htmlEmail(
        label: String,
        title: String,
        memberName: String?,
        body: String,
        contextRows: List<Pair<String, String>>,
        ctaLabel: String?,
        ctaUrl: String?,
        footer: String,
    ): String {
        val greeting = memberName?.let { "<p style=\"margin:0 0 14px;color:#2f3a4e;font-size:15px;line-height:1.75;\">${escapeHtml(it)}님,</p>" } ?: ""
        val cta = if (!ctaLabel.isNullOrBlank() && !ctaUrl.isNullOrBlank()) {
            """
            <tr>
              <td style="padding:28px 0 0;">
                <a href="${escapeHtml(ctaUrl)}" style="display:block;padding:14px 18px 15px;border:1px solid #1f3b61;background:#27466f;color:#f9f3e9;text-align:center;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(ctaLabel)}</a>
              </td>
            </tr>
            """.trimIndent()
        } else {
            ""
        }
        val rows = contextRows.joinToString("") { (rowLabel, rowValue) ->
            """
            <tr>
              <td style="padding:8px 12px 8px 0;border-top:1px solid #e9ded0;color:#687084;font-size:14px;line-height:1.45;vertical-align:top;width:82px;">${escapeHtml(rowLabel)}</td>
              <td style="padding:8px 0;border-top:1px solid #e9ded0;color:#17233a;font-size:14px;line-height:1.45;font-weight:700;vertical-align:top;">${escapeHtml(rowValue)}</td>
            </tr>
            """.trimIndent()
        }

        return """
            <!doctype html>
            <html lang="ko">
              <body style="margin:0;padding:0;background:#f4efe6;color:#17233a;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe6;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                  <tr>
                    <td align="center">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffaf1;border:1px solid #d9cdbd;">
                        <tr>
                          <td style="padding:32px 32px 34px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                              <tr>
                                <td style="padding:0 0 18px;border-bottom:1px solid #e9ded0;">
                                  <strong style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;letter-spacing:0;color:#17233a;">ReadMates</strong>
                                  <span style="float:right;color:#687084;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(label)}</span>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:28px 0 0;color:#58634b;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(label)}</td>
                              </tr>
                              <tr>
                                <td style="padding:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.12;font-weight:500;color:#17233a;">${escapeHtml(title)}</td>
                              </tr>
                              <tr>
                                <td style="padding:22px 0 0;">
                                  $greeting
                                  <p style="margin:0;color:#2f3a4e;font-size:15px;line-height:1.78;">${escapeHtml(body)}</p>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:26px 0 0;">
                                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d9cdbd;background:#fbf3e6;padding:8px 17px;">$rows</table>
                                </td>
                              </tr>
                              $cta
                              <tr>
                                <td style="padding:22px 0 0;color:#687084;font-size:13px;line-height:1.65;">조용히 읽고, 필요한 준비만 놓치지 않도록 알려드립니다.</td>
                              </tr>
                              <tr>
                                <td style="padding:18px 0 0;border-top:1px solid #e9ded0;color:#747b8b;font-size:11px;line-height:1.5;">${escapeHtml(footer)}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
        """.trimIndent()
    }

    private fun absoluteUrl(appBaseUrl: String, path: String): String {
        val origin = readmatesAppOrigin(appBaseUrl)
        return "$origin${path.ensureLeadingSlash()}"
    }

    private fun String.ensureLeadingSlash(): String =
        if (startsWith("/")) this else "/$this"

    private fun escapeHtml(value: String): String =
        buildString(value.length) {
            value.forEach { char ->
                append(
                    when (char) {
                        '&' -> "&amp;"
                        '<' -> "&lt;"
                        '>' -> "&gt;"
                        '"' -> "&quot;"
                        '\'' -> "&#39;"
                        else -> char
                    },
                )
            }
        }

    private data class EventEmailDetail(
        val label: String,
        val subject: String,
        val title: String,
        val body: String,
        val contextLabel: String,
        val contextValue: String,
        val ctaLabel: String,
        val deepLinkPath: String,
        val inAppBody: String,
    )
}
```

- [x] **Step 2: Run the renderer test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.model.NotificationEmailTemplatesTest'
```

Expected: PASS.

- [x] **Step 3: Commit (skipped)**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt \
  server/src/test/kotlin/com/readmates/notification/application/model/NotificationEmailTemplatesTest.kt
git commit -m "feat: add notification email templates"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 3: Carry HTML Copy Through Delivery Models

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [x] **Step 1: Write/update failing persistence assertions**

In `JdbcNotificationDeliveryAdapterTest`, update the assertions in `persistPlannedDeliveries plans from persisted outbox event when Kafka message fields are stale`:

```kotlin
assertThat(deliveries.filter { it.channel == NotificationChannel.EMAIL })
    .extracting<String?> { it.subject }
    .containsOnly("1회차 피드백 문서가 올라왔습니다")
assertThat(deliveries.filter { it.channel == NotificationChannel.EMAIL })
    .extracting<String?> { it.bodyHtml }
    .allSatisfy {
        assertThat(it).contains("feedback document", "피드백 문서 확인하기", "/clubs/reading-sai/app/feedback/$sessionId")
        assertThat(it).doesNotContain("Kafka payload book")
    }
```

Update `claimEmailDelivery renders email copy from immutable event payload`:

```kotlin
assertThat(claimed.subject).isEqualTo("1회차 피드백 문서가 올라왔습니다")
assertThat(claimed.bodyText).contains("1회차", "팩트풀니스", "확인 링크:")
assertThat(claimed.bodyHtml).contains("feedback document", "피드백 문서 확인하기", "/clubs/reading-sai/app/feedback/$sessionId")
assertThat(claimed.bodyText).doesNotContain("99회차")
assertThat(claimed.bodyHtml).doesNotContain("변경된 책")
```

In `HostNotificationControllerTest`, update host detail subject but keep body non-exposure:

```kotlin
jsonPath("$.subject") { value("3회차 피드백 문서가 올라왔습니다") }
```

and add:

```kotlin
assertThat(response).doesNotContain("bodyHtml")
assertThat(response).doesNotContain("<html")
```

- [x] **Step 2: Run the persistence/controller tests to verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest' --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: compilation fails because `bodyHtml` does not exist, and old subject expectations still come from old copy.

- [x] **Step 3: Add `bodyHtml` to delivery models**

In `NotificationModels.kt`, add `bodyHtml: String?` to both delivery models:

```kotlin
data class NotificationDeliveryItem(
    val id: UUID,
    val eventId: UUID,
    val clubId: UUID,
    val recipientMembershipId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime?,
    val recipientEmail: String?,
    val subject: String?,
    val bodyText: String?,
    val bodyHtml: String?,
)

data class ClaimedNotificationDeliveryItem(
    val id: UUID,
    val eventId: UUID,
    val eventType: NotificationEventType,
    val clubId: UUID,
    val recipientMembershipId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
    val recipientEmail: String?,
    val subject: String?,
    val bodyText: String?,
    val bodyHtml: String?,
)
```

- [x] **Step 4: Replace row mapper copy generation**

In `NotificationDeliveryRowMappers.kt`:

1. Import `NotificationEmailTemplates` and `NotificationRenderedCopy`.
2. Change `DeliveryCopy` to include `emailBodyHtml`.
3. Add `@param:Value("\${readmates.app-base-url:http://localhost:3000}") private val appBaseUrl: String` to the mapper if it is Spring-created. If construction is manual, pass the value from `JdbcNotificationDeliveryAdapter`.
4. In `toNotificationDeliveryItem` and `toClaimedNotificationDeliveryItem`, set `bodyHtml = copy?.emailBodyHtml`.
5. Replace the private `copyFor(...)` implementation with:

```kotlin
private fun copyFor(
    eventType: NotificationEventType,
    sessionId: UUID,
    sessionNumber: Int,
    bookTitle: String,
    clubSlug: String,
    displayName: String?,
): DeliveryCopy {
    val rendered = NotificationEmailTemplates.eventCopy(
        eventType = eventType,
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        clubSlug = clubSlug,
        displayName = displayName,
        appBaseUrl = appBaseUrl,
    )
    return DeliveryCopy(
        title = rendered.title,
        body = rendered.body,
        deepLinkPath = requireNotNull(rendered.deepLinkPath),
        emailSubject = rendered.emailSubject,
        emailBodyText = rendered.emailBodyText,
        emailBodyHtml = rendered.emailBodyHtml,
    )
}
```

If `NotificationDeliveryRowMappers` is not currently injected by Spring, modify its owning adapter constructor to accept `@Value("\${readmates.app-base-url:http://localhost:3000}") appBaseUrl: String` and instantiate `NotificationDeliveryRowMappers(objectMapper, appBaseUrl)`.

- [x] **Step 5: Update fake model construction in tests**

Every `NotificationDeliveryItem(...)` and `ClaimedNotificationDeliveryItem(...)` test constructor must pass `bodyHtml`.

Use this pattern for email fixture helpers:

```kotlin
bodyHtml = "<html><body>다음 책을 확인해 주세요.</body></html>",
```

Use this pattern for in-app-only delivery helpers:

```kotlin
bodyHtml = null,
```

- [x] **Step 6: Run targeted tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest' --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: PASS.

- [x] **Step 7: Commit (skipped)**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt \
  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt \
  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt \
  server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
git commit -m "feat: render notification email copy"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 4: Send HTML Through Dispatch And Processing

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/MailDeliveryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt`

- [x] **Step 1: Write failing dispatch assertions**

In `NotificationDispatchServiceTest`, update `dispatch persists planned deliveries sends claimed email and marks sent` to expect `html`:

```kotlin
assertThat(mailPort.sent).containsExactly(
    MailDeliveryCommand(
        to = "member@example.com",
        subject = "다음 책이 공개되었습니다",
        text = "다음 책을 확인해 주세요.",
        html = "<html><body>다음 책을 확인해 주세요.</body></html>",
    ),
)
```

Update `emailDelivery()` fixture:

```kotlin
bodyHtml = "<html><body>다음 책을 확인해 주세요.</body></html>",
```

In `NotificationDeliveryProcessingServiceTest`, make `ProcessingRecordingMailPort` capture commands and add:

```kotlin
assertThat(mailPort.sent.single().html).contains("피드백 문서")
```

Set `processingClaimedDelivery().bodyHtml` to `"<html><body>피드백 문서</body></html>"`.

- [x] **Step 2: Run service tests to verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationDispatchServiceTest' --tests 'com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest'
```

Expected: compilation fails because `MailDeliveryCommand.html` is missing.

- [x] **Step 3: Add `html` to mail command**

Modify `MailDeliveryPort.kt`:

```kotlin
data class MailDeliveryCommand(
    val to: String,
    val subject: String,
    val text: String,
    val html: String? = null,
)
```

- [x] **Step 4: Forward HTML from dispatch services**

In `NotificationDispatchService.dispatchEmail`, change command construction to:

```kotlin
val command = MailDeliveryCommand(
    to = requiredDeliveryField(claimed.id, "recipientEmail", claimed.recipientEmail),
    subject = requiredDeliveryField(claimed.id, "subject", claimed.subject),
    text = requiredDeliveryField(claimed.id, "bodyText", claimed.bodyText),
    html = claimed.bodyHtml?.takeIf { it.isNotBlank() },
)
```

In `NotificationDeliveryProcessingService.processClaimed`, change command construction the same way:

```kotlin
MailDeliveryCommand(
    to = requiredDeliveryField(item.id, "recipientEmail", item.recipientEmail),
    subject = requiredDeliveryField(item.id, "subject", item.subject),
    text = requiredDeliveryField(item.id, "bodyText", item.bodyText),
    html = item.bodyHtml?.takeIf { it.isNotBlank() },
)
```

- [x] **Step 5: Run service tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationDispatchServiceTest' --tests 'com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest'
```

Expected: PASS.

- [x] **Step 6: Commit (skipped)**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/port/out/MailDeliveryPort.kt \
  server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt \
  server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt \
  server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt \
  server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt
git commit -m "feat: pass html email bodies to mail delivery"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 5: Convert SMTP Adapter To Multipart MIME

**Files:**
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapterTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt`
- Modify if needed: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [x] **Step 1: Write the failing SMTP tests**

Create `server/src/test/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapterTest.kt`:

```kotlin
package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.port.out.MailDeliveryCommand
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessagePreparator
import org.springframework.mail.SimpleMailMessage
import java.io.InputStream
import java.util.Properties

class SmtpMailDeliveryAdapterTest {
    @Test
    fun `sends multipart alternative email when html is present`() {
        val sender = CapturingJavaMailSender()
        val adapter = SmtpMailDeliveryAdapter(sender, "no-reply@example.com", "ReadMates")

        adapter.send(
            MailDeliveryCommand(
                to = "member@example.com",
                subject = "8회차 책이 공개되었습니다",
                text = "plain body",
                html = "<html><body><strong>html body</strong></body></html>",
            ),
        )

        val message = sender.singleMessage()
        assertThat(message.subject).isEqualTo("8회차 책이 공개되었습니다")
        assertThat(message.getRecipients(Message.RecipientType.TO).single().toString()).isEqualTo("member@example.com")
        assertThat(message.from.single().toString()).contains("ReadMates", "no-reply@example.com")
        assertThat(message.allTextParts()).contains("plain body")
        assertThat(message.allTextParts()).anySatisfy { part -> assertThat(part).contains("<strong>html body</strong>") }
    }

    @Test
    fun `sends plain text email when html is absent`() {
        val sender = CapturingJavaMailSender()
        val adapter = SmtpMailDeliveryAdapter(sender, "no-reply@example.com", "ReadMates")

        adapter.send(
            MailDeliveryCommand(
                to = "member@example.com",
                subject = "ReadMates 알림 테스트",
                text = "plain only",
            ),
        )

        val message = sender.singleMessage()
        assertThat(message.content.toString()).contains("plain only")
    }
}

private class CapturingJavaMailSender : JavaMailSender {
    private val messages = mutableListOf<MimeMessage>()

    fun singleMessage(): MimeMessage = messages.single()

    override fun createMimeMessage(): MimeMessage =
        MimeMessage(Session.getInstance(Properties()))

    override fun createMimeMessage(contentStream: InputStream): MimeMessage =
        MimeMessage(Session.getInstance(Properties()), contentStream)

    override fun send(mimeMessage: MimeMessage) {
        messages += mimeMessage
    }

    override fun send(vararg mimeMessages: MimeMessage) {
        messages += mimeMessages
    }

    override fun send(mimeMessagePreparator: MimeMessagePreparator) {
        val message = createMimeMessage()
        mimeMessagePreparator.prepare(message)
        send(message)
    }

    override fun send(vararg mimeMessagePreparators: MimeMessagePreparator) {
        mimeMessagePreparators.forEach(::send)
    }

    override fun send(simpleMessage: SimpleMailMessage) {
        error("SimpleMailMessage should not be used for SMTP notification delivery")
    }

    override fun send(vararg simpleMessages: SimpleMailMessage) {
        error("SimpleMailMessage should not be used for SMTP notification delivery")
    }
}

private fun MimeMessage.allTextParts(): List<String> =
    collectTextParts(content)

private fun collectTextParts(content: Any?): List<String> =
    when (content) {
        is String -> listOf(content)
        is MimeMultipart -> (0 until content.count).flatMap { index -> collectTextParts(content.getBodyPart(index).content) }
        else -> emptyList()
    }
```

- [x] **Step 2: Run SMTP test to verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.mail.SmtpMailDeliveryAdapterTest'
```

Expected: FAIL because adapter still sends `SimpleMailMessage`.

- [x] **Step 3: Implement MIME sending**

Replace `SmtpMailDeliveryAdapter.send` with:

```kotlin
override fun send(command: MailDeliveryCommand) {
    val message = javaMailSender.createMimeMessage()
    val helper = MimeMessageHelper(message, command.html?.isNotBlank() == true, Charsets.UTF_8.name())
    helper.setFrom(InternetAddress(senderEmail, senderName, Charsets.UTF_8.name()))
    helper.setTo(command.to)
    helper.setSubject(command.subject)
    val html = command.html?.takeIf { it.isNotBlank() }
    if (html == null) {
        helper.setText(command.text, false)
    } else {
        helper.setText(command.text, html)
    }
    javaMailSender.send(message)
}
```

Update imports in `SmtpMailDeliveryAdapter.kt`:

```kotlin
import jakarta.mail.internet.InternetAddress
import org.springframework.mail.javamail.MimeMessageHelper
```

Remove the `SimpleMailMessage` import.

- [x] **Step 4: Run SMTP test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.mail.SmtpMailDeliveryAdapterTest'
```

Expected: PASS.

- [x] **Step 5: Run host notification controller test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: PASS. If the test JavaMailSender fake still imports `SimpleMailMessage`, keep those override methods because `JavaMailSender` requires them, but production code must not call them.

- [x] **Step 6: Commit (skipped)**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt \
  server/src/test/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapterTest.kt \
  server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
git commit -m "feat: send html notification emails"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 6: Upgrade Test Mail Copy

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationTestMailService.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [x] **Step 1: Add test-mail command assertions**

In `HostNotificationControllerTest.TestMailDeliveryConfig`, replace the anonymous `MailDeliveryPort` with a bean that records the last command:

```kotlin
@Bean
@Primary
fun testMailDeliveryPort(): RecordingTestMailDeliveryPort =
    RecordingTestMailDeliveryPort()
```

Add the class near the test configuration:

```kotlin
class RecordingTestMailDeliveryPort : MailDeliveryPort {
    val sent = mutableListOf<MailDeliveryCommand>()

    override fun send(command: MailDeliveryCommand) {
        if (command.to == FAILING_TEST_MAIL_RECIPIENT) {
            error(SENSITIVE_TEST_MAIL_ERROR)
        }
        sent += command
    }
}
```

Inject it into the test class constructor:

```kotlin
@param:Autowired private val testMailDeliveryPort: RecordingTestMailDeliveryPort,
```

In `host sends test mail and audit stores masked recipient only`, after the response assertions add:

```kotlin
assertThat(testMailDeliveryPort.sent.single()).satisfies { command ->
    assertThat(command.to).isEqualTo("external@example.com")
    assertThat(command.subject).isEqualTo("ReadMates 알림 테스트")
    assertThat(command.text).contains("알림 메일 발송이 준비되었습니다", "SMTP 발송 점검")
    assertThat(command.html).contains("delivery check", "알림 메일 발송이 준비되었습니다")
    assertThat(command.html).doesNotContain("<a ")
}
```

- [x] **Step 2: Run controller test to verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: FAIL because test mail still sends the old short plain text and no HTML.

- [x] **Step 3: Use shared test mail template**

In `NotificationTestMailService.kt`, remove `TEST_MAIL_SUBJECT` and `TEST_MAIL_BODY`. In `sendTestMail`, replace the command with:

```kotlin
val copy = NotificationEmailTemplates.testMailCopy()
mailDeliveryPort.send(
    MailDeliveryCommand(
        to = recipient,
        subject = copy.emailSubject,
        text = copy.emailBodyText,
        html = copy.emailBodyHtml,
    ),
)
```

Add import:

```kotlin
import com.readmates.notification.application.model.NotificationEmailTemplates
```

- [x] **Step 4: Run controller test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: PASS.

- [x] **Step 5: Commit (skipped)**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/service/NotificationTestMailService.kt \
  server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
git commit -m "feat: format notification test mail"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 7: Add Frontend Safe Return Helpers

**Files:**
- Create: `front/shared/auth/login-return.ts`
- Create: `front/tests/unit/login-return.test.ts`

- [x] **Step 1: Write pure helper tests**

Create `front/tests/unit/login-return.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginPathForReturnTo, oauthHrefForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";

describe("login return helpers", () => {
  it("keeps safe relative app paths with query and hash", () => {
    expect(safeRelativeReturnTo("/clubs/reading-sai/app/sessions/session-1?tab=notes#top")).toBe(
      "/clubs/reading-sai/app/sessions/session-1?tab=notes#top",
    );
  });

  it("rejects absolute protocol-relative backslash and control-character targets", () => {
    expect(safeRelativeReturnTo("https://evil.example/app")).toBeNull();
    expect(safeRelativeReturnTo("//evil.example/app")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/app\\evil")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/app\nnext")).toBeNull();
  });

  it("does not preserve login reset invite oauth or root paths", () => {
    expect(safeRelativeReturnTo("/login")).toBeNull();
    expect(safeRelativeReturnTo("/oauth2/authorization/google")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/invite/token")).toBeNull();
    expect(safeRelativeReturnTo("/reset-password/token")).toBeNull();
    expect(safeRelativeReturnTo("/")).toBeNull();
  });

  it("builds login and oauth urls with encoded returnTo only when safe", () => {
    expect(loginPathForReturnTo("/clubs/reading-sai/app/feedback/session-1?from=email")).toBe(
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
    expect(oauthHrefForReturnTo("/clubs/reading-sai/app/feedback/session-1?from=email")).toBe(
      "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
    expect(loginPathForReturnTo("https://evil.example/app")).toBe("/login");
    expect(oauthHrefForReturnTo("//evil.example/app")).toBe("/oauth2/authorization/google");
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --dir front test -- login-return.test.ts
```

Expected: FAIL because `front/shared/auth/login-return.ts` does not exist.

- [x] **Step 3: Implement helper**

Create `front/shared/auth/login-return.ts`:

```ts
const excludedReturnPathPatterns = [
  /^\/login(?:[/?#]|$)/,
  /^\/oauth2(?:[/?#]|$)/,
  /^\/login\/oauth2(?:[/?#]|$)/,
  /^\/reset-password(?:[/?#]|$)/,
  /^\/invite(?:[/?#]|$)/,
  /^\/clubs\/[^/]+\/invite(?:[/?#]|$)/,
];

export function currentRelativeReturnTo(locationLike: Pick<Location, "pathname" | "search" | "hash"> = window.location) {
  return safeRelativeReturnTo(`${locationLike.pathname}${locationLike.search}${locationLike.hash}`);
}

export function safeRelativeReturnTo(rawValue: string | null | undefined) {
  const value = rawValue?.trim();
  if (!value || value.length > 2048) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || hasControlCharacter(value)) {
    return null;
  }
  if (value === "/" || excludedReturnPathPatterns.some((pattern) => pattern.test(value))) {
    return null;
  }
  return value;
}

export function loginPathForReturnTo(rawValue: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(rawValue);
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
}

export function oauthHrefForReturnTo(rawValue: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(rawValue);
  return returnTo ? `/oauth2/authorization/google?returnTo=${encodeURIComponent(returnTo)}` : "/oauth2/authorization/google";
}

function hasControlCharacter(value: string) {
  return /[\u0000-\u001f\u007f]/.test(value);
}
```

- [x] **Step 4: Run helper test**

Run:

```bash
pnpm --dir front test -- login-return.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit (skipped)**

```bash
git add front/shared/auth/login-return.ts front/tests/unit/login-return.test.ts
git commit -m "feat: add safe login return helpers"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 8: Preserve Return Targets In Frontend Auth Flow

**Files:**
- Modify: `front/shared/auth/member-app-loader.ts`
- Modify: `front/shared/api/client.ts`
- Modify: `front/src/app/route-guards.tsx`
- Modify: `front/features/auth/route/login-route.tsx`
- Modify: `front/features/auth/ui/login-card.tsx`
- Modify tests:
  - `front/tests/unit/login-card.test.tsx`
  - `front/tests/unit/auth-context.test.tsx`
  - `front/tests/unit/member-app-access.test.ts`
  - `front/tests/unit/readmates-fetch.test.ts`
  - `front/tests/unit/spa-router.test.tsx`

- [x] **Step 1: Write failing tests for login route href**

In `front/tests/unit/login-card.test.tsx`, add:

```ts
it("adds a safe returnTo value to the Google login action", () => {
  window.history.pushState({}, "", "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail");

  render(<LoginRoute />);

  expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
  );
});

it("ignores unsafe returnTo values on the login route", () => {
  window.history.pushState({}, "", "/login?returnTo=https%3A%2F%2Fevil.example%2Fapp");

  render(<LoginRoute />);

  expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/oauth2/authorization/google");
});
```

Update existing href expectations in this file to use the same default href.

- [x] **Step 2: Write failing tests for guarded route redirects**

In `front/tests/unit/auth-context.test.tsx`, update `renderGuard` so it can accept an initial entry:

```ts
function renderGuard(element: React.ReactElement, initialEntry = "/guard") {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/guard" element={element} />
          <Route path="/clubs/:clubSlug/app/feedback/:sessionId" element={element} />
          <Route path="/login" element={<main>login page</main>} />
          <Route path="/app" element={<main>member app</main>} />
          <Route path="/app/pending" element={<main>pending page</main>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}
```

Add:

```ts
it("redirects anonymous member app routes to login with returnTo", async () => {
  mockAuthFetch(anonymousAuth);

  renderGuard(
    <RequireMemberApp>
      <main>member app boundary</main>
    </RequireMemberApp>,
    "/clubs/reading-sai/app/feedback/session-1?from=email",
  );

  expect(await screen.findByText("login page")).toBeInTheDocument();
  expect(window.location.pathname).toBe("/");
});
```

For MemoryRouter, asserting URL after `Navigate` is awkward; prefer a visible probe route if this exact assertion is unstable:

```tsx
<Route path="/login" element={<LoginLocationProbe />} />
```

with:

```tsx
function LoginLocationProbe() {
  const location = useLocation();
  return <main>login page {location.search}</main>;
}
```

Then assert:

```ts
expect(await screen.findByText(/returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail/)).toBeInTheDocument();
```

- [x] **Step 3: Write failing loader and fetch tests**

In `front/tests/unit/member-app-access.test.ts`, add:

```ts
it("redirects anonymous loader auth to login with returnTo from request", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(anonymousAuth));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    loadMemberAppAuth({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://app.readmates.example/clubs/reading-sai/app/feedback/session-1?from=email"),
    }),
  ).rejects.toMatchObject({
    status: 302,
    headers: expect.any(Headers),
  });
});
```

After catching the thrown response, assert:

```ts
try {
  await loadMemberAppAuth({
    params: { clubSlug: "reading-sai" },
    request: new Request("https://app.readmates.example/clubs/reading-sai/app/feedback/session-1?from=email"),
  });
  throw new Error("Expected redirect");
} catch (error) {
  expect(error).toBeInstanceOf(Response);
  expect((error as Response).headers.get("Location")).toBe(
    "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
  );
}
```

In `front/tests/unit/readmates-fetch.test.ts`, update the 401 test to set a scoped app location and expect returnTo:

```ts
window.history.pushState({}, "", "/clubs/reading-sai/app/feedback/session-1?from=email");
...
expect(assignMock).toHaveBeenCalledWith(
  "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
);
```

- [x] **Step 4: Run frontend tests to verify failure**

Run:

```bash
pnpm --dir front test -- login-card.test.tsx auth-context.test.tsx member-app-access.test.ts readmates-fetch.test.ts spa-router.test.tsx
```

Expected: FAIL because code still drops returnTo.

- [x] **Step 5: Implement route guard redirects**

In `front/src/app/route-guards.tsx`, import `useLocation` and helper:

```ts
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
```

Add:

```ts
function useLoginPathForCurrentRoute() {
  const location = useLocation();
  return loginPathForReturnTo(`${location.pathname}${location.search}${location.hash}`);
}
```

In `RequireAuth`, `RequirePlatformAdmin`, `RequireMemberApp`, and `RequireHost`, compute:

```ts
const loginPath = useLoginPathForCurrentRoute();
```

and replace:

```tsx
<Navigate to="/login" replace />
```

with:

```tsx
<Navigate to={loginPath} replace />
```

- [x] **Step 6: Implement loader redirects**

In `front/shared/auth/member-app-loader.ts`, extend the args type:

```ts
type ClubScopedLoaderArgs = {
  clubSlug?: string;
  params?: {
    clubSlug?: string;
  };
  request?: Request;
};
```

Import helper:

```ts
import { loginPathForReturnTo } from "@/shared/auth/login-return";
```

Add:

```ts
function returnToFromRequest(request?: Request) {
  if (!request) {
    return null;
  }
  const url = new URL(request.url);
  return `${url.pathname}${url.search}${url.hash}`;
}
```

Replace anonymous redirect:

```ts
throw redirect(loginPathForReturnTo(returnToFromRequest(args?.request)));
```

Update `front/shared/auth/platform-admin-loader.ts` and `front/features/host/route/host-loader-auth.ts` if they independently redirect anonymous users to `/login`; use the same `loginPathForReturnTo(returnToFromRequest(args.request))` pattern there.

- [x] **Step 7: Implement API 401 redirect**

In `front/shared/api/client.ts`, import:

```ts
import { currentRelativeReturnTo, loginPathForReturnTo } from "@/shared/auth/login-return";
```

Replace:

```ts
window.location.assign("/login");
```

with:

```ts
window.location.assign(loginPathForReturnTo(currentRelativeReturnTo()));
```

- [x] **Step 8: Implement login OAuth href**

In `front/features/auth/ui/login-card.tsx`, add prop:

```ts
googleLoginHref = "/oauth2/authorization/google",
```

and use:

```tsx
<a className="btn btn-primary btn-lg" href={googleLoginHref}>
  시작하기
</a>
```

In `front/features/auth/route/login-route.tsx`, import:

```ts
import { oauthHrefForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";
```

Add:

```ts
function loginReturnTo(search: string) {
  return safeRelativeReturnTo(new URLSearchParams(search).get("returnTo"));
}
```

In `LoginRouteContent`:

```ts
const returnTo = loginReturnTo(globalThis.location.search);
```

Pass:

```tsx
googleLoginHref={oauthHrefForReturnTo(returnTo)}
```

For dev login redirect, replace:

```ts
globalThis.location.assign("/app");
```

with:

```ts
globalThis.location.assign(returnTo ?? "/app");
```

- [x] **Step 9: Run frontend targeted tests**

Run:

```bash
pnpm --dir front test -- login-return.test.ts login-card.test.tsx auth-context.test.tsx member-app-access.test.ts readmates-fetch.test.ts spa-router.test.tsx
```

Expected: PASS.

- [x] **Step 10: Commit (skipped)**

```bash
git add front/shared/auth/login-return.ts \
  front/shared/auth/member-app-loader.ts \
  front/shared/api/client.ts \
  front/src/app/route-guards.tsx \
  front/features/auth/route/login-route.tsx \
  front/features/auth/ui/login-card.tsx \
  front/tests/unit/login-return.test.ts \
  front/tests/unit/login-card.test.tsx \
  front/tests/unit/auth-context.test.tsx \
  front/tests/unit/member-app-access.test.ts \
  front/tests/unit/readmates-fetch.test.ts \
  front/tests/unit/spa-router.test.tsx
git commit -m "feat: preserve login return targets"
```

Skipped (2026-04-30): no task-level commit was created in this session; changes remain uncommitted for user review.

---

### Task 9: Run Notification Slice And Frontend Verification

**Files:**
- No planned code changes unless a verification failure identifies a root cause.

- [x] **Step 1: Run notification tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.*'
```

Expected: PASS.

Result (2026-04-30): PASS, exit 0.

- [x] **Step 2: Run frontend tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

Result (2026-04-30): PASS, exit 0.

- [x] **Step 3: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS.

Result (2026-04-30): PASS, exit 0.

- [x] **Step 4: Run frontend e2e if the local environment is ready**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. If the command cannot run because local browsers, dev server, or backend prerequisites are unavailable, record the skipped command and exact reason in the final response.

Result (2026-04-30): initial `pnpm --dir front test:e2e` failed before browser tests because the local MySQL `readmates_e2e` schema has Flyway checksum mismatches for migrations 16/18/20/21. A fresh local schema attempt with `READMATES_E2E_DB_NAME=readmates_e2e_email_template_redesign` also failed because the configured `readmates` DB user cannot create that database. Follow-up risk resolution used an existing `readmates`-granted codex E2E schema without dropping or repairing the stale default schema:

```bash
READMATES_E2E_DB_NAME=readmates_e2e_codex_shortname5 pnpm --dir front test:e2e
```

Result: PASS, 22 tests passed.

- [x] **Step 5: Run full server tests if targeted tests exposed broad auth or model risk**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS. If this is skipped because the change stayed within notification plus frontend auth continuity and targeted tests already passed, state that explicitly.

Result (2026-04-30): first `./server/gradlew -p server clean test` run failed with a transient `JdbcNotificationDeliveryAdapterTest` NPE while claiming a pending email delivery. Root-cause review found no link to the email-template changes; the exact test and full adapter class passed on focused reruns. A final no-concurrent `./server/gradlew -p server clean test` rerun passed with exit 0.

- [x] **Step 6: Inspect public safety diff**

Run:

```bash
git diff --check
git diff --cached --check
git grep -n -E '<public-safety-secret-patterns>' -- server front docs ':!docs/superpowers/plans/2026-04-30-readmates-email-template-redesign-implementation-plan.md' || true
```

Expected: no newly introduced real secrets, private hosts, real member data, or token-shaped examples. Known public-safe fixture domains such as `example.com`, `example.test`, and `app.readmates.example` are acceptable.

Result (2026-04-30): `git diff --check` and `git diff --cached --check` passed with exit 0. The planned grep produced only existing placeholder/test-token matches; narrowed scans of changed additions and untracked files, excluding this plan and `.server-config`, produced no matches.

- [x] **Step 7: Final commit if verification fixes were needed**

If verification required fixes, commit those fixes:

```bash
git add <changed-files>
git commit -m "test: verify email notification redesign"
```

If no fixes were needed after previous task commits, do not create an empty commit.

Skipped (2026-04-30): no verification fixes were made, and no commit was created.

---

## Self-Review

Spec coverage:

- Five templates are covered by Task 1 and Task 2.
- HTML with plain text fallback is covered by Task 4 and Task 5.
- CTA absolute URL and feedback route change are covered by Task 1 through Task 3.
- Test mail redesign is covered by Task 6.
- Frontend login continuity is covered by Task 7 and Task 8.
- Public-repo safety and host detail body non-exposure are covered by Task 3 and Task 9.

Placeholder scan:

- This plan intentionally contains no `TBD`, `TODO`, or “similar to” steps.
- Each code-changing task includes concrete file paths, code snippets, commands, and expected outcomes.

Type consistency:

- `NotificationRenderedCopy.emailBodyHtml` maps to `DeliveryCopy.emailBodyHtml`, `NotificationDeliveryItem.bodyHtml`, `ClaimedNotificationDeliveryItem.bodyHtml`, and `MailDeliveryCommand.html`.
- Frontend return helpers consistently use `safeRelativeReturnTo`, `loginPathForReturnTo`, `oauthHrefForReturnTo`, and `currentRelativeReturnTo`.

## COMPACT CHECKPOINT - Risk Resolution

Task/Phase: Final risk resolution for E2E validation and unclosed setup guidance.

Acceptance criteria completed:

- Default `readmates_e2e` Flyway checksum mismatch was not repaired or dropped.
- E2E was rerun against an existing schema already granted to the local E2E user.
- E2E passed with 22 Chromium tests.
- Test guide now documents the safe admin pre-create/grant path for E2E users without `CREATE DATABASE` privilege and recommends a fresh schema instead of `repair`/drop for checksum mismatch.

Changed files:

- `docs/development/test-guide.md`
- `docs/superpowers/plans/2026-04-30-readmates-email-template-redesign-implementation-plan.md`

Key decisions and reasons:

- Used a non-destructive schema override because the stale default schema is local state unrelated to the email-template change.
- Did not run Flyway repair or drop any schema because those would mutate/delete existing local DB state.

Confirmed contract/API/state/test expectation:

- Official E2E command can still use defaults when the local default schema is valid.
- When the default schema is stale, a caller can provide `READMATES_E2E_DB_NAME` pointing at a current, granted E2E schema.

Reviews:

- Fresh `gpt-5.5` high explorer reviewed the E2E DB setup and found no email-template code change was warranted; it recommended docs setup guidance.

Verification:

- `READMATES_E2E_DB_NAME=readmates_e2e_codex_shortname5 pnpm --dir front test:e2e` passed: 22 tests.
- `git diff --check` passed after doc update.
- Targeted changed-doc safety scan passed with no matches.

Remaining risks:

- None known for validation. The default local `readmates_e2e` schema remains stale by design and was not modified.

Next first action:

- Optionally commit the finished branch if a permanent checkpoint is desired.

Worktree/branch:

- `<local-worktree>/ReadMates/codex-email-template-redesign`
- `codex/email-template-redesign`

Session-owned process/port state:

- Playwright web servers exited after the E2E run.
- No session-owned dev server, bootRun, browser, or port remains open.
