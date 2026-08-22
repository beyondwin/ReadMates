package com.readmates.notification.application.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class NotificationEmailTemplatePreviewTest {
    @Test
    fun `generates browser preview report for sample notification emails`() {
        val reportPath = Path.of("build/reports/readmates/notification-email-preview/index.html")

        val generatedReport = NotificationEmailTemplatePreview.writeReport(reportPath)

        assertThat(generatedReport).exists()
        assertThat(generatedReport).isEqualTo(reportPath.toAbsolutePath().normalize())

        val html = Files.readString(generatedReport)
        assertThat(html).contains(
            "<title>ReadMates notification email preview</title>",
            "읽는사이 알림 테스트",
            "No.8 책이 정해졌습니다",
            "내일 8번째 모임이 있습니다",
            "No.8 피드백 문서가 올라왔습니다",
            "8번째 모임에 새 서평이 올라왔습니다",
            "민서님,",
            "다음 모임과 읽기 흐름에 맞춰 소식을 전합니다.",
            "srcdoc=",
            "Plain text preview",
            "HTML email preview",
        )
    }
}
