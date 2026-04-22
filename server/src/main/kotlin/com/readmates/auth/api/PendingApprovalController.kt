package com.readmates.auth.api

import com.readmates.auth.application.AuthenticatedMemberResolver
import com.readmates.auth.application.PendingApprovalAppResponse
import com.readmates.auth.application.PendingApprovalReadService
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/app/pending")
class PendingApprovalController(
    private val service: PendingApprovalReadService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @GetMapping
    fun get(authentication: Authentication?): PendingApprovalAppResponse {
        val member = authenticatedMemberResolver.resolve(authentication)
            ?.takeIf { it.isPendingApproval }
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "Pending approval required")
        return service.get(member)
    }
}
