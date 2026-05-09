package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.port.`in`.CreateSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ListSupportAccessGrantsUseCase
import com.readmates.club.application.port.`in`.RevokeSupportAccessGrantUseCase
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/admin/support-access-grants")
class SupportAccessGrantController(
    private val createUseCase: CreateSupportAccessGrantUseCase,
    private val revokeUseCase: RevokeSupportAccessGrantUseCase,
    private val listUseCase: ListSupportAccessGrantsUseCase,
) {
    @PostMapping
    fun create(
        admin: CurrentPlatformAdmin,
        @RequestBody request: CreateSupportAccessGrantRequest,
    ): SupportAccessGrantResponse =
        SupportAccessGrantResponse.from(
            createUseCase.createSupportAccessGrant(
                admin = admin,
                command = CreateSupportAccessGrantCommand(
                    clubId = request.clubId,
                    granteeUserId = request.granteeUserId,
                    scope = request.scope,
                    reason = request.reason,
                    expiresAt = request.expiresAt,
                ),
            ),
        )

    @DeleteMapping("/{grantId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(
        admin: CurrentPlatformAdmin,
        @PathVariable grantId: UUID,
    ) {
        revokeUseCase.revokeSupportAccessGrant(admin = admin, grantId = grantId)
    }

    @GetMapping
    fun list(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) granteeUserId: UUID?,
    ): List<SupportAccessGrantResponse> {
        return when {
            clubId != null -> listUseCase.listByClub(admin, clubId)
            granteeUserId != null -> listUseCase.listByGrantee(admin, granteeUserId)
            else -> emptyList()
        }.map(SupportAccessGrantResponse::from)
    }
}

data class CreateSupportAccessGrantRequest(
    val clubId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
)

data class SupportAccessGrantResponse(
    val id: String,
    val clubId: String,
    val grantedByUserId: String,
    val granteeUserId: String,
    val scope: String,
    val reason: String,
    val expiresAt: OffsetDateTime,
    val revokedAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
) {
    companion object {
        fun from(grant: SupportAccessGrant): SupportAccessGrantResponse =
            SupportAccessGrantResponse(
                id = grant.id.toString(),
                clubId = grant.clubId.toString(),
                grantedByUserId = grant.grantedByUserId.toString(),
                granteeUserId = grant.granteeUserId.toString(),
                scope = grant.scope.name,
                reason = grant.reason,
                expiresAt = grant.expiresAt,
                revokedAt = grant.revokedAt,
                createdAt = grant.createdAt,
            )
    }
}
