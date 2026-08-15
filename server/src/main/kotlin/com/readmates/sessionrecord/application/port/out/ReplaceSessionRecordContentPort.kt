package com.readmates.sessionrecord.application.port.out

import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.shared.security.AuthenticatedClubActor
import java.time.LocalDate
import java.util.UUID

interface ReplaceSessionRecordContentPort {
    fun replace(input: SessionRecordContentReplacement): SessionRecordContentReplacementResult
}

data class SessionRecordContentReplacement(
    val host: AuthenticatedClubActor,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val snapshot: SessionRecordSnapshot,
    val source: SessionRecordDraftSource,
    val trustedAuthorBindings: Map<String, UUID>,
    val historicalAuthorBindings: Map<String, UUID>,
)

sealed interface SessionRecordContentReplacementResult {
    data class Applied(
        val canonicalSnapshot: SessionRecordSnapshot,
    ) : SessionRecordContentReplacementResult

    data object Invalid : SessionRecordContentReplacementResult
}
