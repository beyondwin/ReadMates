@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.HostClubApprovalPolicy
import com.readmates.club.application.model.HostClubRecordPublicationDefault
import com.readmates.club.application.model.HostClubSettingsError
import com.readmates.club.application.model.HostClubSettingsException
import com.readmates.club.application.model.UpdateHostClubSettingsCommand
import com.readmates.club.application.port.`in`.ManageHostClubSettingsUseCase
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.toClubActor
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

@RestController
@RequestMapping("/api/host/club-settings")
class HostClubSettingsController(
    private val settings: ManageHostClubSettingsUseCase,
) {
    @GetMapping
    fun get(currentMember: CurrentMember) = settings.get(currentMember.toClubActor())

    @PutMapping
    fun update(
        currentMember: CurrentMember,
        @RequestBody request: UpdateHostClubSettingsRequest,
    ) = settings.update(
        currentMember.toClubActor(),
        UpdateHostClubSettingsCommand(
            request.expectedRevision,
            request.name,
            enumValue(request.approvalPolicy),
            request.defaultTimezone,
            request.scheduleReminderEnabled,
            enumValue(request.recordPublicationDefault),
            request.idempotencyKey,
        ),
    )

    @PostMapping("/co-hosts/{membershipId}/promote")
    fun promote(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
        @RequestBody request: HostClubRevisionCommandRequest,
    ) = settings.promoteCoHost(currentMember.toClubActor(), membershipId, request.expectedRevision, request.idempotencyKey)

    @PostMapping("/co-hosts/{membershipId}/demote")
    fun demote(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
        @RequestBody request: HostClubRevisionCommandRequest,
    ) = settings.demoteCoHost(currentMember.toClubActor(), membershipId, request.expectedRevision, request.idempotencyKey)

    @GetMapping("/history")
    fun history(
        currentMember: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ) = settings.history(currentMember.toClubActor(), PageRequest.cursor(limit, cursor, 20, 100))

    @PostMapping("/end/preview")
    fun previewEnd(currentMember: CurrentMember) = settings.previewClubEnd(currentMember.toClubActor())

    @PostMapping("/end/confirm")
    fun confirmEnd(
        currentMember: CurrentMember,
        @RequestBody request: ConfirmHostClubEndRequest,
    ) = settings.confirmClubEnd(currentMember.toClubActor(), request.previewId, request.effectHash, request.idempotencyKey)

    private inline fun <reified T : Enum<T>> enumValue(value: String): T =
        runCatching { enumValueOf<T>(value.trim().uppercase()) }
            .getOrElse {
                throw HostClubSettingsException(
                    "INVALID_HOST_CLUB_SETTING",
                    HostClubSettingsError.BAD_REQUEST,
                    "Invalid club setting",
                )
            }
}

data class UpdateHostClubSettingsRequest(
    val expectedRevision: Long,
    val name: String,
    val approvalPolicy: String,
    val defaultTimezone: String,
    val scheduleReminderEnabled: Boolean,
    val recordPublicationDefault: String,
    val idempotencyKey: String,
)

data class HostClubRevisionCommandRequest(
    val expectedRevision: Long,
    val idempotencyKey: String,
)

data class ConfirmHostClubEndRequest(
    val previewId: UUID,
    val effectHash: String,
    val idempotencyKey: String,
)

@RestControllerAdvice
class HostClubSettingsErrorHandler {
    @ExceptionHandler(HostClubSettingsException::class)
    fun handle(error: HostClubSettingsException) =
        apiErrorResponse(
            when (error.kind) {
                HostClubSettingsError.BAD_REQUEST -> HttpStatus.BAD_REQUEST
                HostClubSettingsError.FORBIDDEN -> HttpStatus.FORBIDDEN
                HostClubSettingsError.NOT_FOUND -> HttpStatus.NOT_FOUND
                HostClubSettingsError.CONFLICT -> HttpStatus.CONFLICT
            },
            error.code,
            error.message ?: error.code,
        )
}
