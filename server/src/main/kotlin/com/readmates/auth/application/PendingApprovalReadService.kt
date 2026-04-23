package com.readmates.auth.application

import com.readmates.auth.application.port.`in`.GetPendingApprovalUseCase
import com.readmates.auth.application.port.out.PendingApprovalRow
import com.readmates.auth.application.port.out.PendingApprovalStorePort
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

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

@Service
class PendingApprovalReadService(
    private val pendingApprovalStore: PendingApprovalStorePort,
) : GetPendingApprovalUseCase {
    override fun get(member: CurrentMember): PendingApprovalAppResponse {
        if (!member.isViewer) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Pending approval required")
        }

        return pendingApprovalStore.findPendingApproval(member.clubId)
            ?.toPendingApprovalAppResponse()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found")
    }

    private fun PendingApprovalRow.toPendingApprovalAppResponse(): PendingApprovalAppResponse {
        return PendingApprovalAppResponse(
            approvalState = "VIEWER",
            clubName = clubName,
            currentSession = sessionId?.let {
                PendingCurrentSessionResponse(
                    sessionId = it.toString(),
                    sessionNumber = requireNotNull(sessionNumber),
                    title = requireNotNull(title),
                    bookTitle = requireNotNull(bookTitle),
                    bookAuthor = requireNotNull(bookAuthor),
                    date = requireNotNull(sessionDate).toString(),
                    locationLabel = requireNotNull(locationLabel),
                )
            },
        )
    }
}
