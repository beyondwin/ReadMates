package com.readmates.auth.application.service

import com.readmates.auth.application.model.AuthoritySynthesisRequest
import com.readmates.auth.application.model.AuthoritySynthesisResult
import com.readmates.auth.application.port.`in`.SynthesizeAuthoritiesUseCase
import com.readmates.auth.domain.MembershipStatus
import org.springframework.stereotype.Service

/**
 * Default implementation of [SynthesizeAuthoritiesUseCase].
 *
 * Branching rules:
 * - When [AuthoritySynthesisRequest.member] is non-null, synthesise role from membership.
 *   VIEWER membership status always → ROLE_VIEWER regardless of role.
 * - When [AuthoritySynthesisRequest.member] is null and the principal holds ROLE_PLATFORM_ADMIN and
 *   a known club context (clubId != null) is supplied and an [AuthoritySynthesisRequest.supportSynthesis] grant
 *   was pre-fetched by the filter → add ROLE_HOST and attach the synthesis.
 * - Otherwise → return the incoming authorities with MEMBER_ROLE_AUTHORITIES stripped.
 *
 * This service is framework-neutral: no Spring Security, Spring Web, or adapter imports.
 * The infrastructure layer (MemberAuthoritiesFilter) maps strings → SimpleGrantedAuthority.
 */
@Service
class DefaultAuthoritySynthesisService : SynthesizeAuthoritiesUseCase {
    override fun synthesize(request: AuthoritySynthesisRequest): AuthoritySynthesisResult {
        val baseAuthorities =
            request.incomingAuthorities
                .filterNot { it in MEMBER_ROLE_AUTHORITIES }
                .toMutableSet()

        if (request.member != null) {
            val roleAuthority =
                if (request.member.membershipStatus == MembershipStatus.VIEWER) {
                    ROLE_VIEWER
                } else {
                    "$ROLE_PREFIX${request.member.role}"
                }
            baseAuthorities += roleAuthority
            return AuthoritySynthesisResult(baseAuthorities, null)
        }

        // Platform admin with a known club context + synthesis grant → synthesise HOST access
        if (PLATFORM_ADMIN_AUTHORITY in request.incomingAuthorities &&
            request.clubContext.supplied &&
            request.clubContext.clubId != null &&
            request.supportSynthesis != null
        ) {
            baseAuthorities += ROLE_HOST
            return AuthoritySynthesisResult(baseAuthorities, request.supportSynthesis)
        }

        return AuthoritySynthesisResult(baseAuthorities, null)
    }

    private companion object {
        const val ROLE_PREFIX = "ROLE_"
        const val ROLE_VIEWER = "ROLE_VIEWER"
        const val ROLE_HOST = "ROLE_HOST"
        const val ROLE_MEMBER = "ROLE_MEMBER"
        const val PLATFORM_ADMIN_AUTHORITY = "ROLE_PLATFORM_ADMIN"
        val MEMBER_ROLE_AUTHORITIES = setOf(ROLE_HOST, ROLE_MEMBER, ROLE_VIEWER)
    }
}
