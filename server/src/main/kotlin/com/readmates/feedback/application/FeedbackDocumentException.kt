package com.readmates.feedback.application

class FeedbackDocumentException(
    val error: FeedbackDocumentError,
    message: String,
) : RuntimeException(message)

enum class FeedbackDocumentError {
    NOT_FOUND,
    STORAGE_UNAVAILABLE,
    ACTIVE_MEMBERSHIP_REQUIRED,
    INVALID_TEMPLATE,
    INVALID_STORED_DOCUMENT,
}
