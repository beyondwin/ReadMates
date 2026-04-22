package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.port.`in`.ManageHostSessionUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.time.LocalDate
import java.util.UUID

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

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionController(
    private val manageHostSessionUseCase: ManageHostSessionUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @Valid @RequestBody request: HostSessionRequest,
        member: CurrentMember,
    ) = manageHostSessionUseCase.create(request.toCommand(member))

    @GetMapping("/{sessionId}")
    fun detail(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.detail(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @PatchMapping("/{sessionId}")
    fun update(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: HostSessionRequest,
        member: CurrentMember,
    ) = manageHostSessionUseCase.update(
        UpdateHostSessionCommand(
            host = member,
            sessionId = parseHostSessionId(sessionId),
            session = request.toCommand(member),
        ),
    )

    @GetMapping("/{sessionId}/deletion-preview")
    fun deletionPreview(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.deletionPreview(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @DeleteMapping("/{sessionId}")
    fun delete(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.delete(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
}

internal fun parseHostSessionId(sessionId: String): UUID =
    runCatching { UUID.fromString(sessionId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
