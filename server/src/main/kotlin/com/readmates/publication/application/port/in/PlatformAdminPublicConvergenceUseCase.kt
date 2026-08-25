@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.application.port.`in`

import com.readmates.publication.application.model.PlatformAdminPublicConvergenceView
import com.readmates.shared.security.PlatformActor
import java.util.UUID

interface PlatformAdminPublicConvergenceUseCase {
    fun view(
        actor: PlatformActor,
        receiptId: UUID,
    ): PlatformAdminPublicConvergenceView?

    fun retry(
        actor: PlatformActor,
        receiptId: UUID,
    ): PlatformAdminPublicConvergenceView?
}
