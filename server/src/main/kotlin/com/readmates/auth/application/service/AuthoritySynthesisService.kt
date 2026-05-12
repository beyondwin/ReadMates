package com.readmates.auth.application.service

import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.CurrentMember
import java.util.UUID

/**
 * Framework-neutral input data class representing the club context extracted from the HTTP layer.
 *
 * This type lives in the application layer and must NOT import any Spring Security, Spring Web,
 * or adapter types. The filter (infrastructure layer) extracts these fields from
 * [com.readmates.club.adapter.in.web.RequestedClubContext] and passes them here.
 */
data class ClubContextInput(
    val supplied: Boolean,
    val clubId: UUID?,
    val clubSlug: String?,
    val clubName: String?,
)

/**
 * Request object passed to [AuthoritySynthesisService.synthesize].
 *
 * All authority names are plain strings — no Spring Security types.
 */
data class AuthoritySynthesisRequest(
    /** Incoming authority names from the current authentication (plain strings, e.g. "ROLE_USER"). */
    val incomingAuthorities: Set<String>,
    val email: String,
    val userId: UUID?,
    val clubContext: ClubContextInput,
    /**
     * Resolved member for the current email + club context, or null if:
     *  - No club context was supplied
     *  - Slug was supplied but the club is unknown (context=null)
     *  - No membership found for the email in the club
     */
    val member: CurrentMember?,
    /**
     * Pre-fetched support synthesis grant for a platform admin, or null.
     * The filter is responsible for looking this up and passing it in when appropriate.
     */
    val supportSynthesis: SupportMemberSynthesis?,
)

/**
 * Result of authority synthesis.
 *
 * All authority names are plain strings — no Spring Security types.
 * The infrastructure layer maps these to [org.springframework.security.core.authority.SimpleGrantedAuthority].
 */
data class AuthoritySynthesisResult(
    /** Synthesized authority names for the current request. */
    val authorities: Set<String>,
    /**
     * Support synthesis grant to attach to the request attribute, or null.
     * Only set when a platform admin was granted HOST access via a support grant.
     */
    val supportSynthesisToAttach: SupportMemberSynthesis?,
)

/**
 * Port for synthesizing the effective authorities for the current request.
 *
 * Implementations live in the application layer and must be framework-neutral:
 * no Spring Security, Spring Web, or adapter types.
 */
interface AuthoritySynthesisService {
    fun synthesize(request: AuthoritySynthesisRequest): AuthoritySynthesisResult
}
