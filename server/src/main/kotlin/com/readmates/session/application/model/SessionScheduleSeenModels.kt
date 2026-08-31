package com.readmates.session.application.model

import com.readmates.shared.security.CurrentMember
import java.time.OffsetDateTime

data class MarkScheduleSeenCommand(
    val member: CurrentMember,
    val scheduleRevision: Long,
)

data class ScheduleSeenResult(
    val scheduleRevision: Long,
    val seenAt: OffsetDateTime,
)

class SessionScheduleRevisionStaleException : RuntimeException("Session schedule revision is stale")
