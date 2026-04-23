package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.HostSessionCommand
import com.readmates.shared.security.CurrentMember
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.net.URI
import java.time.LocalDate

data class HostSessionRequest(
    @field:NotBlank val title: String,
    @field:NotBlank val bookTitle: String,
    @field:NotBlank val bookAuthor: String,
    @field:Size(max = 500) val bookLink: String? = null,
    @field:Size(max = 1000) val bookImageUrl: String? = null,
    @field:Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}") val date: String,
    @field:Pattern(regexp = "\\d{2}:\\d{2}") val startTime: String? = null,
    @field:Pattern(regexp = "\\d{2}:\\d{2}") val endTime: String? = null,
    val questionDeadlineAt: String? = null,
    @field:Size(max = 255) val locationLabel: String? = null,
    @field:Size(max = 1000) val meetingUrl: String? = null,
    @field:Size(max = 255) val meetingPasscode: String? = null,
) {
    @AssertTrue(message = "date must be a valid ISO calendar date")
    fun isValidCalendarDate(): Boolean = runCatching {
        LocalDate.parse(date)
    }.isSuccess

    @AssertTrue(message = "startTime and endTime must be valid local times")
    fun hasValidTimeRange(): Boolean {
        val parsedStart = runCatching { java.time.LocalTime.parse(effectiveStartTime()) }.getOrNull() ?: return false
        val parsedEnd = runCatching { java.time.LocalTime.parse(effectiveEndTime()) }.getOrNull() ?: return false
        return parsedEnd.isAfter(parsedStart)
    }

    @AssertTrue(message = "questionDeadlineAt must be an ISO offset datetime")
    fun hasValidQuestionDeadline(): Boolean =
        questionDeadlineAt.isNullOrBlank() || runCatching {
            java.time.OffsetDateTime.parse(questionDeadlineAt)
        }.isSuccess

    @AssertTrue(message = "bookLink must be an https URL")
    fun hasAllowedBookLink(): Boolean = isHttpsUrlOrBlank(bookLink)

    @AssertTrue(message = "bookImageUrl must be an https URL")
    fun hasAllowedBookImageUrl(): Boolean = isHttpsUrlOrBlank(bookImageUrl)

    @AssertTrue(message = "meetingUrl must be an https URL")
    fun hasAllowedMeetingUrl(): Boolean = isHttpsUrlOrBlank(meetingUrl)

    fun effectiveStartTime(): String = startTime ?: "20:00"

    fun effectiveEndTime(): String = endTime ?: "22:00"

    fun toCommand(host: CurrentMember): HostSessionCommand =
        HostSessionCommand(
            host = host,
            title = title,
            bookTitle = bookTitle,
            bookAuthor = bookAuthor,
            bookLink = bookLink,
            bookImageUrl = bookImageUrl,
            date = date,
            startTime = startTime,
            endTime = endTime,
            questionDeadlineAt = questionDeadlineAt,
            locationLabel = locationLabel,
            meetingUrl = meetingUrl,
            meetingPasscode = meetingPasscode,
        )
}

private fun isHttpsUrlOrBlank(value: String?): Boolean {
    val trimmed = value?.trim()
    if (trimmed.isNullOrEmpty()) {
        return true
    }

    val uri = runCatching { URI(trimmed) }.getOrNull() ?: return false
    return !uri.isOpaque &&
        uri.scheme.equals("https", ignoreCase = true) &&
        !uri.host.isNullOrBlank() &&
        uri.rawUserInfo == null
}
