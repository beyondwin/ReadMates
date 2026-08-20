package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.domain.SessionAccessScope
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

private val TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm")
private const val DEFAULT_START_TIME = "20:00"
private const val DEFAULT_END_TIME = "22:00"
private const val DEFAULT_LOCATION = "온라인"
private const val DEFAULT_DEADLINE_OFFSET_DAYS = 1L
private const val DAYS_IN_WEEK = 7
private const val TIME_HINT = "이전 모임과 같은 시간으로 넣었습니다."

internal data class HostSessionScheduleSample(
    val sessionDate: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val accessScope: SessionAccessScope,
    val questionDeadlineAt: LocalDateTime,
)

internal object HostSessionScheduleDefaultsPolicy {
    fun from(samples: List<HostSessionScheduleSample>): HostSessionScheduleDefaults {
        if (samples.isEmpty()) {
            return HostSessionScheduleDefaults(
                startTime = DEFAULT_START_TIME,
                endTime = DEFAULT_END_TIME,
                locationLabel = DEFAULT_LOCATION,
                meetingUrl = null,
                meetingPasscode = null,
                accessScope = SessionAccessScope.HOST_ONLY,
                suggestedDate = null,
                questionDeadlineOffsetDays = DEFAULT_DEADLINE_OFFSET_DAYS,
                hints = emptyList(),
            )
        }
        val latest = samples.first()
        val time = majorityOrNull(samples.map { it.startTime to it.endTime }) ?: (latest.startTime to latest.endTime)
        val location =
            (majorityOrNull(samples.map { it.locationLabel.trim() }) ?: latest.locationLabel.trim())
                .ifEmpty { DEFAULT_LOCATION }
        val meeting = samples.firstNotNullOfOrNull(::meetingCopy)
        val accessScope = majorityOrNull(samples.map { it.accessScope }) ?: SessionAccessScope.HOST_ONLY
        val deadlineOffsets =
            samples.map { sample ->
                ChronoUnit.DAYS.between(sample.questionDeadlineAt.toLocalDate(), sample.sessionDate)
            }
        return HostSessionScheduleDefaults(
            startTime = time.first.format(TIME_FORMAT),
            endTime = time.second.format(TIME_FORMAT),
            locationLabel = location,
            meetingUrl = meeting?.url,
            meetingPasscode = meeting?.passcode,
            accessScope = accessScope,
            suggestedDate = suggestedDate(samples),
            questionDeadlineOffsetDays = majorityOrNull(deadlineOffsets) ?: DEFAULT_DEADLINE_OFFSET_DAYS,
            hints = listOf(TIME_HINT),
        )
    }

    private fun meetingCopy(sample: HostSessionScheduleSample): MeetingCopy? {
        val url = sample.meetingUrl?.trim()?.takeIf(String::isNotEmpty) ?: return null
        return MeetingCopy(
            url = url,
            passcode = sample.meetingPasscode?.trim()?.takeIf(String::isNotEmpty),
        )
    }

    private fun suggestedDate(samples: List<HostSessionScheduleSample>): String? {
        if (samples.size < 2) return null
        val dates = samples.map { it.sessionDate }.sorted()
        val latest = dates.last()
        val gaps = dates.zipWithNext { previous, next -> ChronoUnit.DAYS.between(previous, next) }
        var suggested = latest.plusDays(medianLong(gaps))
        majorityOrNull(dates.map { it.dayOfWeek })?.let { weekday ->
            suggested = snapToWeekday(suggested, weekday)
        }
        while (!suggested.isAfter(latest)) {
            suggested = suggested.plusWeeks(1)
        }
        return suggested.toString()
    }

    private fun snapToWeekday(
        date: LocalDate,
        weekday: DayOfWeek,
    ): LocalDate {
        if (date.dayOfWeek == weekday) return date
        val forwardDays = (weekday.value - date.dayOfWeek.value + DAYS_IN_WEEK) % DAYS_IN_WEEK
        val backwardDays = (date.dayOfWeek.value - weekday.value + DAYS_IN_WEEK) % DAYS_IN_WEEK
        return if (backwardDays < forwardDays) {
            date.minusDays(backwardDays.toLong())
        } else {
            date.plusDays(forwardDays.toLong())
        }
    }

    private fun medianLong(values: List<Long>): Long {
        val sorted = values.sorted()
        val middle = sorted.size / 2
        return if (sorted.size % 2 == 1) {
            sorted[middle]
        } else {
            (sorted[middle - 1] + sorted[middle]) / 2
        }
    }

    private fun <T> majorityOrNull(values: List<T>): T? {
        val n = values.size
        if (n == 0) return null
        return values
            .groupingBy { it }
            .eachCount()
            .entries
            .firstOrNull { (_, count) -> count * 2 > n }
            ?.key
    }

    private data class MeetingCopy(
        val url: String,
        val passcode: String?,
    )
}
