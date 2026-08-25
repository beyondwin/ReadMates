@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.takedown.application.port.`in`

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownActor
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import java.util.UUID

interface PreviewPublicTakedownUseCase {
    fun preview(
        actor: PublicTakedownActor,
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ): PublicTakedownPreview
}

interface ConfirmPublicTakedownUseCase {
    fun confirm(
        actor: PublicTakedownActor,
        command: ConfirmPublicTakedownCommand,
    ): PublicTakedownReceipt
}
