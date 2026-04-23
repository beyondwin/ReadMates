package com.readmates.auth.application.port.out

import java.time.LocalDate
import java.util.UUID

data class PendingApprovalRow(
    val clubName: String,
    val sessionId: UUID?,
    val sessionNumber: Int?,
    val title: String?,
    val bookTitle: String?,
    val bookAuthor: String?,
    val sessionDate: LocalDate?,
    val locationLabel: String?,
)

interface PendingApprovalStorePort {
    fun findPendingApproval(clubId: UUID): PendingApprovalRow?
}
