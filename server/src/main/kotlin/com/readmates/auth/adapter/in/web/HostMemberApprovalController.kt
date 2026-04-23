package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.port.`in`.ManageMemberApprovalsUseCase
import com.readmates.auth.application.port.`in`.ManageMemberLifecycleUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/host/members")
class HostMemberApprovalController(
    private val memberApprovals: ManageMemberApprovalsUseCase,
    private val memberLifecycle: ManageMemberLifecycleUseCase,
) {
    @GetMapping
    fun members(currentMember: CurrentMember) =
        memberLifecycle.listMembers(currentMember)

    @GetMapping("/viewers")
    fun viewers(currentMember: CurrentMember) =
        memberApprovals.listViewers(currentMember)

    @GetMapping("/pending-approvals")
    fun pending(currentMember: CurrentMember) =
        memberApprovals.listViewers(currentMember)

    @PostMapping("/{membershipId}/activate")
    fun activate(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberApprovals.activateViewer(currentMember, membershipId)

    @PostMapping("/{membershipId}/approve")
    fun approve(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberApprovals.activateViewer(currentMember, membershipId)

    @PostMapping("/{membershipId}/deactivate-viewer")
    fun deactivateViewer(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberApprovals.deactivateViewer(currentMember, membershipId)

    @PostMapping("/{membershipId}/reject")
    fun reject(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberApprovals.deactivateViewer(currentMember, membershipId)

    @PostMapping("/{membershipId}/suspend")
    fun suspend(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
        @RequestBody request: MemberLifecycleRequest,
    ) = memberLifecycle.suspend(currentMember, membershipId, request)

    @PostMapping("/{membershipId}/restore")
    fun restore(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberLifecycle.restore(currentMember, membershipId)

    @PostMapping("/{membershipId}/deactivate")
    fun deactivate(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
        @RequestBody request: MemberLifecycleRequest,
    ) = memberLifecycle.deactivate(currentMember, membershipId, request)

    @PostMapping("/{membershipId}/current-session/add")
    fun addToCurrentSession(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberLifecycle.addToCurrentSession(currentMember, membershipId)

    @PostMapping("/{membershipId}/current-session/remove")
    fun removeFromCurrentSession(
        currentMember: CurrentMember,
        @PathVariable membershipId: UUID,
    ) = memberLifecycle.removeFromCurrentSession(currentMember, membershipId)
}
