package com.readmates.session.application.model

import com.readmates.session.application.HostSessionDeletionCounts
import java.time.OffsetDateTime
import java.util.UUID

const val HOST_SESSION_TRASH_RETENTION_DAYS = 7L

data class HostSessionTrashResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val state: String,
    val trashed: Boolean,
    val deletedAt: String,
    val purgeAfter: String,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionTrashPage(
    val items: List<HostSessionTrashResponse>,
    val nextCursor: String?,
)

data class HostSessionTrashRecord(
    val sessionId: UUID,
    val sessionNumber: Int,
    val title: String,
    val state: String,
    val deletedAt: OffsetDateTime,
    val purgeAfter: OffsetDateTime,
    val restorable: Boolean,
)

data class HostSessionTrashPurgeTarget(
    val sessionId: UUID,
    val clubId: UUID,
)

class HostSessionTrashExpiredException : RuntimeException("Host session trash expired")
