package com.readmates.shared.mutation.application.model

import com.readmates.shared.security.RequestIdentityHmac
import java.util.UUID

data class MutationIdentity(
    val clubId: UUID,
    val actorMembershipId: UUID,
    val operation: String,
    val resourceSlot: String,
    val idempotencyKey: String,
)

data class CanonicalRequestDigest(
    val canonicalSchemaVersion: Int,
    val digestKeyVersion: Int,
    val hmac: ByteArray,
) {
    init {
        require(canonicalSchemaVersion > 0) { "canonicalSchemaVersion must be positive" }
        require(digestKeyVersion >= 0) { "digestKeyVersion must be non-negative" }
        require(hmac.size == HMAC_SIZE) { "hmac must be 32 bytes" }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CanonicalRequestDigest) return false
        return canonicalSchemaVersion == other.canonicalSchemaVersion &&
            digestKeyVersion == other.digestKeyVersion &&
            RequestIdentityHmac.equal(hmac, other.hmac)
    }

    override fun hashCode(): Int = canonicalSchemaVersion * 31 + digestKeyVersion * 31 + hmac.contentHashCode()

    override fun toString(): String =
        "CanonicalRequestDigest(canonicalSchemaVersion=$canonicalSchemaVersion, " +
            "digestKeyVersion=$digestKeyVersion, hmacSize=${hmac.size})"

    private companion object {
        const val HMAC_SIZE = 32
    }
}

enum class MutationIdempotencyStatus {
    IN_PROGRESS,
    COMPLETED,
}

sealed class MutationClaimResult {
    data class Claimed(
        val identity: MutationIdentity,
        val digest: CanonicalRequestDigest,
    ) : MutationClaimResult()

    data class Replayed(
        val identity: MutationIdentity,
        val receiptId: UUID,
    ) : MutationClaimResult()

    data class InProgress(
        val identity: MutationIdentity,
    ) : MutationClaimResult()
}

enum class HostMutationOperation {
    SESSION_CREATE,
    SESSION_BASIC_SAVE,
    SESSION_ATTENDANCE_SINGLE,
    SESSION_ATTENDANCE_BULK,
    SESSION_EXPOSURE,
    SESSION_PUBLICATION,
    SESSION_OPEN,
    SESSION_CLOSE,
    SESSION_REVERSE,
    SESSION_RECORD_APPLY,
    SESSION_CORRECTION_PUBLISH,
    SESSION_TRASH,
    SESSION_RESTORE,
}

sealed class CanonicalMutationPayload {
    abstract val operation: HostMutationOperation
    abstract val schemaVersion: Int

    data class SessionFields(
        override val operation: HostMutationOperation,
        val title: String,
        val bookTitle: String,
        val bookAuthor: String,
        val bookLink: String?,
        val bookImageUrl: String?,
        val date: String,
        val startTime: String,
        val endTime: String,
        val questionDeadlineAt: String?,
        val locationLabel: String?,
        val meetingUrl: String?,
        val meetingPasscode: String?,
        val accessScope: String,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
    ) : CanonicalMutationPayload() {
        init {
            require(
                operation == HostMutationOperation.SESSION_CREATE ||
                    operation == HostMutationOperation.SESSION_BASIC_SAVE,
            ) { "SessionFields requires a session create or basic-save operation" }
            require(schemaVersion > 0) { "schemaVersion must be positive" }
        }

        override fun toString(): String =
            "SessionFields(operation=$operation, title=$title, bookTitle=$bookTitle, bookAuthor=$bookAuthor, " +
                "date=$date, startTime=$startTime, endTime=$endTime, accessScope=$accessScope, " +
                "schemaVersion=$schemaVersion)"

        companion object {
            fun applyDefaults(
                operation: HostMutationOperation,
                title: String,
                bookTitle: String,
                bookAuthor: String,
                date: String,
                bookLink: String? = null,
                bookImageUrl: String? = null,
                startTime: String? = null,
                endTime: String? = null,
                questionDeadlineAt: String? = null,
                locationLabel: String? = null,
                meetingUrl: String? = null,
                meetingPasscode: String? = null,
                accessScope: String? = null,
                schemaVersion: Int = CURRENT_SCHEMA_VERSION,
            ): SessionFields =
                SessionFields(
                    operation = operation,
                    title = title,
                    bookTitle = bookTitle,
                    bookAuthor = bookAuthor,
                    bookLink = bookLink,
                    bookImageUrl = bookImageUrl,
                    date = date,
                    startTime = startTime ?: DEFAULT_START_TIME,
                    endTime = endTime ?: DEFAULT_END_TIME,
                    questionDeadlineAt = questionDeadlineAt,
                    locationLabel = locationLabel,
                    meetingUrl = meetingUrl,
                    meetingPasscode = meetingPasscode,
                    accessScope = accessScope ?: DEFAULT_ACCESS_SCOPE,
                    schemaVersion = schemaVersion,
                )
        }
    }

