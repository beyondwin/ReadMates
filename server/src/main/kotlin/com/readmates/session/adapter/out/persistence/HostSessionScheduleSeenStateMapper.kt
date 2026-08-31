package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.ScheduleSeenState
import java.sql.ResultSet

internal fun ResultSet.toScheduleSeenState(scheduleRevision: Long): ScheduleSeenState {
    val seenRevision = getLong("seen_schedule_revision").takeUnless { wasNull() }
    return when {
        seenRevision == null -> ScheduleSeenState.UNSEEN
        seenRevision == scheduleRevision -> ScheduleSeenState.CURRENT
        seenRevision < scheduleRevision -> ScheduleSeenState.STALE
        else -> error("seen schedule revision $seenRevision cannot exceed session schedule revision $scheduleRevision")
    }
}
