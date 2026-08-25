package com.readmates.admin.takedown.application.port.out

import com.readmates.admin.takedown.application.model.PreparedPublicTakedownConfirm
import com.readmates.admin.takedown.application.model.PublicTakedownActor
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import com.readmates.admin.takedown.application.model.StoredPublicTakedownPreview
import java.time.Instant
import java.util.UUID

interface PublicTakedownPort {
    fun loadTarget(
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ): PublicTakedownTarget?

    fun savePreview(
        actor: PublicTakedownActor,
        target: PublicTakedownTarget,
        bindingDigestKeyVersion: Int,
        bindingHmac: ByteArray,
        now: Instant,
        expiresAt: Instant,
    ): PublicTakedownPreview

    fun loadPreview(previewId: UUID): StoredPublicTakedownPreview?

    fun confirm(
        actor: PublicTakedownActor,
        prepared: PreparedPublicTakedownConfirm,
        now: Instant,
    ): PublicTakedownReceipt
}
