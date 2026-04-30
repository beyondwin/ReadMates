package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption.CREATE
import java.nio.file.StandardOpenOption.TRUNCATE_EXISTING
import java.util.UUID

object NotificationEmailTemplatePreview {
    private val sampleSessionId = UUID.fromString("00000000-0000-0000-0000-000000000831")

    fun writeReport(outputPath: Path = defaultReportPath()): Path {
        val absolutePath = outputPath.toAbsolutePath().normalize()
        Files.createDirectories(absolutePath.parent)
        Files.writeString(
            absolutePath,
            renderReport(samples()),
            StandardCharsets.UTF_8,
            CREATE,
            TRUNCATE_EXISTING,
        )
        return absolutePath
    }

    private fun defaultReportPath(): Path =
        Path.of("build/reports/readmates/notification-email-preview/index.html")

    private fun samples(): List<EmailPreviewSample> {
        val appBaseUrl = "https://app.readmates.example"
        val clubName = "읽는사이"
        val clubSlug = "reading-sai"
        val displayName = "민서"
        val bookTitle = "도시는 무엇으로 읽히는가"

        return listOf(
            EmailPreviewSample(
                name = "테스트 메일",
                eventLabel = "delivery check",
                copy = NotificationEmailTemplates.testMailCopy(clubName = clubName),
            ),
            EmailPreviewSample(
                name = "다음 책 공개",
                eventLabel = "next book",
                copy = eventCopy(
                    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                    bookTitle = bookTitle,
                    clubName = clubName,
                    clubSlug = clubSlug,
                    displayName = displayName,
                    appBaseUrl = appBaseUrl,
                ),
            ),
            EmailPreviewSample(
                name = "모임 리마인더",
                eventLabel = "session reminder",
                copy = eventCopy(
                    eventType = NotificationEventType.SESSION_REMINDER_DUE,
                    bookTitle = bookTitle,
                    clubName = clubName,
                    clubSlug = clubSlug,
                    displayName = displayName,
                    appBaseUrl = appBaseUrl,
                ),
            ),
            EmailPreviewSample(
                name = "피드백 문서 공개",
                eventLabel = "feedback document",
                copy = eventCopy(
                    eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                    bookTitle = bookTitle,
                    clubName = clubName,
                    clubSlug = clubSlug,
                    displayName = displayName,
                    appBaseUrl = appBaseUrl,
                ),
            ),
            EmailPreviewSample(
                name = "새 서평 공개",
                eventLabel = "new review",
                copy = eventCopy(
                    eventType = NotificationEventType.REVIEW_PUBLISHED,
                    bookTitle = bookTitle,
                    clubName = clubName,
                    clubSlug = clubSlug,
                    displayName = displayName,
                    appBaseUrl = appBaseUrl,
                ),
            ),
        )
    }

    private fun eventCopy(
        eventType: NotificationEventType,
        bookTitle: String,
        clubName: String,
        clubSlug: String,
        displayName: String,
        appBaseUrl: String,
    ): NotificationRenderedCopy =
        NotificationEmailTemplates.eventCopy(
            eventType = eventType,
            sessionId = sampleSessionId,
            sessionNumber = 8,
            bookTitle = bookTitle,
            clubName = clubName,
            clubSlug = clubSlug,
            displayName = displayName,
            appBaseUrl = appBaseUrl,
        )

