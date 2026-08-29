package com.readmates.session.domain

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

data class MemberVisibleSchedule(
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val questionDeadlineAt: LocalDateTime,
)

object SessionScheduleRevisionPolicy {
    fun changed(
        before: MemberVisibleSchedule,
        after: MemberVisibleSchedule,
    ): Boolean = before != after
}
