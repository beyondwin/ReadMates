package com.readmates.club.adapter.out.mail

import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import org.springframework.stereotype.Component

@Component
class PlatformAdminHostInvitationMailAdapter(
    private val mailDeliveryPort: MailDeliveryPort,
) : SendPlatformAdminHostInvitationEmailPort {
    override fun send(
        to: String,
        clubName: String,
        acceptUrl: String,
    ) {
        mailDeliveryPort.send(
            MailDeliveryCommand(
                to = to,
                subject = "ReadMates host invitation: $clubName",
                text = "You have been invited as the first host for $clubName.\n\nAccept: $acceptUrl",
                html =
                    """
                    <p>You have been invited as the first host for <strong>${clubName.escapeHtml()}</strong>.</p>
                    <p><a href="${acceptUrl.escapeHtml()}">Accept the invitation</a></p>
                    """.trimIndent(),
            ),
        )
    }

    private fun String.escapeHtml(): String =
        replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
}
