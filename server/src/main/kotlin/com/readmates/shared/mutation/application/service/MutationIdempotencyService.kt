package com.readmates.shared.mutation.application.service

import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.CanonicalRequestDigest
import com.readmates.shared.mutation.application.model.DigestKeyRetirementRejectedException
import com.readmates.shared.mutation.application.model.DigestKeyUnavailableException
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.mutation.application.model.IdempotencyKeyReusedException
import com.readmates.shared.mutation.application.model.InvalidMutationIdempotencyKeyException
import com.readmates.shared.mutation.application.model.MutationClaimResult
import com.readmates.shared.mutation.application.model.MutationIdempotencyStatus
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.model.UnknownMutationOperationException
import com.readmates.shared.mutation.application.model.UnsupportedCanonicalSchemaException
import com.readmates.shared.mutation.application.port.`in`.PurgeExpiredMutationIdempotencyUseCase
import com.readmates.shared.mutation.application.port.out.MutationIdempotencyPort
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

@Service
class MutationIdempotencyService(
    private val port: MutationIdempotencyPort,
    private val properties: MutationIdempotencyProperties,
    private val clock: Clock,
    private val metrics: MutationIdempotencyMetrics,
) : PurgeExpiredMutationIdempotencyUseCase {
    fun digest(payload: CanonicalMutationPayload): CanonicalRequestDigest {
        requireSupported(payload)
        val key =
            properties.currentKeyBytes().takeIf { it.isNotEmpty() }
                ?: throw DigestKeyUnavailableException()
        return CanonicalRequestDigest(
            canonicalSchemaVersion = payload.schemaVersion,
            digestKeyVersion = properties.currentKeyVersion,
            hmac = RequestIdentityHmac.hmac(key, MutationCanonicalizer.bytes(payload)),
        )
    }

    @Transactional
    fun claim(
        identity: MutationIdentity,
        payload: CanonicalMutationPayload,
    ): MutationClaimResult {
        validateIdentity(identity, payload)
        val digest = digest(payload)
        val now = clock.instant()
        val claimRow =
            MutationIdempotencyPort.ClaimRow(
                identity = identity,
                digest = digest,
                createdAt = now,
                expiresAt = now.plus(properties.retention),
            )
        return when (val outcome = port.claim(claimRow)) {
            MutationIdempotencyPort.ClaimOutcome.Claimed -> {
                metrics.claimOutcome("claimed")
                MutationClaimResult.Claimed(identity, digest)
            }
            is MutationIdempotencyPort.ClaimOutcome.Existing -> replayOrConflict(identity, payload, outcome.row)
        }
    }

    @Transactional
    fun complete(
        identity: MutationIdentity,
        receiptId: UUID,
    ) {
        port.complete(identity, receiptId, clock.instant())
    }

    @Transactional(readOnly = true)
    fun lookup(identity: MutationIdentity): MutationIdempotencyPort.StoredRow? = port.find(identity)

    @Transactional
    override fun purgeExpired(limit: Int): Int {
        val now = clock.instant()
        val purged = port.purgeExpired(now, limit.coerceAtLeast(0).coerceAtMost(properties.boundedPurgeBatchSize()))
        properties.currentKeyVersion.let { version -> port.markUnreferencedIfEmpty(version, now) }
        if (properties.previousKey.isNotBlank()) {
            port.markUnreferencedIfEmpty(properties.previousKeyVersion, now)
        }
        if (purged > 0) {
            metrics.purged(purged)
        }
        return purged
    }

    @Transactional
    fun retirePreviousKey() {
        if (properties.previousKey.isBlank()) {
            metrics.retirement(true)
            return
        }
        val now = clock.instant()
        val remaining = port.countByDigestKeyVersion(properties.previousKeyVersion)
        val unreferencedSince = port.unreferencedSince(properties.previousKeyVersion)
        if (remaining > 0 || unreferencedSince == null || now < unreferencedSince.plus(properties.previousKeyRolloutBuffer)) {
            metrics.retirement(false)
            throw DigestKeyRetirementRejectedException()
        }
        metrics.retirement(true)
    }

    private fun replayOrConflict(
        identity: MutationIdentity,
        payload: CanonicalMutationPayload,
        stored: MutationIdempotencyPort.StoredRow,
    ): MutationClaimResult {
        val key =
            properties.keyBytes(stored.digest.digestKeyVersion)
                ?: throw DigestKeyUnavailableException()
        val expected = RequestIdentityHmac.hmac(key, MutationCanonicalizer.bytes(payload))
        if (!RequestIdentityHmac.equal(expected, stored.digest.hmac)) {
            metrics.claimOutcome("conflict")
            throw IdempotencyKeyReusedException()
        }
        return when (stored.status) {
            MutationIdempotencyStatus.COMPLETED -> {
                val receiptId = stored.receiptId ?: throw DigestKeyUnavailableException()
                metrics.claimOutcome("replayed")
                MutationClaimResult.Replayed(identity, receiptId)
            }
            MutationIdempotencyStatus.IN_PROGRESS -> {
                metrics.claimOutcome("pending")
                MutationClaimResult.InProgress(identity)
            }
        }
    }

    private fun validateIdentity(
        identity: MutationIdentity,
        payload: CanonicalMutationPayload,
    ) {
        if (!IDEMPOTENCY_KEY.matches(identity.idempotencyKey)) {
            throw InvalidMutationIdempotencyKeyException()
        }
        if (!RESOURCE_SLOT.matches(identity.resourceSlot)) {
            throw InvalidMutationIdempotencyKeyException()
        }
        val operation =
            runCatching { HostMutationOperation.valueOf(identity.operation) }
                .getOrElse { throw UnknownMutationOperationException() }
        if (operation != payload.operation) {
            throw UnknownMutationOperationException()
        }
        requireSupported(payload)
    }

    private fun requireSupported(payload: CanonicalMutationPayload) {
        val expected =
            if (payload is CanonicalMutationPayload.Publication) {
                CanonicalMutationPayload.PUBLICATION_SCHEMA_VERSION
            } else {
                CanonicalMutationPayload.CURRENT_SCHEMA_VERSION
            }
        if (payload.schemaVersion != expected) {
            throw UnsupportedCanonicalSchemaException()
        }
    }

    private companion object {
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
        val RESOURCE_SLOT = Regex("^[A-Za-z0-9._-]{1,128}$")
    }
}
