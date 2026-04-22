package com.readmates.auth.api

import com.readmates.auth.application.AuthenticatedMemberResolver
import com.readmates.auth.application.MemberApprovalService
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.MemberLifecycleService
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/host/members")
class HostMemberApprovalController(
    private val memberApprovalService: MemberApprovalService,
    private val memberLifecycleService: MemberLifecycleService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @GetMapping
    fun members(authentication: Authentication?) =
        memberLifecycleService.listMembers(requireHost(authentication))

    @GetMapping("/pending-approvals")
    fun pending(authentication: Authentication?) =
        memberApprovalService.listPending(requireHost(authentication))

    @PostMapping("/{membershipId}/approve")
    fun approve(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
    ) = memberApprovalService.approve(requireHost(authentication), membershipId)

    @PostMapping("/{membershipId}/reject")
    fun reject(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
    ) = memberApprovalService.reject(requireHost(authentication), membershipId)

    @PostMapping("/{membershipId}/suspend")
    fun suspend(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
        @RequestBody request: MemberLifecycleRequest,
    ) = memberLifecycleService.suspend(requireHost(authentication), membershipId, request)

    @PostMapping("/{membershipId}/restore")
    fun restore(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
    ) = memberLifecycleService.restore(requireHost(authentication), membershipId)

    @PostMapping("/{membershipId}/deactivate")
    fun deactivate(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
        @RequestBody request: MemberLifecycleRequest,
    ) = memberLifecycleService.deactivate(requireHost(authentication), membershipId, request)

    @PostMapping("/{membershipId}/current-session/add")
    fun addToCurrentSession(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
    ) = memberLifecycleService.addToCurrentSession(requireHost(authentication), membershipId)

    @PostMapping("/{membershipId}/current-session/remove")
    fun removeFromCurrentSession(
        authentication: Authentication?,
        @PathVariable membershipId: UUID,
    ) = memberLifecycleService.removeFromCurrentSession(requireHost(authentication), membershipId)

    private fun requireHost(authentication: Authentication?): CurrentMember =
        authenticatedMemberResolver.resolve(authentication)
            ?.takeIf { it.isHost }
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "Host role required")
}
