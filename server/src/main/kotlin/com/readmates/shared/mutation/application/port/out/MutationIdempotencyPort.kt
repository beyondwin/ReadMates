package com.readmates.shared.mutation.application.port.out

import com.readmates.shared.mutation.application.model.CanonicalRequestDigest
import com.readmates.shared.mutation.application.model.MutationIdempotencyStatus
import com.readmates.shared.mutation.application.model.MutationIdentity
import java.time.Instant
import java.util.UUID

interface MutationIdempotencyPort {
    fun claim(row: ClaimRow): ClaimOutcome

    fun complete(
        identity: MutationIdentity,
        receiptId: UUID,
        at: Instant,
    )

    fun find(identity: MutationIdentity): StoredRow?

    fun purgeExpired(
        now: Instant,
        limit: Int,
    ): Int

    fun countByDigestKeyVersion(digestKeyVersion: Int): Long

    fun referencedDigestKeyVersions(): Set<Int>

    fun digestKeyStates(): List<DigestKeyState>

    fun markReferenced(
        digestKeyVersion: Int,
        at: Instant,
    )

    fun markUnreferencedIfEmpty(
        digestKeyVersion: Int,
        at: Instant,
    ): Instant?

    fun unreferencedSince(digestKeyVersion: Int): Instant?

    data class DigestKeyState(
        val digestKeyVersion: Int,
        val lastReferencedAt: Instant,
        val unreferencedSince: Instant?,
    )

    data class ClaimRow(
        val identity: MutationIdentity,
        val digest: CanonicalRequestDigest,
        val createdAt: Instant,
        val expiresAt: Instant,
    )

    data class StoredRow(
        val identity: MutationIdentity,
        val digest: CanonicalRequestDigest,
        val status: MutationIdempotencyStatus,
        val receiptId: UUID?,
        val createdAt: Instant,
        val expiresAt: Instant,
    )

    sealed class ClaimOutcome {
        data object Claimed : ClaimOutcome()

        data class Existing(
            val row: StoredRow,
        ) : ClaimOutcome()
    }
}
