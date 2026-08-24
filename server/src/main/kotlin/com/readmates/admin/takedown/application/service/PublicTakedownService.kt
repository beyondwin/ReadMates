package com.readmates.admin.takedown.application.service

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PUBLIC_TAKEDOWN_SCHEMA_VERSION
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownIdempotencyScope
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReasonCategory
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownRequestIdentity
import com.readmates.admin.takedown.application.port.`in`.ConfirmPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.out.PublicTakedownActivationEvidencePort
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.admin.takedown.application.port.out.StorePublicTakedownCommand
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Service
class PublicTakedownService(
    private val port: PublicTakedownPort,
    private val activationEvidence: PublicTakedownActivationEvidencePort,
    private val idempotencyProperties: MutationIdempotencyProperties,
    private val clock: Clock,
) : PreviewPublicTakedownUseCase,
    ConfirmPublicTakedownUseCase {
    override fun preview(
        actor: PlatformActor,
        actorRoleSnapshot: String,
        command: PreviewPublicTakedownCommand,
    ): PublicTakedownPreview {
        authorize(actor)
        val target =
            port.loadTarget(command.clubId, command.sessionId, command.publicationId)
                ?: fail(PublicTakedownError.TARGET_NOT_FOUND)
        if (!target.originReadable) fail(PublicTakedownError.TARGET_NOT_PUBLIC)
        val now = clock.instant()
        val preview =
            PublicTakedownPreview(
                previewId = UUID.randomUUID(),
                actorAdminId = actor.adminId,
                actorRoleSnapshot = actorRoleSnapshot,
                expiresAt = now.plus(PREVIEW_TTL),
                clubId = target.clubId,
                sessionId = target.sessionId,
                publicationId = target.publicationId,
                targetGeneration = target.generation,
                currentSurfaces = target.currentSurfaces,
                confirmEnabled = activationEvidence.confirmEnabled(),
            )
        port.savePreview(preview)
        return preview
    }

    @Transactional
    override fun confirm(
        actor: PlatformActor,
        actorRoleSnapshot: String,
        command: ConfirmPublicTakedownCommand,
    ): PublicTakedownReceipt {
        authorize(actor)
        val category = command.reasonCategory
        val reason = validateReason(command.reason)
        validateKey(command.idempotencyKey)
        val preview = port.loadPreview(command.previewId) ?: fail(PublicTakedownError.PREVIEW_NOT_FOUND)
        if (preview.actorAdminId != actor.adminId || preview.actorRoleSnapshot != actorRoleSnapshot) {
            fail(PublicTakedownError.PREVIEW_ACTOR_MISMATCH)
        }
        val scope =
            PublicTakedownIdempotencyScope(
                actorAdminId = actor.adminId,
                clubId = preview.clubId,
                publicationId = preview.publicationId,
                idempotencyKey = command.idempotencyKey,
            )
        val identity = requestIdentity(preview, category, reason)
        when (val replay = port.loadReplay(scope, identity)) {
            is PublicTakedownPort.ReplayResult.Replayed -> return replay.receipt
            PublicTakedownPort.ReplayResult.Conflict -> fail(PublicTakedownError.IDEMPOTENCY_KEY_REUSED)
            PublicTakedownPort.ReplayResult.Missing -> Unit
        }
        if (!activationEvidence.confirmEnabled()) fail(PublicTakedownError.TAKEDOWN_CONFIRM_DISABLED)
        val now = clock.instant()
        if (!preview.expiresAt.isAfter(now)) fail(PublicTakedownError.PREVIEW_EXPIRED)
        val current =
            port.loadTarget(preview.clubId, preview.sessionId, preview.publicationId)
                ?: fail(PublicTakedownError.TARGET_MISMATCH)
        if (current.generation != preview.targetGeneration) fail(PublicTakedownError.GENERATION_MISMATCH)
        if (current.currentSurfaces != preview.currentSurfaces) fail(PublicTakedownError.SURFACES_MISMATCH)
        if (!current.originReadable) fail(PublicTakedownError.TARGET_NOT_PUBLIC)
        return port.confirmNew(
            StorePublicTakedownCommand(
                preview = preview,
                scope = scope,
                identity = identity,
                reasonCategory = category,
                now = now,
                idempotencyExpiresAt = now.plus(idempotencyProperties.retention),
            ),
        )
    }

    private fun authorize(actor: PlatformActor) {
        if (!actor.can(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN)) {
            fail(PublicTakedownError.PERMISSION_DENIED)
        }
    }

    private fun requestIdentity(
        preview: PublicTakedownPreview,
        category: PublicTakedownReasonCategory,
        reason: String,
    ): PublicTakedownRequestIdentity {
        val normalizedReason = Normalizer.normalize(reason, Normalizer.Form.NFC)
        val keyVersions =
            buildMap {
                idempotencyProperties.currentKeyBytes().takeIf(ByteArray::isNotEmpty)?.let { key ->
                    put(idempotencyProperties.currentKeyVersion, key)
                }
                idempotencyProperties.previousKey
                    .takeIf(String::isNotBlank)
                    ?.toByteArray(StandardCharsets.UTF_8)
                    ?.let { key -> put(idempotencyProperties.previousKeyVersion, key) }
            }
        val currentKey =
            keyVersions[idempotencyProperties.currentKeyVersion]
                ?: fail(PublicTakedownError.TAKEDOWN_CONFIRM_DISABLED)
        val replayHmacs =
            keyVersions.mapValues { (_, key) -> canonicalRequestHmac(preview, category, normalizedReason, key) }
        return PublicTakedownRequestIdentity(
            requestHmac = replayHmacs.getValue(idempotencyProperties.currentKeyVersion),
            canonicalSchemaVersion = PUBLIC_TAKEDOWN_SCHEMA_VERSION,
            digestKeyVersion = idempotencyProperties.currentKeyVersion,
            replayHmacs = replayHmacs,
        )
    }

    private fun canonicalRequestHmac(
        preview: PublicTakedownPreview,
        category: PublicTakedownReasonCategory,
        normalizedReason: String,
        key: ByteArray,
    ): ByteArray {
        val reasonHmac =
            RequestIdentityHmac.hmac(
                key,
                "admin-public-takedown-reason:v1\u0000$normalizedReason".toByteArray(StandardCharsets.UTF_8),
            )
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { output ->
            output.writeUTF("admin-public-takedown:v1")
            output.writeUTF(preview.previewId.toString())
            output.writeUTF(preview.actorAdminId.toString())
            output.writeUTF(preview.actorRoleSnapshot)
            output.writeUTF(preview.clubId.toString())
            output.writeUTF(preview.sessionId.toString())
            output.writeUTF(preview.publicationId.toString())
            output.writeLong(preview.targetGeneration)
            preview.currentSurfaces.sorted().forEach(output::writeUTF)
            output.writeUTF(category.name)
            output.writeInt(reasonHmac.size)
            output.write(reasonHmac)
        }
        return RequestIdentityHmac.hmac(key, bytes.toByteArray())
    }

    private fun validateReason(value: String): String =
        value.trim().takeIf { it.isNotEmpty() && it.length <= MAX_REASON_LENGTH }
            ?: fail(PublicTakedownError.INVALID_REASON)

    private fun validateKey(value: String) {
        if (!IDEMPOTENCY_KEY.matches(value)) fail(PublicTakedownError.INVALID_IDEMPOTENCY_KEY)
    }

    private fun fail(error: PublicTakedownError): Nothing = throw PublicTakedownException(error)

    private companion object {
        val PREVIEW_TTL: Duration = Duration.ofMinutes(10)
        const val MAX_REASON_LENGTH = 500
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
    }
}
