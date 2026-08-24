@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.takedown.application.port.`in`

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.shared.security.PlatformActor

interface PreviewPublicTakedownUseCase {
    fun preview(
        actor: PlatformActor,
        actorRoleSnapshot: String,
        command: PreviewPublicTakedownCommand,
    ): PublicTakedownPreview
}

interface ConfirmPublicTakedownUseCase {
    fun confirm(
        actor: PlatformActor,
        actorRoleSnapshot: String,
        command: ConfirmPublicTakedownCommand,
    ): PublicTakedownReceipt
}
