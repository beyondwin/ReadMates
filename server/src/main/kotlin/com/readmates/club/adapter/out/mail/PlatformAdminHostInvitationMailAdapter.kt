package com.readmates.club.adapter.out.mail

import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.club.application.port.out.TransientPlatformAdminHostInvitationMail
import com.readmates.shared.delivery.MailDeliveryCommand
import com.readmates.shared.delivery.MailDeliveryPort
import org.springframework.stereotype.Component

@Component
class PlatformAdminHostInvitationMailAdapter(
    private val mailDeliveryPort: MailDeliveryPort,
) : SendPlatformAdminHostInvitationEmailPort {
    override fun send(command: TransientPlatformAdminHostInvitationMail) {
        mailDeliveryPort.send(
            MailDeliveryCommand(
                to = command.to,
                subject = "ReadMates host invitation: ${command.clubName}",
                text =
                    "You have been invited as the first host for ${command.clubName}." +
                        "\n\nAccept: ${command.acceptUrl}",
                html =
                    """
                    <p>You have been invited as the first host for <strong>${command.clubName.escapeHtml()}</strong>.</p>
                    <p><a href="${command.acceptUrl.escapeHtml()}">Accept the invitation</a></p>
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
