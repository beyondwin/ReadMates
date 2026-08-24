package com.readmates.shared.adminmutation.adapter.out.persistence

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestSet
import com.readmates.shared.adminmutation.application.model.AdminCommandScope
import com.readmates.shared.adminmutation.application.model.CorruptAdminCommandClaimException
import com.readmates.shared.adminmutation.application.model.RequiredAdminCommandTransactionException
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.sql.Connection
import java.sql.ResultSet
import java.sql.Savepoint
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAdminCommandIdempotencyAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminCommandIdempotencyPort {
    override fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult {
        requireExistingTransaction()
        val aliases = findAliases(scope, digests.lookupCandidates, lock = false)
        if (aliases.isNotEmpty()) {
            return reconcileExisting(scope, attempt, digests, aliases)
        }
        return reserveAbsent(scope, attempt, digests)
    }

    override fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
        completedAt: Instant,
        retention: Duration,
    ): Boolean {
        requireExistingTransaction()
        require(retention >= MINIMUM_RETENTION) { "retention must be at least 24h" }
        require(RECEIPT_TYPE.matches(receiptType)) { "invalid receiptType" }
        require(RECEIPT_ID.matches(receiptId)) { "invalid receiptId" }
        return jdbcTemplate.update(
            """
            update platform_admin_command_idempotency
            set state = 'COMPLETED',
                receipt_type = ?,
                receipt_id = ?,
                updated_at = ?,
                expires_at = ?
            where id = ?
              and claim_token = ?
              and state = 'IN_PROGRESS'
              and receipt_type is null
              and receipt_id is null
            """.trimIndent(),
            receiptType,
            receiptId,
            completedAt.toDbTime(),
            completedAt.plus(retention).toDbTime(),
            claimId.dbString(),
            claimToken.dbString(),
        ) == 1
    }

    private fun reserveAbsent(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult =
        try {
            withSavepoint {
                insertClaim(scope, attempt)
                reserveAliases(scope, attempt.claimId, digests.aliasCandidates, attempt.claimedAt)
                AdminCommandClaimResult.Claimed(
                    claimId = attempt.claimId,
                    claimToken = attempt.claimToken,
                    currentDigest = digests.current,
                )
            }
        } catch (_: AliasReservationLostException) {
            val aliases = findAliases(scope, digests.lookupCandidates, lock = true)
            if (aliases.isEmpty()) {
                throw CorruptAdminCommandClaimException()
            }
            reconcileExisting(scope, attempt, digests, aliases)
        }

    private fun reconcileExisting(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
        observedAliases: List<AdminCommandAliasRow>,
    ): AdminCommandClaimResult {
        val observedOwner = singleOwner(observedAliases)
        findClaimForUpdate(scope, observedOwner) ?: throw CorruptAdminCommandClaimException()
        val lockedAliases = findAliases(scope, digests.lookupCandidates, lock = true)
        val lockedOwner = singleOwner(lockedAliases)
        if (lockedOwner != observedOwner) {
            throw CorruptAdminCommandClaimException()
        }
        val claim = findClaimForUpdate(scope, lockedOwner) ?: throw CorruptAdminCommandClaimException()
        if (claim.canonicalSchemaVersion != digests.current.schemaVersion) {
            return AdminCommandClaimResult.Conflict
        }
        if (!requestsMatch(lockedAliases, digests.lookupCandidates)) {
            return AdminCommandClaimResult.Conflict
        }
        val foundVersions = lockedAliases.map(AdminCommandAliasRow::digestKeyVersion).toSet()
        val missingAliases =
            digests.aliasCandidates.filter { digest -> digest.digestKeyVersion !in foundVersions }
        if (missingAliases.isNotEmpty()) {
            try {
                withSavepoint {
                    reserveAliases(scope, claim.id, missingAliases, attempt.claimedAt)
                }
            } catch (_: AliasReservationLostException) {
                val currentAliases = findAliases(scope, digests.lookupCandidates, lock = true)
                if (currentAliases.isEmpty()) {
                    throw CorruptAdminCommandClaimException()
                }
                val currentVersions = currentAliases.map(AdminCommandAliasRow::digestKeyVersion).toSet()
                if (missingAliases.any { digest -> digest.digestKeyVersion !in currentVersions }) {
                    throw CorruptAdminCommandClaimException()
                }
                return reconcileExisting(scope, attempt, digests, currentAliases)
            }
        }
        return claim.toResult()
    }

    private fun requestsMatch(
        aliases: List<AdminCommandAliasRow>,
        candidates: List<AdminCommandDigest>,
    ): Boolean {
        val candidatesByVersion = candidates.associateBy(AdminCommandDigest::digestKeyVersion)
        return aliases.fold(true) { matched, alias ->
            val candidate =
                candidatesByVersion[alias.digestKeyVersion]
                    ?: throw CorruptAdminCommandClaimException()
            matched and alias.matches(candidate)
        }
    }

    private fun reserveAliases(
        scope: AdminCommandScope,
        claimId: UUID,
        aliases: List<AdminCommandDigest>,
        at: Instant,
    ) {
        aliases.sortedWith(DIGEST_ORDER).forEach { digest ->
            markAndLockKeyState(digest.digestKeyVersion, at)
            try {
                insertAlias(scope, claimId, digest, at)
            } catch (_: DuplicateKeyException) {
                throw AliasReservationLostException()
            }
        }
    }

    private fun insertClaim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency (
              id, platform_admin_user_id, command_type, target_type, target_id,
              canonical_schema_version, state, claim_token, receipt_type, receipt_id,
              created_at, updated_at, expires_at
            ) values (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, null, null, ?, ?, ?)
            """.trimIndent(),
            attempt.claimId.dbString(),
            scope.platformAdminUserId.dbString(),
            scope.commandType,
            scope.targetType,
            scope.targetId,
            attempt.canonicalSchemaVersion,
            attempt.claimToken.dbString(),
            attempt.claimedAt.toDbTime(),
            attempt.claimedAt.toDbTime(),
            attempt.initialExpiresAt.toDbTime(),
        )
    }

    private fun insertAlias(
        scope: AdminCommandScope,
        claimId: UUID,
        digest: AdminCommandDigest,
        at: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency_keys (
              claim_id, platform_admin_user_id, command_type, target_type, target_id,
              digest_key_version, idempotency_key_hmac, request_hmac, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            claimId.dbString(),
            scope.platformAdminUserId.dbString(),
            scope.commandType,
            scope.targetType,
            scope.targetId,
            digest.digestKeyVersion,
            digest.idempotencyKeyHmac,
            digest.requestHmac,
            at.toDbTime(),
        )
    }

    private fun markAndLockKeyState(
        digestKeyVersion: Int,
        at: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            ) values (?, ?, null)
            on duplicate key update
              last_referenced_at = greatest(last_referenced_at, values(last_referenced_at)),
              unreferenced_since = null
            """.trimIndent(),
            digestKeyVersion,
            at.toDbTime(),
        )
        val locked =
            jdbcTemplate.queryForObject(
                """
                select digest_key_version
                from platform_admin_command_digest_key_state
                where digest_key_version = ?
                for update
                """.trimIndent(),
                Int::class.java,
                digestKeyVersion,
            )
        if (locked != digestKeyVersion) {
            throw CorruptAdminCommandClaimException()
        }
    }

    private fun findAliases(
        scope: AdminCommandScope,
        candidates: List<AdminCommandDigest>,
        lock: Boolean,
    ): List<AdminCommandAliasRow> =
        candidates.sortedWith(DIGEST_ORDER).flatMap { digest ->
            findAliasRows(scope, digest, lock)
        }

    private fun findAliasRows(
        scope: AdminCommandScope,
        digest: AdminCommandDigest,
        lock: Boolean,
    ): List<AdminCommandAliasRow> =
        jdbcTemplate.query(
            """
            select claim_id, digest_key_version, idempotency_key_hmac, request_hmac
            from platform_admin_command_idempotency_keys
            where platform_admin_user_id = ?
              and command_type = ?
              and target_type = ?
              and target_id = ?
              and digest_key_version = ?
              and idempotency_key_hmac = ?
            ${if (lock) "for update" else ""}
            """.trimIndent(),
            { resultSet, _ -> resultSet.toAliasRow() },
            scope.platformAdminUserId.dbString(),
            scope.commandType,
            scope.targetType,
            scope.targetId,
            digest.digestKeyVersion,
            digest.idempotencyKeyHmac,
        )

    private fun findClaimForUpdate(
        scope: AdminCommandScope,
        claimId: UUID,
    ): AdminCommandStoredClaim? =
        jdbcTemplate
            .query(
                """
                select id, platform_admin_user_id, command_type, target_type, target_id,
                       canonical_schema_version, state, receipt_type, receipt_id
                from platform_admin_command_idempotency
                where id = ?
                  and platform_admin_user_id = ?
                  and command_type = ?
                  and target_type = ?
                  and target_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.toStoredClaim() },
                claimId.dbString(),
                scope.platformAdminUserId.dbString(),
                scope.commandType,
                scope.targetType,
                scope.targetId,
            ).singleOrNull()

    private fun singleOwner(aliases: List<AdminCommandAliasRow>): UUID {
        val owners = aliases.map(AdminCommandAliasRow::claimId).distinct()
        if (owners.size != 1) {
            throw CorruptAdminCommandClaimException()
        }
        return owners.single()
    }

    private fun <T : Any> withSavepoint(block: () -> T): T =
        requireNotNull(
            jdbcTemplate.execute(
                ConnectionCallback { connection ->
                    val savepoint = connection.setSavepoint()
                    try {
                        block().also { connection.releaseSavepoint(savepoint) }
                    } catch (failure: Throwable) {
                        rollbackSavepoint(connection, savepoint, failure)
                        throw failure
                    }
                },
            ),
        )

    private fun rollbackSavepoint(
        connection: Connection,
        savepoint: Savepoint,
        failure: Throwable,
    ) {
        try {
            connection.rollback(savepoint)
        } catch (rollbackFailure: Throwable) {
            failure.addSuppressed(rollbackFailure)
        }
        try {
            connection.releaseSavepoint(savepoint)
        } catch (releaseFailure: Throwable) {
            failure.addSuppressed(releaseFailure)
        }
    }

    private fun requireExistingTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw RequiredAdminCommandTransactionException()
        }
    }

    private companion object {
        val MINIMUM_RETENTION: Duration = Duration.ofHours(24)
        val RECEIPT_TYPE = Regex("^[A-Za-z0-9._:-]{1,96}$")
        val RECEIPT_ID = Regex("^[A-Za-z0-9._:-]{1,128}$")
        val DIGEST_ORDER =
            Comparator<AdminCommandDigest> { left, right ->
                val version = left.digestKeyVersion.compareTo(right.digestKeyVersion)
                if (version != 0) version else compareUnsigned(left.idempotencyKeyHmac, right.idempotencyKeyHmac)
            }

        fun compareUnsigned(
            left: ByteArray,
            right: ByteArray,
        ): Int {
            val common = minOf(left.size, right.size)
            for (index in 0 until common) {
                val compared = left[index].toUByte().compareTo(right[index].toUByte())
                if (compared != 0) return compared
            }
            return left.size.compareTo(right.size)
        }
    }
}

private class AliasReservationLostException : RuntimeException()

private fun AdminCommandStoredClaim.toResult(): AdminCommandClaimResult =
    when (state) {
        AdminCommandStoredState.IN_PROGRESS -> {
            if (receiptType != null || receiptId != null) throw CorruptAdminCommandClaimException()
            AdminCommandClaimResult.InProgress
        }
        AdminCommandStoredState.COMPLETED -> {
            AdminCommandClaimResult.Completed(
                receiptType = receiptType ?: throw CorruptAdminCommandClaimException(),
                receiptId = receiptId ?: throw CorruptAdminCommandClaimException(),
            )
        }
    }

private fun ResultSet.toAliasRow(): AdminCommandAliasRow =
    AdminCommandAliasRow(
        claimId = uuid("claim_id"),
        digestKeyVersion = getInt("digest_key_version"),
        idempotencyKeyHmac = getBytes("idempotency_key_hmac"),
        requestHmac = getBytes("request_hmac"),
    )

private fun ResultSet.toStoredClaim(): AdminCommandStoredClaim =
    AdminCommandStoredClaim(
        id = uuid("id"),
        scope =
            AdminCommandScope(
                platformAdminUserId = uuid("platform_admin_user_id"),
                commandType = getString("command_type"),
                targetType = getString("target_type"),
                targetId = getString("target_id"),
            ),
        canonicalSchemaVersion = getString("canonical_schema_version"),
        state = AdminCommandStoredState.valueOf(getString("state")),
        receiptType = getString("receipt_type"),
        receiptId = getString("receipt_id"),
    )

private fun Instant.toDbTime() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()
