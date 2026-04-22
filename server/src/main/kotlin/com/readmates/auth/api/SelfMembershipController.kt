package com.readmates.auth.api

import com.readmates.auth.application.AuthenticatedMemberResolver
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.MemberLifecycleResponse
import com.readmates.auth.application.MemberLifecycleService
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class SelfMembershipController(
    private val memberLifecycleService: MemberLifecycleService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @PostMapping("/api/me/membership/leave")
    fun leave(
        authentication: Authentication?,
        @RequestBody request: MemberLifecycleRequest,
    ): MemberLifecycleResponse {
        val member = authenticatedMemberResolver.resolve(authentication)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required")
        return memberLifecycleService.leave(member, request)
    }
}
