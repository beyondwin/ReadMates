@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HOST_PERSON_MAX_PAGE_SIZE
import com.readmates.hostworkspace.application.model.HostPersonActor
import com.readmates.hostworkspace.application.model.HostPersonAttendanceItem
import com.readmates.hostworkspace.application.model.HostPersonDetail
import com.readmates.hostworkspace.application.model.HostPersonDetailAccessDeniedException
import com.readmates.hostworkspace.application.model.HostPersonDetailNotFoundException
import com.readmates.hostworkspace.application.model.HostPersonDetailRequest
import com.readmates.hostworkspace.application.model.HostPersonInvalidCursorException
import com.readmates.hostworkspace.application.model.HostPersonInvalidRequestException
import com.readmates.hostworkspace.application.model.HostPersonMembershipRole
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.hostworkspace.application.model.HostPersonRsvpStatus
import com.readmates.hostworkspace.application.model.HostPersonSchedule
import com.readmates.hostworkspace.application.port.`in`.GetHostPersonDetailUseCase
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.time.Instant
import java.time.LocalDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/host/people")
class HostPersonDetailController(
    private val getDetail: GetHostPersonDetailUseCase,
    private val cursorCodec: HostPersonCursorCodec,
) {
    @GetMapping("/{membershipId}")
    fun detail(
        member: CurrentMember,
        @PathVariable membershipId: String,
        @RequestParam(required = false) attendanceCursor: String?,
        @RequestParam(defaultValue = "20") limit: Int,
    ): HostPersonDetailResponse {
        val targetId =
            runCatching { UUID.fromString(membershipId) }
                .getOrElse { throw HostPersonInvalidRequestException() }
        if (limit !in 1..HOST_PERSON_MAX_PAGE_SIZE) throw HostPersonInvalidRequestException()
        val anchor =
            attendanceCursor?.takeIf(String::isNotBlank)?.let { raw ->
                cursorCodec.decode(raw, member.clubId, member.membershipId, targetId)
            } ?: cursorCodec.begin()
        val detail =
            getDetail.get(
                HostPersonDetailRequest(
                    actor = HostPersonActor(member.clubId, member.membershipId, member.isHost),
                    targetMembershipId = targetId,
                    limit = limit,
                    cursor = anchor,
                ),
            )
        return detail.toResponse(
            detail.attendanceHistory.next?.let { last ->
                cursorCodec.encode(member.clubId, member.membershipId, targetId, anchor, last)
            },
        )
    }
}

@RestControllerAdvice(assignableTypes = [HostPersonDetailController::class])
@Suppress("MaxLineLength")
class HostPersonApplicationErrorHandler {
    @ExceptionHandler(HostPersonDetailAccessDeniedException::class)
    fun forbidden(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", "호스트 권한이 필요합니다.")

    @ExceptionHandler(HostPersonDetailNotFoundException::class)
    fun notFound(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "멤버를 찾을 수 없습니다.")

    @ExceptionHandler(HostPersonInvalidRequestException::class)
    fun invalidRequest(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "요청 값을 확인해 주세요.")

    @ExceptionHandler(HostPersonInvalidCursorException::class)
    fun invalidCursor(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.BAD_REQUEST, "INVALID_CURSOR", "커서를 다시 확인해 주세요.")
}

data class HostPersonDetailResponse(
    val membershipId: UUID,
    val displayName: String,
    val avatarKey: String,
    val status: HostPersonMembershipStatus,
    val role: HostPersonMembershipRole,
    val lastClubAccessAt: Instant?,
    val currentSchedule: HostPersonSchedule?,
    val currentRsvp: HostPersonRsvpStatus?,
    val attendanceHistory: HostPersonAttendanceHistoryResponse,
)

data class HostPersonAttendanceHistoryResponse(
    val items: List<HostPersonAttendanceItemResponse>,
    val nextCursor: String?,
)

data class HostPersonAttendanceItemResponse(
    val sessionNumber: Int,
    val scheduledAt: LocalDateTime,
    val attendanceStatus: String,
)

private fun HostPersonDetail.toResponse(nextCursor: String?) =
    HostPersonDetailResponse(
        membershipId,
        displayName,
        avatarKey,
        status,
        role,
        lastClubAccessAt,
        currentSchedule,
        currentRsvp,
        HostPersonAttendanceHistoryResponse(
            attendanceHistory.items.map(HostPersonAttendanceItem::toResponse),
            nextCursor,
        ),
    )

@Suppress("MaxLineLength")
private fun HostPersonAttendanceItem.toResponse() = HostPersonAttendanceItemResponse(sessionNumber, scheduledAt, attendanceStatus.name)
