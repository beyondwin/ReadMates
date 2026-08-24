package com.readmates.shared.adminmutation.application.model

import com.readmates.shared.security.RequestIdentityHmac
import java.util.UUID

const val ADMIN_COMMAND_IDENTITY_PURPOSE = "readmates:admin-command-identity:v1"

const val ADMIN_COMMAND_SYNTHETIC_TARGET_NEW_CLUB = "new-club"

data class PlatformAdminCommandIdentity(
    val platformAdminUserId: UUID,
    val commandType: String,
    val targetType: String,
    val targetId: String,
    val idempotencyKey: String,
) {
    override fun toString(): String =
        "PlatformAdminCommandIdentity(platformAdminUserId=$platformAdminUserId, " +
            "commandType=$commandType, targetType=$targetType, targetId=$targetId)"
}

data class AdminCommandDigest(
    val schemaVersion: String,
    val digestKeyVersion: Int,
    val idempotencyKeyHmac: ByteArray,
    val requestHmac: ByteArray,
) {
    init {
        require(schemaVersion.isNotBlank()) { "schemaVersion must not be blank" }
        require(digestKeyVersion >= 0) { "digestKeyVersion must be non-negative" }
        require(idempotencyKeyHmac.size == HMAC_SIZE) { "idempotencyKeyHmac must be 32 bytes" }
        require(requestHmac.size == HMAC_SIZE) { "requestHmac must be 32 bytes" }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is AdminCommandDigest) return false
        return schemaVersion == other.schemaVersion &&
            digestKeyVersion == other.digestKeyVersion &&
            RequestIdentityHmac.equal(idempotencyKeyHmac, other.idempotencyKeyHmac) &&
            RequestIdentityHmac.equal(requestHmac, other.requestHmac)
    }

    override fun hashCode(): Int =
        schemaVersion.hashCode() * 31 +
            digestKeyVersion * 31 +
            idempotencyKeyHmac.contentHashCode() * 31 +
            requestHmac.contentHashCode()

    override fun toString(): String =
        "AdminCommandDigest(schemaVersion=$schemaVersion, digestKeyVersion=$digestKeyVersion, " +
            "idempotencyKeyHmacSize=${idempotencyKeyHmac.size}, requestHmacSize=${requestHmac.size})"

    private companion object {
        const val HMAC_SIZE = 32
    }
}

data class AdminCommandDigestSet(
    val current: AdminCommandDigest,
    val lookupCandidates: List<AdminCommandDigest>,
    val aliasCandidates: List<AdminCommandDigest>,
    val writePreviousAlias: Boolean,
) {
    init {
        requireSortedUnique(lookupCandidates, "lookupCandidates")
        requireSortedUnique(aliasCandidates, "aliasCandidates")
        require(lookupCandidates.any { candidate -> candidate == current }) {
            "current must be a lookup candidate"
        }
        require(aliasCandidates.any { candidate -> candidate == current }) {
            "current must be an alias candidate"
        }
        val lookupByVersion = lookupCandidates.associateBy(AdminCommandDigest::digestKeyVersion)
        require(
            aliasCandidates.all { alias ->
                lookupByVersion[alias.digestKeyVersion] == alias
            },
        ) { "aliasCandidates must be an ordered subset of lookupCandidates" }
        val expectedAliases = if (writePreviousAlias) lookupCandidates else listOf(current)
        require(aliasCandidates == expectedAliases) {
            "aliasCandidates must follow writePreviousAlias"
        }
    }

    private fun requireSortedUnique(
        candidates: List<AdminCommandDigest>,
        name: String,
    ) {
        val versions = candidates.map(AdminCommandDigest::digestKeyVersion)
        require(versions == versions.sorted()) { "$name must be sorted by digestKeyVersion" }
        require(versions.distinct().size == versions.size) { "$name must not contain duplicate versions" }
    }
}

data class AdminCommandIdentityEnvelope(
    val scope: AdminCommandScope,
    val digests: AdminCommandDigestSet,
)

interface CanonicalAdminCommandRequest {
    val schemaVersion: String

    fun canonicalFields(): List<Pair<String, String>>
}

class DigestKeyUnavailableException : RuntimeException("DIGEST_KEY_UNAVAILABLE")

class InvalidAdminCommandIdentityException : RuntimeException("INVALID_ADMIN_COMMAND_IDENTITY")
