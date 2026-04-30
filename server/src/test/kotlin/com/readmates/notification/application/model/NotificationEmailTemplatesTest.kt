package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
            "모임 전 회차 정보와 준비 내용을 확인해 주세요.",
            "회차: 8회차",
            "책: Distributed Systems",
            "확인할 일: 일정과 준비 메모",
            "확인 링크: https://app.readmates.example/clubs/reading-sai/app/sessions/$sessionId",
            "ReadMates 알림 설정에 따라 발송된 메일입니다.",
        )
        assertThat(copy.emailBodyHtml).contains(
            "<strong>ReadMates</strong>",
            "next book",
            "8회차 책이 공개되었습니다",
            "민서님,",
            "다음 모임에서 함께 읽을 책이 정해졌습니다.",
            "모임 전 회차 정보와 준비 내용을 확인해 주세요.",
            "회차",
            "8회차",
            "책",
            "Distributed Systems",
            "확인",
            "일정과 준비 메모",
            "ReadMates에서 회차 확인하기",
            "https://app.readmates.example/clubs/reading-sai/app/sessions/$sessionId",
            "조용히 읽고, 필요한 준비만 놓치지 않도록 알려드립니다.",
            "알림 설정",
        )
    }

    @Test
    fun `renders all event subjects actions and links`() {
        val cases = listOf(
            NotificationEventType.SESSION_REMINDER_DUE to ExpectedEmail(
                subject = "내일 8회차 모임이 있습니다",
                label = "session reminder",
                summary = "모임 전 질문, 읽은 분량, 참석 상태를 확인하라는 운영 알림.",
                contextLabel = "준비",
                context = "질문, 읽은 분량, 참석 상태",
                cta = "모임 준비 확인하기",
                path = "/clubs/reading-sai/app/sessions/$sessionId",
            ),
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to ExpectedEmail(
                subject = "8회차 피드백 문서가 올라왔습니다",
                label = "feedback document",
                summary = "참석했던 회차의 정리와 다음 읽기를 위한 메모를 확인하라는 안내.",
                contextLabel = "확인",
                context = "피드백 문서와 모임 정리",
                cta = "피드백 문서 확인하기",
                path = "/clubs/reading-sai/app/feedback/$sessionId",
            ),
            NotificationEventType.REVIEW_PUBLISHED to ExpectedEmail(
                subject = "8회차에 새 서평이 공개되었습니다",
                label = "new review",
                summary = "같은 회차의 새 공개 서평이 올라왔고, ReadMates에서 서평 흐름을 확인하라는 안내.",
                contextLabel = "확인",
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

            val absoluteCtaUrl = "https://app.readmates.example${expected.path}"

            assertThat(copy.title).isEqualTo(expected.subject)
            assertThat(copy.emailSubject).isEqualTo(expected.subject)
            assertThat(copy.emailBodyText).contains(
                "ReadMates",
                "멤버님,",
                expected.summary,
                "회차: 8회차",
                "책: Distributed Systems",
                "${expected.textContextLabel}: ${expected.context}",
                "확인 링크: $absoluteCtaUrl",
                "ReadMates 알림 설정에 따라 발송된 메일입니다.",
            )
            assertThat(copy.emailBodyHtml).contains(
                expected.label,
                expected.subject,
                expected.summary,
                "Distributed Systems",
                expected.contextLabel,
                expected.context,
                expected.cta,
                absoluteCtaUrl,
                "조용히 읽고, 필요한 준비만 놓치지 않도록 알려드립니다.",
                "알림 설정",
            )
            assertThat(copy.deepLinkPath).isEqualTo(expected.path)
        }
    }

    @Test
    fun `normalizes app base url to http origin before rendering cta`() {
        val copy = NotificationEmailTemplates.eventCopy(
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            sessionId = sessionId,
            sessionNumber = 8,
            bookTitle = "Distributed Systems",
            clubSlug = "reading-sai",
            displayName = null,
            appBaseUrl = " ",
        )

        assertThat(copy.emailBodyText)
            .contains("확인 링크: http://localhost:3000/clubs/reading-sai/app/sessions/$sessionId")
        assertThat(copy.emailBodyHtml)
            .contains("http://localhost:3000/clubs/reading-sai/app/sessions/$sessionId")
    }

    @Test
    fun `rejects app base url values that are not http origins`() {
        listOf(
            "https://app.readmates.example/app",
            "https://app.readmates.example?next=/app",
            "https://app.readmates.example#fragment",
            "javascript:alert(1)",
        ).forEach { appBaseUrl ->
            assertThatThrownBy {
                NotificationEmailTemplates.eventCopy(
                    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                    sessionId = sessionId,
                    sessionNumber = 8,
                    bookTitle = "Distributed Systems",
                    clubSlug = "reading-sai",
                    displayName = null,
                    appBaseUrl = appBaseUrl,
                )
            }.isInstanceOf(IllegalArgumentException::class.java)
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
        assertThat(copy.emailBodyText).contains(
            "알림 메일 발송이 준비되었습니다",
            "SMTP 발송 점검",
            "범위: 테스트 메일",
            "실제 알림은 회차, 책, 확인할 일을 함께 담아 발송됩니다.",
        )
        assertThat(copy.emailBodyHtml).contains(
            "delivery check",
            "알림 메일 발송이 준비되었습니다",
            "SMTP 발송 점검",
            "테스트 메일",
            "실제 알림은 회차, 책, 확인할 일을 함께 담아 발송됩니다.",
        )
        assertThat(copy.emailBodyHtml).doesNotContain("<a ")
        assertThat(copy.deepLinkPath).isNull()
    }

    private data class ExpectedEmail(
        val subject: String,
        val label: String,
        val summary: String,
        val contextLabel: String,
        val context: String,
        val cta: String,
        val path: String,
    ) {
        val textContextLabel: String = if (contextLabel == "확인") "확인할 일" else contextLabel
    }
}
