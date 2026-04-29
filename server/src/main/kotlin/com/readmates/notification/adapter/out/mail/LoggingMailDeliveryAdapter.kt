package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.Locale

@Component
@ConditionalOnProperty(
    prefix = "readmates.notifications",
    name = ["enabled"],
    havingValue = "false",
    matchIfMissing = true,
)
class LoggingMailDeliveryAdapter : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        logger.info("Notification delivery disabled; skipped email to recipient domain {}", command.to.recipientDomain())
    }

    private fun String.recipientDomain(): String =
        substringAfterLast('@', missingDelimiterValue = "unknown")
            .ifBlank { "unknown" }
            .lowercase(Locale.ROOT)

    private companion object {
        private val logger = LoggerFactory.getLogger(LoggingMailDeliveryAdapter::class.java)
    }
}
