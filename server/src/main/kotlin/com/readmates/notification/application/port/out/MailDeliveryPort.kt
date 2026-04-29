package com.readmates.notification.application.port.out

data class MailDeliveryCommand(
    val to: String,
    val subject: String,
    val text: String,
)

interface MailDeliveryPort {
    fun send(command: MailDeliveryCommand)
}
