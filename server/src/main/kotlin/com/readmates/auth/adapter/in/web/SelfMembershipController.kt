package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.MemberLifecycleResponse
import com.readmates.auth.application.port.`in`.LeaveMembershipUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class SelfMembershipController(
    private val leaveMembership: LeaveMembershipUseCase,
) {
    @PostMapping("/api/me/membership/leave")
    fun leave(
        currentMember: CurrentMember,
        @RequestBody request: MemberLifecycleRequest,
    ): MemberLifecycleResponse = leaveMembership.leave(currentMember, request)
}
