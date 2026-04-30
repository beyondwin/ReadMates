package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import java.net.URI
import java.util.Locale
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
        clubName: String,
        clubSlug: String,
        displayName: String?,
        appBaseUrl: String,
    ): NotificationRenderedCopy {
        val memberName = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: "멤버"
        val brandName = clubName.requiredClubName()
        val detail = detailFor(
            eventType = eventType,
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            clubSlug = clubSlug,
        )
        val ctaUrl = absoluteUrl(appBaseUrl, detail.deepLinkPath)
        val contextRows = listOf(
            "회차" to "${sessionNumber}회차",
            "책" to bookTitle,
            detail.contextLabel to detail.context,
        )

        return NotificationRenderedCopy(
            title = detail.title,
            body = detail.inAppBody,
            deepLinkPath = detail.deepLinkPath,
            emailSubject = detail.subject,
            emailBodyText = textEmail(
                memberName = memberName,
                summary = detail.summary,
                contextRows = contextRows,
                ctaUrl = ctaUrl,
                brandName = brandName,
                footer = "$brandName 알림 설정에 따라 발송된 메일입니다.",
            ),
            emailBodyHtml = htmlEmail(
                label = detail.label,
                brandName = brandName,
                title = detail.title,
                memberName = memberName,
                summary = detail.summary,
                contextRows = contextRows,
                ctaLabel = detail.ctaLabel,
                ctaUrl = ctaUrl,
                closing = "다음 모임과 읽기 흐름에 맞춰 소식을 전합니다.",
                footer = "이 메일은 $brandName 알림 설정에 따라 발송되었습니다. 알림 설정은 내 프로필에서 변경할 수 있습니다.",
            ),
        )
    }

    fun testMailCopy(clubName: String): NotificationRenderedCopy {
        val brandName = clubName.requiredClubName()
        return NotificationRenderedCopy(
            title = "알림 메일 발송이 준비되었습니다",
            body = "$brandName 알림 발송 설정을 확인하기 위한 테스트 메일입니다.",
            deepLinkPath = null,
            emailSubject = "$brandName 알림 테스트",
            emailBodyText = """
                $brandName

                알림 메일 발송이 준비되었습니다.

                용도: SMTP 발송 점검
                범위: 테스트 메일

                실제 알림은 회차, 책, 확인할 일을 함께 담아 발송됩니다.
            """.trimIndent(),
            emailBodyHtml = htmlEmail(
                label = "delivery check",
                brandName = brandName,
                title = "알림 메일 발송이 준비되었습니다",
                memberName = null,
                summary = "$brandName 알림 발송 설정이 정상적으로 동작하는지 확인하기 위한 테스트 메일입니다.",
                contextRows = listOf(
                    "용도" to "SMTP 발송 점검",
                    "범위" to "테스트 메일",
                ),
                ctaLabel = null,
                ctaUrl = null,
                closing = "실제 알림은 회차, 책, 확인할 일을 함께 담아 발송됩니다.",
                footer = "SMTP 발송 점검을 위한 테스트 메일입니다.",
            ),
        )
    }

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
                summary = "다음 모임에서 함께 읽을 책이 정해졌습니다. 모임 전 회차 정보와 준비 내용을 확인해 주세요.",
                contextLabel = "확인",
                context = "일정과 준비 메모",
                ctaLabel = "회차 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/sessions/$sessionId"),
                inAppBody = "${sessionNumber}회차 $bookTitle 책이 공개되었습니다.",
            )

            NotificationEventType.SESSION_REMINDER_DUE -> EventEmailDetail(
                label = "session reminder",
                subject = "내일 ${sessionNumber}회차 모임이 있습니다",
                title = "내일 ${sessionNumber}회차 모임이 있습니다",
                summary = "모임 전에 질문과 읽은 분량, 참석 여부를 한 번 더 정리해 주세요.",
                contextLabel = "준비",
                context = "질문, 읽은 분량, 참석 상태",
                ctaLabel = "모임 준비 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/sessions/$sessionId"),
                inAppBody = "내일 ${sessionNumber}회차 $bookTitle 모임이 있습니다.",
            )

            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> EventEmailDetail(
                label = "feedback document",
                subject = "${sessionNumber}회차 피드백 문서가 올라왔습니다",
                title = "${sessionNumber}회차 피드백 문서가 올라왔습니다",
                summary = "참석한 회차의 정리와 다음 읽기에 참고할 내용을 확인해 주세요.",
                contextLabel = "확인",
                context = "피드백 문서와 모임 정리",
                ctaLabel = "피드백 문서 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/feedback/$sessionId"),
                inAppBody = "${sessionNumber}회차 $bookTitle 피드백 문서가 올라왔습니다.",
            )

            NotificationEventType.REVIEW_PUBLISHED -> EventEmailDetail(
                label = "new review",
                subject = "${sessionNumber}회차에 새 서평이 공개되었습니다",
                title = "${sessionNumber}회차에 새 서평이 공개되었습니다",
                summary = "같은 회차에 새 서평이 공개되었습니다. 함께 읽은 기록을 이어서 확인해 주세요.",
                contextLabel = "확인",
                context = "새로 공개된 서평",
                ctaLabel = "서평 확인하기",
                deepLinkPath = clubScopedAppPath(clubSlug, "/notes?sessionId=$sessionId"),
                inAppBody = "${sessionNumber}회차 $bookTitle 에 새 서평이 공개되었습니다.",
            )
        }

    private fun textEmail(
        memberName: String,
        summary: String,
        contextRows: List<Pair<String, String>>,
        ctaUrl: String,
        brandName: String,
        footer: String,
    ): String =
        buildString {
            appendLine(brandName)
            appendLine()
            appendLine("${memberName}님,")
            appendLine()
            appendLine(summary)
            appendLine()
            contextRows.forEach { (label, value) ->
                appendLine("${labelForText(label)}: $value")
            }
            appendLine()
            appendLine("확인 링크: $ctaUrl")
            appendLine()
            append(footer)
        }

    private fun htmlEmail(
        label: String,
        brandName: String,
        title: String,
        memberName: String?,
        summary: String,
        contextRows: List<Pair<String, String>>,
        ctaLabel: String?,
        ctaUrl: String?,
        closing: String,
        footer: String,
    ): String {
        val greeting = memberName?.let {
            """<p style="margin:0 0 14px;color:#2f3a4e;font-size:15px;line-height:1.75;">${escapeHtml(it)}님,</p>"""
        } ?: ""
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
                                  <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;letter-spacing:0;color:#17233a;"><strong>${escapeHtml(brandName)}</strong></span>
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
                                  <p style="margin:0;color:#2f3a4e;font-size:15px;line-height:1.78;">${escapeHtml(summary)}</p>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:26px 0 0;">
                                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d9cdbd;background:#fbf3e6;padding:8px 17px;">$rows</table>
                                </td>
                              </tr>
                              $cta
                              <tr>
                                <td style="padding:22px 0 0;color:#687084;font-size:13px;line-height:1.65;">${escapeHtml(closing)}</td>
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

    private fun absoluteUrl(appBaseUrl: String, path: String): String =
        "${appOrigin(appBaseUrl)}${path.ensureLeadingSlash()}"

    private fun appOrigin(appBaseUrl: String): String {
        val rawValue = appBaseUrl.trim().ifEmpty { "http://localhost:3000" }
        val uri = try {
            URI.create(rawValue)
        } catch (exception: IllegalArgumentException) {
            throw IllegalArgumentException("readmates.app-base-url must be an http/https origin", exception)
        }
        val scheme = uri.scheme?.lowercase(Locale.ROOT)

        require(scheme == "http" || scheme == "https") {
            "readmates.app-base-url must use http or https"
        }
        require(!uri.host.isNullOrBlank()) {
            "readmates.app-base-url must include a host"
        }
        require(uri.rawUserInfo == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")) {
            "readmates.app-base-url must be an origin without user info or path"
        }
        require(uri.rawQuery == null && uri.rawFragment == null) {
            "readmates.app-base-url must not include query or fragment"
        }

        return URI(scheme, null, uri.host, uri.port, null, null, null).toString()
    }

    private fun String.ensureLeadingSlash(): String =
        if (startsWith("/")) this else "/$this"

    private fun labelForText(label: String): String =
        if (label == "확인") "확인할 일" else label

    private fun String.requiredClubName(): String =
        trim().takeIf { it.isNotEmpty() } ?: throw IllegalArgumentException("clubName is required")

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
        val summary: String,
        val contextLabel: String,
        val context: String,
        val ctaLabel: String,
        val deepLinkPath: String,
        val inAppBody: String,
    )
}
