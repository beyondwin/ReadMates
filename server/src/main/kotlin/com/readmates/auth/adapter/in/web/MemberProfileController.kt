package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.auth.application.port.`in`.UpdateHostMemberProfileUseCase
import com.readmates.auth.application.port.`in`.UpdateOwnMemberProfileUseCase
import com.readmates.auth.application.service.MemberProfileError
import com.readmates.auth.application.service.MemberProfileException
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class MemberProfileController(
    private val updateOwnMemberProfile: UpdateOwnMemberProfileUseCase,
    private val updateHostMemberProfileUseCase: UpdateHostMemberProfileUseCase,
) {
    @PatchMapping("/me/profile")
    fun updateOwnProfile(
        authentication: Authentication?,
        @RequestBody request: MemberProfileUpdateRequest,
    ): MemberProfileResponse {
        val profile = updateOwnMemberProfile.updateOwnProfile(
            authentication.emailOrNull(),
            request.toCommand(),
        )
        return MemberProfileResponse.from(profile)
    }

    @PatchMapping("/host/members/{membershipId}/profile")
    fun updateHostMemberProfile(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
        @RequestBody request: MemberProfileUpdateRequest,
    ) = updateHostMemberProfileUseCase.updateMemberProfile(
        authentication.emailOrNull(),
        membershipId,
        request.toCommand(),
    )

    @ExceptionHandler(MemberProfileException::class)
    fun handleMemberProfileException(exception: MemberProfileException): ResponseEntity<MemberProfileErrorResponse> =
        ResponseEntity
            .status(exception.error.httpStatus())
            .body(
                MemberProfileErrorResponse(
                    code = exception.error.code,
                    message = exception.error.responseMessage(),
                ),
            )

    private fun MemberProfileUpdateRequest.toCommand(): UpdateMemberProfileCommand =
        UpdateMemberProfileCommand(displayName = displayName)

    private fun MemberProfileError.httpStatus(): HttpStatus =
        when (this) {
            MemberProfileError.AUTHENTICATION_REQUIRED -> HttpStatus.UNAUTHORIZED
            MemberProfileError.HOST_ROLE_REQUIRED,
            MemberProfileError.MEMBERSHIP_NOT_ALLOWED -> HttpStatus.FORBIDDEN
            MemberProfileError.MEMBER_NOT_FOUND -> HttpStatus.NOT_FOUND
            MemberProfileError.DISPLAY_NAME_REQUIRED,
            MemberProfileError.DISPLAY_NAME_TOO_LONG,
            MemberProfileError.DISPLAY_NAME_INVALID,
            MemberProfileError.DISPLAY_NAME_RESERVED -> HttpStatus.BAD_REQUEST
            MemberProfileError.DISPLAY_NAME_DUPLICATE -> HttpStatus.CONFLICT
        }

    private fun MemberProfileError.responseMessage(): String =
        when (this) {
            MemberProfileError.AUTHENTICATION_REQUIRED -> "Authentication required"
            MemberProfileError.HOST_ROLE_REQUIRED -> "Host role required"
            MemberProfileError.MEMBERSHIP_NOT_ALLOWED -> "Membership is not allowed to edit profile"
            MemberProfileError.MEMBER_NOT_FOUND -> "Member not found"
            MemberProfileError.DISPLAY_NAME_REQUIRED -> "Display name is required"
            MemberProfileError.DISPLAY_NAME_TOO_LONG -> "Display name must be 20 characters or fewer"
            MemberProfileError.DISPLAY_NAME_INVALID -> "Display name is invalid"
            MemberProfileError.DISPLAY_NAME_RESERVED -> "Display name is reserved"
            MemberProfileError.DISPLAY_NAME_DUPLICATE -> "Display name is already used in this club"
        }
}