    data class AttendanceRow(
        val membershipId: UUID,
        val status: String,
        val expectedAttendanceRevision: Long,
    ) {
        init {
            require(expectedAttendanceRevision >= 0) { "expectedAttendanceRevision must be non-negative" }
        }
    }

    data class Attendance(
        override val operation: HostMutationOperation,
        val rows: List<AttendanceRow>,
        val expectedParticipantSetRevision: Long?,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
    ) : CanonicalMutationPayload() {
        init {
            require(
                operation == HostMutationOperation.SESSION_ATTENDANCE_SINGLE ||
                    operation == HostMutationOperation.SESSION_ATTENDANCE_BULK,
            ) { "Attendance requires a single or bulk attendance operation" }
            require(rows.isNotEmpty()) { "attendance rows must not be empty" }
            require(schemaVersion > 0) { "schemaVersion must be positive" }
            if (operation == HostMutationOperation.SESSION_ATTENDANCE_SINGLE) {
                require(rows.size == 1) { "single attendance requires exactly one row" }
            }
            require(expectedParticipantSetRevision == null || expectedParticipantSetRevision >= 0) {
                "expectedParticipantSetRevision must be null or non-negative"
            }
        }
    }

    data class ResourceOnly(
        override val operation: HostMutationOperation,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
    ) : CanonicalMutationPayload() {
        init {
            require(operation in RESOURCE_ONLY_OPERATIONS) { "unsupported resource-only operation" }
            require(schemaVersion > 0) { "schemaVersion must be positive" }
        }
    }

    data class Reverse(
        val reasonCode: String?,
        val reasonNote: String?,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
        override val operation: HostMutationOperation = HostMutationOperation.SESSION_REVERSE,
    ) : CanonicalMutationPayload() {
        init {
            require(schemaVersion > 0) { "schemaVersion must be positive" }
        }

        override fun toString(): String = "Reverse(operation=$operation, reasonCode=$reasonCode, schemaVersion=$schemaVersion)"
    }

    data class Exposure(
        val accessScope: String,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
        override val operation: HostMutationOperation = HostMutationOperation.SESSION_EXPOSURE,
    ) : CanonicalMutationPayload() {
        init {
            require(schemaVersion > 0) { "schemaVersion must be positive" }
        }
    }

    data class Publication(
        val publicSummary: String,
        val siteVisibility: String,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
        override val operation: HostMutationOperation = HostMutationOperation.SESSION_PUBLICATION,
    ) : CanonicalMutationPayload() {
        init {
            require(schemaVersion > 0) { "schemaVersion must be positive" }
        }
    }

    data class RecordApply(
        val entryKeys: List<String>,
        override val schemaVersion: Int = CURRENT_SCHEMA_VERSION,
        override val operation: HostMutationOperation = HostMutationOperation.SESSION_RECORD_APPLY,
    ) : CanonicalMutationPayload() {
        init {
            require(schemaVersion > 0) { "schemaVersion must be positive" }
        }
    }

    companion object {
        const val CURRENT_SCHEMA_VERSION = 1
        const val DEFAULT_START_TIME = "20:00"
        const val DEFAULT_END_TIME = "22:00"
        const val DEFAULT_ACCESS_SCOPE = "HOST_ONLY"
        val RESOURCE_ONLY_OPERATIONS =
            setOf(
                HostMutationOperation.SESSION_OPEN,
                HostMutationOperation.SESSION_CLOSE,
                HostMutationOperation.SESSION_TRASH,
                HostMutationOperation.SESSION_RESTORE,
                HostMutationOperation.SESSION_CORRECTION_PUBLISH,
            )
    }
}

class IdempotencyKeyReusedException : RuntimeException("IDEMPOTENCY_KEY_REUSED")

class InvalidMutationIdempotencyKeyException : RuntimeException("INVALID_IDEMPOTENCY_KEY")

class UnknownMutationOperationException : RuntimeException("UNKNOWN_MUTATION_OPERATION")

class UnsupportedCanonicalSchemaException : RuntimeException("UNSUPPORTED_CANONICAL_SCHEMA")

class DigestKeyUnavailableException : RuntimeException("DIGEST_KEY_UNAVAILABLE")

class DigestKeyRetirementRejectedException : RuntimeException("DIGEST_KEY_RETIREMENT_REJECTED")
