package com.readmates.sessionrecord.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

data class AppliedSessionRecordPublicEffect(
    val receiptId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val liveRecordRevision: Long,
    val committedAt: OffsetDateTime,
)

fun interface SessionRecordPublicProjectionPort {
    fun recordApplied(effect: AppliedSessionRecordPublicEffect)

    class Noop : SessionRecordPublicProjectionPort {
        override fun recordApplied(effect: AppliedSessionRecordPublicEffect) = Unit
    }
}
