package com.readmates.session.domain

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

class SessionScheduleRevisionPolicyTest {
    private val schedule =
        MemberVisibleSchedule(
            title = "원래 제목",
            bookTitle = "원래 책",
            bookAuthor = "원래 저자",
            bookLink = "https://example.com/book",
            bookImageUrl = "https://example.com/book.png",
            date = LocalDate.of(2026, 9, 2),
            startTime = LocalTime.of(20, 0),
            endTime = LocalTime.of(22, 0),
            locationLabel = "온라인",
            meetingUrl = "https://example.com/meeting",
            meetingPasscode = "original-passcode",
            questionDeadlineAt = LocalDateTime.of(2026, 9, 1, 14, 59),
        )

    @Test
    fun `every member-visible schedule field bumps the schedule revision`() {
        val changes =
            listOf(
                "title" to schedule.copy(title = "바뀐 제목"),
                "book title" to schedule.copy(bookTitle = "바뀐 책"),
                "book author" to schedule.copy(bookAuthor = "바뀐 저자"),
                "book link" to schedule.copy(bookLink = "https://example.com/changed-book"),
                "book image" to schedule.copy(bookImageUrl = "https://example.com/changed-book.png"),
                "date" to schedule.copy(date = LocalDate.of(2026, 9, 3)),
                "start time" to schedule.copy(startTime = LocalTime.of(19, 0)),
                "end time" to schedule.copy(endTime = LocalTime.of(21, 0)),
                "location label" to schedule.copy(locationLabel = "오프라인"),
                "meeting URL" to schedule.copy(meetingUrl = "https://example.com/changed-meeting"),
                "meeting passcode" to schedule.copy(meetingPasscode = "changed-passcode"),
                "question deadline" to schedule.copy(questionDeadlineAt = LocalDateTime.of(2026, 9, 1, 15, 0)),
            )

        changes.forEach { (field, changedSchedule) ->
            assertThat(SessionScheduleRevisionPolicy.changed(schedule, changedSchedule))
                .describedAs("expected $field to change the member-visible schedule")
                .isTrue()
        }
    }

    @Test
    fun `identical member-visible schedule does not bump the schedule revision`() {
        assertThat(SessionScheduleRevisionPolicy.changed(schedule, schedule.copy())).isFalse()
    }
}
