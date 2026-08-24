package com.readmates.shared.delivery

data class MailDeliveryCommand(
    val to: String,
    val subject: String,
    val text: String,
    val html: String? = null,
)

enum class MailDeliveryFailureKind(
    val storageCode: String,
) {
    PERMANENT("MAIL_PERMANENT"),
    RETRYABLE("MAIL_RETRYABLE"),
    AMBIGUOUS("MAIL_AMBIGUOUS"),
}

class MailDeliveryFailure(
    val kind: MailDeliveryFailureKind,
) : RuntimeException(kind.storageCode)

fun interface MailDeliveryPort {
    fun send(command: MailDeliveryCommand)
}
