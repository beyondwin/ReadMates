package com.readmates.notification.application.port.out

data class MailDeliveryCommand(
    val to: String,
    val subject: String,
    val text: String,
    val html: String? = null,
)

interface MailDeliveryPort {
    fun send(command: MailDeliveryCommand)
}
