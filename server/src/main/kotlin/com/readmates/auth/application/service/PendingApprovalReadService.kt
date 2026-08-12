package com.readmates.auth.application.service

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.model.PendingApprovalAppResponse
import com.readmates.auth.application.model.PendingCurrentSessionResponse
import com.readmates.auth.application.port.`in`.GetPendingApprovalUseCase
import com.readmates.auth.application.port.out.PendingApprovalRow
import com.readmates.auth.application.port.out.PendingApprovalStorePort
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.springframework.stereotype.Service

@Service
class PendingApprovalReadService(
    private val pendingApprovalStore: PendingApprovalStorePort,
) : GetPendingApprovalUseCase {
    override fun get(actor: ClubActor): PendingApprovalAppResponse {
        requirePendingViewer(actor)

        return pendingApprovalStore
            .findPendingApproval(actor.clubId)
            ?.toPendingApprovalAppResponse()
            ?: throw AuthApplicationException(AuthApplicationError.CLUB_NOT_FOUND, "Club not found")
    }

    private fun PendingApprovalRow.toPendingApprovalAppResponse(): PendingApprovalAppResponse =
        PendingApprovalAppResponse(
            approvalState = "VIEWER",
            clubName = clubName,
            currentSession =
                sessionId?.let {
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

    private fun requirePendingViewer(actor: ClubActor) {
        if (!actor.can(ClubCapability.VIEW_PENDING_APPROVAL)) throw existingPendingApprovalFailure()
    }

    private fun existingPendingApprovalFailure(): AuthApplicationException =
        AuthApplicationException(AuthApplicationError.PENDING_APPROVAL_REQUIRED, "Pending approval required")
}
