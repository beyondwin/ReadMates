@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.CreateHostInvitationLinkCommand
import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.auth.application.model.UpdateHostInvitationLinkCommand
import com.readmates.auth.application.port.`in`.ManageHostInvitationLinksUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.toClubActor
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/host/invitation-links")
class HostInvitationLinkController(
    private val links: ManageHostInvitationLinksUseCase,
) {
    @GetMapping
    fun list(
        currentMember: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ) = links.list(
        currentMember.toClubActor(),
        PageRequest.cursor(limit, cursor, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
    )

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        currentMember: CurrentMember,
        @RequestBody request: CreateHostInvitationLinkRequest,
    ) = links.create(
        currentMember.toClubActor(),
        CreateHostInvitationLinkCommand(
            request.name,
            request.maxUses,
            parseDateTime(request.expiresAt),
            request.idempotencyKey,
        ),
    )

    @PutMapping("/{linkId}")
    fun update(
        currentMember: CurrentMember,
        @PathVariable linkId: String,
        @RequestBody request: UpdateHostInvitationLinkRequest,
    ) = links.update(
        currentMember.toClubActor(),
        parseLinkId(linkId),
        UpdateHostInvitationLinkCommand(
            request.expectedRevision,
            request.name,
            request.maxUses,
            parseDateTime(request.expiresAt),
            parseStatus(request.status),
            request.idempotencyKey,
        ),
    )

    @GetMapping("/{linkId}/history")
    fun history(
        currentMember: CurrentMember,
        @PathVariable linkId: String,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ) = links.history(
        currentMember.toClubActor(),
        parseLinkId(linkId),
        PageRequest.cursor(limit, cursor, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
    )

    private fun parseLinkId(value: String): UUID =
        runCatching {
            UUID.fromString(
                value,
            )
        }.getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invitation link id") }

    private fun parseDateTime(value: String): OffsetDateTime =
        runCatching { OffsetDateTime.parse(value) }
            .getOrElse {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date time")
            }

    private fun parseStatus(value: String): HostInvitationLinkStatus =
        runCatching { HostInvitationLinkStatus.valueOf(value.trim().uppercase()) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invitation link status") }

    private companion object {
        const val DEFAULT_PAGE_LIMIT = 20
        const val MAX_PAGE_LIMIT = 100
    }
}

data class CreateHostInvitationLinkRequest(
    val name: String,
    val maxUses: Int,
    val expiresAt: String,
    val idempotencyKey: String,
)

data class UpdateHostInvitationLinkRequest(
    val expectedRevision: Long,
    val name: String,
    val maxUses: Int,
    val expiresAt: String,
    val status: String,
    val idempotencyKey: String,
)
