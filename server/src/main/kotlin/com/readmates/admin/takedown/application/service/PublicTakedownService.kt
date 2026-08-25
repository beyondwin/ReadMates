package com.readmates.admin.takedown.application.service

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PreparedPublicTakedownConfirm
import com.readmates.admin.takedown.application.model.PublicTakedownActor
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import com.readmates.admin.takedown.application.model.StoredPublicTakedownPreview
import com.readmates.admin.takedown.application.port.`in`.ConfirmPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat
import java.util.UUID

@Service
class PublicTakedownService(
    private val port: PublicTakedownPort,
    private val mutationProperties: MutationIdempotencyProperties,
    private val clock: Clock,
    @param:Value("\${readmates.public-takedown.enabled:false}") private val enabled: Boolean,
    @param:Value("\${readmates.public-takedown.r2a-cache-safety-evidence-verified:false}")
    private val cacheSafetyEvidenceVerified: Boolean,
    @param:Value("\${readmates.public-takedown.elapsed-browser-cache-window-seconds:0}")
    private val elapsedBrowserCacheWindowSeconds: Long,
) : PreviewPublicTakedownUseCase,
    ConfirmPublicTakedownUseCase {
    override fun preview(
        actor: PublicTakedownActor,
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ): PublicTakedownPreview {
        requireActivation()
        requireCapability(actor)
        val target =
            port.loadTarget(clubId, sessionId, publicationId)
                ?: throw PublicTakedownException(PublicTakedownError.TARGET_NOT_FOUND)
        if (target.targetGeneration <= 0 || target.currentSurfaces.isEmpty()) {
            throw PublicTakedownException(PublicTakedownError.TARGET_NOT_PUBLIC)
        }
        val now = clock.instant().truncatedTo(ChronoUnit.MICROS)
        val expiresAt = now.plus(PREVIEW_TTL)
        val digestKeyVersion = mutationProperties.currentKeyVersion
        val keyBytes = digestKeyBytes(digestKeyVersion)
        return port.savePreview(
            actor,
            target,
            digestKeyVersion,
            bindingHmac(actor, target, expiresAt, keyBytes),
            now,
            expiresAt,
        )
    }

    override fun confirm(
        actor: PublicTakedownActor,
        command: ConfirmPublicTakedownCommand,
    ): PublicTakedownReceipt {
        requireActivation()
        requireCapability(actor)
        val category = command.reasonCategory.trim().uppercase()
        val reason = command.reason.trim()
        val key = command.idempotencyKey.trim()
        if (category !in ALLOWED_REASON_CATEGORIES || reason.isEmpty() || reason.codePointLength() > MAX_REASON_CODE_POINTS ||
            key.isEmpty() || key.length > MAX_IDEMPOTENCY_KEY_LENGTH
        ) {
            throw PublicTakedownException(PublicTakedownError.INVALID_REQUEST)
        }
        val preview =
            port.loadPreview(command.previewId)
                ?: throw PublicTakedownException(PublicTakedownError.PREVIEW_NOT_FOUND)
        if (preview.actorAdminId != actor.authority.adminId || preview.roleSnapshot != actor.roleSnapshot) {
            throw PublicTakedownException(PublicTakedownError.PREVIEW_TARGET_MISMATCH)
        }
        val target = preview.toTarget()
        val keyBytes = digestKeyBytes(preview.bindingDigestKeyVersion)
        val expectedBinding = bindingHmac(actor, target, preview.expiresAt, keyBytes)
        if (!RequestIdentityHmac.equal(preview.bindingHmac, expectedBinding)) {
            throw PublicTakedownException(PublicTakedownError.PREVIEW_TARGET_MISMATCH)
        }
        val reasonHmac = RequestIdentityHmac.hmac(keyBytes, canonical("reason.v1", reason))
        val idempotencyKeyHmac = RequestIdentityHmac.hmac(keyBytes, canonical("key.v1", key))
        val requestHmac =
            RequestIdentityHmac.hmac(
                keyBytes,
                canonical(
                    "admin.public-takedown.v1",
                    preview.previewId.toString(),
                    preview.clubId.toString(),
                    preview.sessionId.toString(),
                    preview.publicationId.toString(),
                    preview.targetGeneration.toString(),
                    category,
                    HexFormat.of().formatHex(reasonHmac),
                ),
            )
        return port.confirm(
            actor = actor,
            prepared =
                PreparedPublicTakedownConfirm(
                    preview = preview,
                    idempotencyKeyHmac = idempotencyKeyHmac,
                    requestHmac = requestHmac,
                    canonicalSchemaVersion = CANONICAL_SCHEMA_VERSION,
                    digestKeyVersion = preview.bindingDigestKeyVersion,
                    reasonCategory = category,
                ),
            now = clock.instant(),
        )
    }

    private fun requireActivation() {
        if (!enabled || !cacheSafetyEvidenceVerified || elapsedBrowserCacheWindowSeconds < REQUIRED_CACHE_WINDOW_SECONDS) {
            throw PublicTakedownException(PublicTakedownError.ACTIVATION_NOT_VERIFIED)
        }
    }

    private fun requireCapability(actor: PublicTakedownActor) {
        if (!actor.authority.can(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN)) {
            throw PublicTakedownException(PublicTakedownError.PERMISSION_DENIED)
        }
    }

    private fun bindingHmac(
        actor: PublicTakedownActor,
        target: PublicTakedownTarget,
        expiresAt: Instant,
        keyBytes: ByteArray,
    ): ByteArray =
        RequestIdentityHmac.hmac(
            keyBytes,
            canonical(
                "admin.public-takedown.preview.v1",
                actor.authority.adminId.toString(),
                actor.roleSnapshot,
                target.clubId.toString(),
                target.sessionId.toString(),
                target.publicationId.toString(),
                target.targetGeneration.toString(),
                expiresAt.toString(),
            ),
        )

    private fun digestKeyBytes(version: Int): ByteArray =
        mutationProperties.keyBytes(version)
            ?: throw PublicTakedownException(PublicTakedownError.DIGEST_KEY_UNAVAILABLE)

    private fun StoredPublicTakedownPreview.toTarget() =
        PublicTakedownTarget(clubId, sessionId, publicationId, targetGeneration, CURRENT_SURFACES)

    private fun canonical(vararg values: String): ByteArray =
        values
            .joinToString("\u0000") { value -> Normalizer.normalize(value, Normalizer.Form.NFC) }
            .toByteArray(StandardCharsets.UTF_8)

    private fun String.codePointLength(): Int = codePointCount(0, length)

    private companion object {
        const val CANONICAL_SCHEMA_VERSION = 1
        const val REQUIRED_CACHE_WINDOW_SECONDS = 720L
        const val MAX_REASON_CODE_POINTS = 500
        const val MAX_IDEMPOTENCY_KEY_LENGTH = 255
        val PREVIEW_TTL: Duration = Duration.ofMinutes(5)
        val CURRENT_SURFACES = setOf("ORIGIN", "BFF", "CDN", "BROWSER")
        val ALLOWED_REASON_CATEGORIES = setOf("PRIVACY", "SECURITY", "LEGAL", "CONTENT_POLICY")
    }
}
