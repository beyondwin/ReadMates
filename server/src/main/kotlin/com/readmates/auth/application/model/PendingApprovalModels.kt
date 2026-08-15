package com.readmates.auth.application.model

data class PendingApprovalAppResponse(
    val approvalState: String,
    val clubName: String,
    val currentSession: PendingCurrentSessionResponse?,
)

data class PendingCurrentSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val locationLabel: String,
)
