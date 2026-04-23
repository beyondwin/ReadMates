package com.readmates.feedback.application.model

import java.util.UUID

data class FeedbackDocumentUploadCommand(
    val sessionId: UUID,
    val fileName: String,
    val contentType: String,
    val sourceText: String,
    val fileSize: Long,
)
