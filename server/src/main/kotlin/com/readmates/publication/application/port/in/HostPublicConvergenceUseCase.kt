@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.application.port.`in`

import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface HostPublicConvergenceUseCase {
    fun view(
        host: CurrentMember,
        sessionId: UUID,
    ): PublicConvergenceView?

    fun retry(
        host: CurrentMember,
        sessionId: UUID,
        convergenceId: UUID,
    ): PublicConvergenceView?
}