    private fun renderReport(samples: List<EmailPreviewSample>): String =
        """
        <!doctype html>
        <html lang="ko">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>ReadMates notification email preview</title>
            <style>
              :root {
                color-scheme: light;
                --ink: #17233a;
                --muted: #687084;
                --paper: #fffaf1;
                --page: #f4efe6;
                --line: #d9cdbd;
                --line-soft: #e9ded0;
                --accent: #27466f;
              }
              * { box-sizing: border-box; }
              body {
                margin: 0;
                background: var(--page);
                color: var(--ink);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                line-height: 1.5;
              }
              main {
                width: min(1180px, calc(100% - 32px));
                margin: 0 auto;
                padding: 32px 0 44px;
              }
              header {
                border-bottom: 1px solid var(--line);
                padding-bottom: 22px;
                margin-bottom: 24px;
              }
              .brand {
                font-family: Georgia, "Times New Roman", serif;
                font-size: 30px;
                font-weight: 600;
                letter-spacing: 0;
              }
              h1 {
                margin: 8px 0 0;
                font-size: 18px;
                font-weight: 700;
              }
              .summary {
                margin: 8px 0 0;
                color: var(--muted);
                max-width: 760px;
              }
              .sample {
                background: var(--paper);
                border: 1px solid var(--line);
                margin-top: 18px;
              }
              .sample-header {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 16px;
                padding: 20px 22px;
                border-bottom: 1px solid var(--line-soft);
                align-items: start;
              }
              .sample-name {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
              }
              .event-label {
                color: var(--muted);
                font-size: 12px;
                letter-spacing: .08em;
                text-transform: uppercase;
                white-space: nowrap;
              }
              .subject {
                margin: 8px 0 0;
                font-size: 15px;
              }
              .subject span {
                color: var(--muted);
                margin-right: 8px;
              }
              .preview-grid {
                display: grid;
                grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
                min-height: 620px;
              }
              .plain-panel {
                border-right: 1px solid var(--line-soft);
                padding: 18px 20px 20px;
              }
              .panel-title {
                margin: 0 0 12px;
                color: var(--muted);
                font-size: 12px;
                font-weight: 700;
                letter-spacing: .08em;
                text-transform: uppercase;
              }
              pre {
                margin: 0;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                color: #2f3a4e;
                font: 14px/1.65 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
              }
              .html-panel {
                padding: 18px 20px 20px;
              }
              iframe {
                display: block;
                width: 100%;
                height: 560px;
                border: 1px solid var(--line);
                background: white;
              }
              @media (max-width: 860px) {
                main { width: min(100% - 24px, 680px); padding-top: 24px; }
                .sample-header { grid-template-columns: 1fr; }
                .event-label { white-space: normal; }
                .preview-grid { grid-template-columns: 1fr; min-height: 0; }
                .plain-panel { border-right: 0; border-bottom: 1px solid var(--line-soft); }
                iframe { height: 620px; }
              }
            </style>
          </head>
          <body>
            <main>
              <header>
                <div class="brand">ReadMates</div>
                <h1>Notification email preview</h1>
                <p class="summary">샘플 데이터로 렌더링한 알림 메일 제목, plain text fallback, HTML 본문 미리보기입니다.</p>
              </header>
              ${samples.joinToString(separator = "\n", transform = ::renderSample)}
            </main>
          </body>
        </html>
        """.trimIndent()

    private fun renderSample(sample: EmailPreviewSample): String =
        """
        <section class="sample">
          <div class="sample-header">
            <div>
              <h2 class="sample-name">${escapeHtml(sample.name)}</h2>
              <p class="subject"><span>Subject</span>${escapeHtml(sample.copy.emailSubject)}</p>
            </div>
            <div class="event-label">${escapeHtml(sample.eventLabel)}</div>
          </div>
          <div class="preview-grid">
            <section class="plain-panel" aria-label="${escapeAttribute(sample.name)} plain text preview">
              <h3 class="panel-title">Plain text preview</h3>
              <pre>${escapeHtml(sample.copy.emailBodyText)}</pre>
            </section>
            <section class="html-panel" aria-label="${escapeAttribute(sample.name)} HTML email preview">
              <h3 class="panel-title">HTML email preview</h3>
              <iframe title="${escapeAttribute(sample.name)} HTML email preview" srcdoc="${escapeAttribute(sample.copy.emailBodyHtml)}"></iframe>
            </section>
          </div>
        </section>
        """.trimIndent()

    private fun escapeAttribute(value: String): String =
        escapeHtml(value)

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

    private data class EmailPreviewSample(
        val name: String,
        val eventLabel: String,
        val copy: NotificationRenderedCopy,
    )
}
