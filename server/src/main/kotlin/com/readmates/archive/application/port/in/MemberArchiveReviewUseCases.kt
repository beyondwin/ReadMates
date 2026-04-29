package com.readmates.archive.application.port.`in`

import com.readmates.shared.security.CurrentMember
import java.util.UUID

data class SaveMemberArchiveLongReviewCommand(
    val member: CurrentMember,
    val sessionId: UUID,
    val body: String,
)

data class SaveMemberArchiveLongReviewResult(
    val sessionId: UUID,
    val body: String,
    val newlyPublic: Boolean,
)

interface SaveMemberArchiveLongReviewUseCase {
    fun save(command: SaveMemberArchiveLongReviewCommand): SaveMemberArchiveLongReviewResult
}
