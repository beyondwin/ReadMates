@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.model.AuthoritySynthesisRequest
import com.readmates.auth.application.model.AuthoritySynthesisResult
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.shared.security.CurrentUser

interface ResolveAuthenticatedPrincipalUseCase {
    fun resolveByEmail(
        email: String?,
        clubContext: ResolvedClubContext?,
    ): AuthenticatedMemberSnapshot?

    fun resolveByUserId(
        userId: String,
        clubContext: ResolvedClubContext?,
    ): AuthenticatedMemberSnapshot?

    fun resolveProfileByUserId(userId: String): AuthenticatedMemberSnapshot?

    fun resolveUserById(userId: String): CurrentUser?
}

interface SynthesizeAuthoritiesUseCase {
    fun synthesize(request: AuthoritySynthesisRequest): AuthoritySynthesisResult
}
