package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.auth.application.port.`in`.UpdateHostMemberProfileUseCase
import com.readmates.auth.application.port.`in`.UpdateOwnMemberProfileUseCase
import com.readmates.auth.application.service.MemberProfileException
import com.readmates.shared.security.emailOrNull
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
            .status(exception.error.status)
            .body(
                MemberProfileErrorResponse(
                    code = exception.error.code,
                    message = exception.error.message,
                ),
            )

    private fun MemberProfileUpdateRequest.toCommand(): UpdateMemberProfileCommand =
        UpdateMemberProfileCommand(shortName = shortName)
}
