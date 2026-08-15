@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.model.GoogleLoginResult
import com.readmates.shared.security.CurrentMember

interface LoginVerifiedGoogleUserUseCase {
    fun loginVerifiedGoogleUserForSession(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        targetClubSlug: String? = null,
    ): GoogleLoginResult
}

interface AcceptGoogleInvitationUseCase {
    fun acceptGoogleInvitation(
        rawToken: String,
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        expectedClubSlug: String? = null,
    ): CurrentMember
}
