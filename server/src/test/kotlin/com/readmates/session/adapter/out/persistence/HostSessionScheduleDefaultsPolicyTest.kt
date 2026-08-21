package com.readmates.session.adapter.out.persistence

import com.readmates.session.domain.SessionAccessScope
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

class HostSessionScheduleDefaultsPolicyTest {
    @Test
    fun `uses majority start and end time`() {
        val samples =
            List(7) { sample(start = "19:30:00", end = "21:30:00") } +
                List(3) { sample(start = "20:00:00", end = "22:00:00") }
        val defaults = HostSessionScheduleDefaultsPolicy.from(samples)
        assertEquals("19:30", defaults.automatic.startTime)
        assertEquals("21:30", defaults.automatic.endTime)
    }

    @Test
    fun `leaves date empty when only one past meeting exists`() {
        val defaults = HostSessionScheduleDefaultsPolicy.from(listOf(sample(date = LocalDate.parse("2026-04-15"))))
        assertNull(defaults.automatic.suggestedDate)
    }

    @Test
    fun `does not copy book fields`() {
        val defaults = HostSessionScheduleDefaultsPolicy.from(listOf(sample(bookTitle = "Secret Book")))
        assertFalse(defaults.toString().contains("Secret Book"))
    }

    @Test
    fun `empty samples use evening online host-only defaults`() {
        val defaults = HostSessionScheduleDefaultsPolicy.from(emptyList())
        assertEquals("20:00", defaults.automatic.startTime)
        assertEquals("22:00", defaults.automatic.endTime)
        assertEquals("온라인", defaults.automatic.locationLabel)
        assertNull(defaults.previousOnlineMeeting)
        assertEquals(SessionAccessScope.HOST_ONLY, defaults.automatic.accessScope)
        assertNull(defaults.automatic.suggestedDate)
        assertEquals(1L, defaults.automatic.questionDeadlineOffsetDays)
        assertEquals(emptyList<String>(), defaults.hints)
    }

    @Test
    fun `uses latest meeting time when start and end pair is not majority`() {
        val samples =
            List(5) { sample(start = "20:00:00", end = "22:00:00") } +
                List(5) { sample(start = "19:30:00", end = "21:30:00") }
        val defaults = HostSessionScheduleDefaultsPolicy.from(samples)
        assertEquals("20:00", defaults.automatic.startTime)
        assertEquals("22:00", defaults.automatic.endTime)
    }

    @Test
    fun `copies meeting url and passcode from latest row that has a url`() {
        val samples =
            listOf(
                sample(meetingUrl = null, meetingPasscode = "ignored-secret"),
                sample(
                    meetingUrl = "https://meeting.invalid/latest-with-url",
                    meetingPasscode = "room-code-2048",
                ),
                sample(
                    meetingUrl = "https://meeting.invalid/older",
                    meetingPasscode = "older-room-code-2048",
                ),
            )
        val defaults = HostSessionScheduleDefaultsPolicy.from(samples)
        assertEquals("https://meeting.invalid/latest-with-url", defaults.previousOnlineMeeting?.meetingUrl)
        assertEquals("room-code-2048", defaults.previousOnlineMeeting?.meetingPasscode)
    }

    @Test
    fun `does not guess passcode from a different row than the url`() {
        val samples =
            listOf(
                sample(meetingUrl = "https://meeting.invalid/latest-with-url", meetingPasscode = null),
                sample(meetingUrl = "https://meeting.invalid/older", meetingPasscode = "older-room-code-2048"),
            )
        val defaults = HostSessionScheduleDefaultsPolicy.from(samples)
        assertEquals("https://meeting.invalid/latest-with-url", defaults.previousOnlineMeeting?.meetingUrl)
        assertNull(defaults.previousOnlineMeeting?.meetingPasscode)
    }

    @Test
    fun `access scope uses majority otherwise host only`() {
        val majority =
            HostSessionScheduleDefaultsPolicy.from(
                List(6) { sample(accessScope = SessionAccessScope.GUEST_READABLE) } +
                    List(4) { sample(accessScope = SessionAccessScope.HOST_ONLY) },
            )
        assertEquals(SessionAccessScope.GUEST_READABLE, majority.automatic.accessScope)

        val tied =
            HostSessionScheduleDefaultsPolicy.from(
                List(5) { sample(accessScope = SessionAccessScope.GUEST_READABLE) } +
                    List(5) { sample(accessScope = SessionAccessScope.HOST_ONLY) },
            )
        assertEquals(SessionAccessScope.HOST_ONLY, tied.automatic.accessScope)
    }

    @Test
    fun `suggested date uses median consecutive gap and snaps to majority weekday`() {
        val samples =
            listOf(
                sample(date = LocalDate.parse("2026-02-05")),
                sample(date = LocalDate.parse("2026-01-21")),
                sample(date = LocalDate.parse("2026-01-07")),
            )
        val defaults = HostSessionScheduleDefaultsPolicy.from(samples)
        assertEquals("2026-02-18", defaults.automatic.suggestedDate)
    }

    @Test
    fun `question deadline offset uses majority gap otherwise one day`() {
        val majority =
            HostSessionScheduleDefaultsPolicy.from(
                List(7) { sample(date = LocalDate.parse("2026-04-15"), deadlineDaysBefore = 1) } +
                    List(3) { sample(date = LocalDate.parse("2026-04-15"), deadlineDaysBefore = 2) },
            )
        assertEquals(1L, majority.automatic.questionDeadlineOffsetDays)

        val tied =
            HostSessionScheduleDefaultsPolicy.from(
                List(5) { sample(date = LocalDate.parse("2026-04-15"), deadlineDaysBefore = 1) } +
                    List(5) { sample(date = LocalDate.parse("2026-04-08"), deadlineDaysBefore = 3) },
            )
        assertEquals(1L, tied.automatic.questionDeadlineOffsetDays)
    }

    @Test
    fun `adds a time hint when a past meeting pattern exists`() {
        val defaults = HostSessionScheduleDefaultsPolicy.from(listOf(sample(start = "19:30:00", end = "21:30:00")))
        assertEquals(listOf("이전 모임과 같은 시간으로 넣었습니다."), defaults.hints)
    }

    @Suppress("UNUSED_PARAMETER")
    private fun sample(
        date: LocalDate = LocalDate.parse("2026-04-15"),
        start: String = "20:00:00",
        end: String = "22:00:00",
        locationLabel: String = "온라인",
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
        accessScope: SessionAccessScope = SessionAccessScope.HOST_ONLY,
        deadlineDaysBefore: Long = 1,
        bookTitle: String? = null,
    ): HostSessionScheduleSample =
        HostSessionScheduleSample(
            sessionDate = date,
            startTime = LocalTime.parse(start),
            endTime = LocalTime.parse(end),
            locationLabel = locationLabel,
            meetingUrl = meetingUrl,
            meetingPasscode = meetingPasscode,
            accessScope = accessScope,
            questionDeadlineAt = LocalDateTime.of(date.minusDays(deadlineDaysBefore), LocalTime.of(14, 59)),
        )
}
