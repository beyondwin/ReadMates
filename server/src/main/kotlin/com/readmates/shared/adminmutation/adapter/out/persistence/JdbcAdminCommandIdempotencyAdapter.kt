package com.readmates.shared.adminmutation.adapter.out.persistence

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyReferenceState
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

private const val MINIMUM_RETENTION_HOURS = 24L
private val MINIMUM_RETENTION: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS)
private const val MAXIMUM_PURGE_BATCH_SIZE = 500
private val RECEIPT_TYPE = Regex("^[A-Za-z0-9._:-]{1,96}$")
private val RECEIPT_ID = Regex("^[A-Za-z0-9._:-]{1,128}$")
private val DIGEST_ORDER =
    Comparator<AdminCommandDigest> { left, right ->
        val version = left.digestKeyVersion.compareTo(right.digestKeyVersion)
        if (version != 0) version else compareUnsigned(left.idempotencyKeyHmac, right.idempotencyKeyHmac)
    }

@Repository
class JdbcAdminCommandIdempotencyAdapter(
    jdbcTemplate: JdbcTemplate,
) : AdminCommandIdempotencyPort {
    private val store = AdminCommandClaimJdbcStore(jdbcTemplate)
    private val keyStates = AdminCommandDigestKeyStateJdbcStore(jdbcTemplate)
    private val claims = AdminCommandClaimJdbcProtocol(store, keyStates, AdminCommandJdbcSavepoints(jdbcTemplate))

    override fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult {
        requireExistingTransaction()
        return claims.claim(scope, attempt, digests)
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
        return store.complete(claimId, claimToken, receiptType, receiptId, completedAt, retention)
    }

    override fun purgeExpiredCompleted(
        now: Instant,
        limit: Int,
    ): Int {
        requireExistingTransaction()
        if (limit <= 0) return 0
        require(limit <= MAXIMUM_PURGE_BATCH_SIZE) { "purge limit exceeds maximum" }
        return store.purgeExpiredCompleted(now, limit)
    }

    override fun lockDigestKeyStatesForMaintenance() {
        requireExistingTransaction()
        keyStates.lockAll()
    }

    override fun invalidateDigestKeyRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ) {
        requireExistingTransaction()
        require(digestKeyVersion >= 0) { "digestKeyVersion must be non-negative" }
        keyStates.invalidateRetirement(digestKeyVersion, now)
    }

    override fun lockDigestKeyForRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ): AdminCommandDigestKeyReferenceState {
        requireExistingTransaction()
        require(digestKeyVersion >= 0) { "digestKeyVersion must be non-negative" }
        return keyStates.lockForRetirement(digestKeyVersion, now)
    }

    override fun lockDigestKeySnapshot(): List<AdminCommandDigestKeyReferenceState> {
        requireExistingTransaction()
        return keyStates.lockSnapshot()
    }

    private fun requireExistingTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw RequiredAdminCommandTransactionException()
        }
    }
}

private class AdminCommandClaimJdbcProtocol(
    private val store: AdminCommandClaimJdbcStore,
    private val keyStates: AdminCommandDigestKeyStateJdbcStore,
    private val savepoints: AdminCommandJdbcSavepoints,
) {
    fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult {
        val aliases = store.findAliases(scope, digests.lookupCandidates, lock = false)
        return if (aliases.isEmpty()) {
            reserveAbsent(scope, attempt, digests)
        } else {
            reconcileExisting(scope, attempt, digests, aliases)
        }
    }

    private fun reserveAbsent(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult =
        try {
            savepoints.execute {
                keyStates.prepareFreshReservationKeyStates(digests, attempt.claimedAt)
                store.insertClaim(scope, attempt)
                insertReservedAliases(scope, attempt.claimId, digests.aliasCandidates, attempt.claimedAt)
                AdminCommandClaimResult.Claimed(
                    claimId = attempt.claimId,
                    claimToken = attempt.claimToken,
                    currentDigest = digests.current,
                )
            }
        } catch (_: AliasReservationLostException) {
            keyStates.lockDigestKeyStateSlots(digests.lookupCandidates, attempt.claimedAt)
            val aliases = store.findAliases(scope, digests.lookupCandidates, lock = true)
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
        singleOwner(observedAliases)
        keyStates.lockDigestKeyStateSlots(digests.lookupCandidates, attempt.claimedAt)
        val lockedAliases = store.findAliases(scope, digests.lookupCandidates, lock = true)
        return if (lockedAliases.isEmpty()) {
            reserveAbsent(scope, attempt, digests)
        } else {
            reconcileLocked(scope, attempt, digests, lockedAliases)
        }
    }

    private fun reconcileLocked(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
        lockedAliases: List<AdminCommandAliasRow>,
    ): AdminCommandClaimResult {
        val lockedOwner = singleOwner(lockedAliases)
        val claim = store.findClaimForUpdate(scope, lockedOwner) ?: throw CorruptAdminCommandClaimException()
        return when {
            claim.canonicalSchemaVersion != digests.current.schemaVersion -> AdminCommandClaimResult.Conflict
            !requestsMatch(lockedAliases, digests.lookupCandidates) -> AdminCommandClaimResult.Conflict
            else -> claimResultWithBackfill(scope, attempt, digests, claim, lockedAliases)
        }
    }

    private fun claimResultWithBackfill(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
        claim: AdminCommandStoredClaim,
        lockedAliases: List<AdminCommandAliasRow>,
    ): AdminCommandClaimResult {
        val foundVersions = lockedAliases.map(AdminCommandAliasRow::digestKeyVersion).toSet()
        val missingAliases =
            digests.aliasCandidates.filter { digest -> digest.digestKeyVersion !in foundVersions }
        return if (missingAliases.isEmpty()) {
            claim.toResult()
        } else {
            try {
                savepoints.execute {
                    reserveAliases(scope, claim.id, missingAliases, attempt.claimedAt)
                }
                claim.toResult()
            } catch (_: AliasReservationLostException) {
                reconcileAfterBackfillLoss(scope, attempt, digests, missingAliases)
            }
        }
    }

    private fun reconcileAfterBackfillLoss(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
        missingAliases: List<AdminCommandDigest>,
    ): AdminCommandClaimResult {
        val currentAliases = store.findAliases(scope, digests.lookupCandidates, lock = true)
        if (currentAliases.isEmpty()) {
            throw CorruptAdminCommandClaimException()
        }
        val currentVersions = currentAliases.map(AdminCommandAliasRow::digestKeyVersion).toSet()
        if (missingAliases.any { digest -> digest.digestKeyVersion !in currentVersions }) {
            throw CorruptAdminCommandClaimException()
        }
        return reconcileExisting(scope, attempt, digests, currentAliases)
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
            keyStates.markAndLock(digest.digestKeyVersion, at)
            insertReservedAlias(scope, claimId, digest, at)
        }
    }

    private fun insertReservedAliases(
        scope: AdminCommandScope,
        claimId: UUID,
        aliases: List<AdminCommandDigest>,
        at: Instant,
    ) {
        aliases.sortedWith(DIGEST_ORDER).forEach { digest ->
            insertReservedAlias(scope, claimId, digest, at)
        }
    }

    private fun insertReservedAlias(
        scope: AdminCommandScope,
        claimId: UUID,
        digest: AdminCommandDigest,
        at: Instant,
    ) {
        try {
            store.insertAlias(scope, claimId, digest, at)
        } catch (_: DuplicateKeyException) {
            throw AliasReservationLostException()
        }
    }

    private fun singleOwner(aliases: List<AdminCommandAliasRow>): UUID {
        val owners = aliases.map(AdminCommandAliasRow::claimId).distinct()
        if (owners.size != 1) {
            throw CorruptAdminCommandClaimException()
        }
        return owners.single()
    }
}

private class AdminCommandClaimJdbcStore(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun insertClaim(
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

    fun insertAlias(
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

    fun findAliases(
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

    fun findClaimForUpdate(
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

    fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
        completedAt: Instant,
        retention: Duration,
    ): Boolean =
        jdbcTemplate.update(
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

    fun purgeExpiredCompleted(
        now: Instant,
        limit: Int,
    ): Int =
        jdbcTemplate.update(
            """
            delete from platform_admin_command_idempotency
            where state = 'COMPLETED'
              and expires_at <= ?
            order by expires_at, id
            limit ?
            """.trimIndent(),
            now.toDbTime(),
            limit,
        )
}

private class AdminCommandJdbcSavepoints(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun <T : Any> execute(block: () -> T): T =
        requireNotNull(
            jdbcTemplate.execute(
                ConnectionCallback { connection ->
                    val savepoint = connection.setSavepoint()
                    runCatching {
                        block().also { connection.releaseSavepoint(savepoint) }
                    }.fold(
                        onSuccess = { result -> result },
                        onFailure = { failure ->
                            rollbackSavepoint(connection, savepoint, failure)
                            throw failure
                        },
                    )
                },
            ),
        )

    private fun rollbackSavepoint(
        connection: Connection,
        savepoint: Savepoint,
        failure: Throwable,
    ) {
        runCatching { connection.rollback(savepoint) }
            .exceptionOrNull()
            ?.let(failure::addSuppressed)
        runCatching { connection.releaseSavepoint(savepoint) }
            .exceptionOrNull()
            ?.let(failure::addSuppressed)
    }
}

private class AdminCommandDigestKeyStateJdbcStore(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun lockAll() {
        lockStates(null)
    }

    fun invalidateRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            ) values (?, ?, null)
            on duplicate key update unreferenced_since = null
            """.trimIndent(),
            digestKeyVersion,
            now.toDbTime(),
        )
        val locked = lockStates(listOf(digestKeyVersion)).singleOrNull()
        if (locked?.digestKeyVersion != digestKeyVersion) {
            throw CorruptAdminCommandClaimException()
        }
    }

    fun lockForRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ): AdminCommandDigestKeyReferenceState {
        ensureAndLock(digestKeyVersion, now)
        val locked =
            lockStates(listOf(digestKeyVersion)).singleOrNull()
                ?: throw CorruptAdminCommandClaimException()
        val aliasCount = countAliases(digestKeyVersion)
        val pendingHostInvitationCount = countPendingHostInvitations(digestKeyVersion)
        val referenceCount = aliasCount + pendingHostInvitationCount
        val unreferencedSince =
            if (referenceCount > 0) {
                jdbcTemplate.update(
                    """
                    update platform_admin_command_digest_key_state
                    set unreferenced_since = null
                    where digest_key_version = ?
                    """.trimIndent(),
                    digestKeyVersion,
                )
                null
            } else {
                val startedAt = locked.lastReferencedAt?.let { maxOf(now, it) } ?: now
                jdbcTemplate.update(
                    """
                    update platform_admin_command_digest_key_state
                    set unreferenced_since = coalesce(unreferenced_since, ?)
                    where digest_key_version = ?
                    """.trimIndent(),
                    startedAt.toDbTime(),
                    digestKeyVersion,
                )
                locked.unreferencedSince ?: startedAt
            }
        return locked.copy(
            aliasCount = aliasCount,
            pendingHostInvitationCount = pendingHostInvitationCount,
            unreferencedSince = unreferencedSince,
        )
    }

    fun lockSnapshot(): List<AdminCommandDigestKeyReferenceState> {
        val states = lockStates(null).associateBy { it.digestKeyVersion }
        val aliasCounts =
            jdbcTemplate
                .query(
                    """
                    select digest_key_version, count(*) as alias_count
                    from platform_admin_command_idempotency_keys
                    group by digest_key_version
                    order by digest_key_version
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.getInt("digest_key_version") to resultSet.getLong("alias_count") },
                ).toMap()
        val pendingHostInvitationCounts =
            jdbcTemplate
                .query(
                    """
                    select r.digest_key_version, count(*) as pending_host_invitation_count
                    from platform_admin_club_command_convergence c
                    join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
                    where c.effect_type = 'HOST_INVITATION' and c.state = 'PENDING'
                    group by r.digest_key_version
                    order by r.digest_key_version
                    """.trimIndent(),
                    { resultSet, _ ->
                        resultSet.getInt("digest_key_version") to
                            resultSet.getLong("pending_host_invitation_count")
                    },
                ).toMap()
        return (states.keys + aliasCounts.keys + pendingHostInvitationCounts.keys).sorted().map { version ->
            states[version]?.copy(
                aliasCount = aliasCounts[version] ?: 0L,
                pendingHostInvitationCount = pendingHostInvitationCounts[version] ?: 0L,
            )
                ?: AdminCommandDigestKeyReferenceState(
                    digestKeyVersion = version,
                    aliasCount = aliasCounts[version] ?: 0L,
                    pendingHostInvitationCount = pendingHostInvitationCounts[version] ?: 0L,
                    lastReferencedAt = null,
                    unreferencedSince = null,
                )
        }
    }

    fun lockDigestKeyStateSlots(
        digests: List<AdminCommandDigest>,
        at: Instant,
    ) {
        digests.sortedWith(DIGEST_ORDER).forEach { digest ->
            ensureAndLock(digest.digestKeyVersion, at)
        }
    }

    fun prepareFreshReservationKeyStates(
        digests: AdminCommandDigestSet,
        at: Instant,
    ) {
        val aliasVersions = digests.aliasCandidates.mapTo(mutableSetOf(), AdminCommandDigest::digestKeyVersion)
        digests.lookupCandidates.sortedWith(DIGEST_ORDER).forEach { digest ->
            if (digest.digestKeyVersion in aliasVersions) {
                markAndLock(digest.digestKeyVersion, at)
            } else {
                ensureAndLock(digest.digestKeyVersion, at)
            }
        }
    }

    fun markAndLock(
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

    private fun ensureAndLock(
        digestKeyVersion: Int,
        at: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            ) values (?, ?, null)
            on duplicate key update digest_key_version = values(digest_key_version)
            """.trimIndent(),
            digestKeyVersion,
            at.toDbTime(),
        )
        val locked = lockStates(listOf(digestKeyVersion)).singleOrNull()
        if (locked?.digestKeyVersion != digestKeyVersion) {
            throw CorruptAdminCommandClaimException()
        }
    }

    private fun lockStates(versions: List<Int>?): List<AdminCommandDigestKeyReferenceState> {
        val where =
            if (versions == null) {
                ""
            } else {
                "where digest_key_version in (${versions.joinToString(",") { "?" }})"
            }
        val arguments = versions?.toTypedArray() ?: emptyArray()
        return jdbcTemplate.query(
            """
            select digest_key_version, last_referenced_at, unreferenced_since
            from platform_admin_command_digest_key_state
            $where
            order by digest_key_version
            for update
            """.trimIndent(),
            { resultSet, _ ->
                AdminCommandDigestKeyReferenceState(
                    digestKeyVersion = resultSet.getInt("digest_key_version"),
                    aliasCount = 0,
                    lastReferencedAt = resultSet.getTimestamp("last_referenced_at").toInstant(),
                    unreferencedSince = resultSet.getTimestamp("unreferenced_since")?.toInstant(),
                )
            },
            *arguments,
        )
    }

    private fun countAliases(digestKeyVersion: Int): Long =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from platform_admin_command_idempotency_keys
            where digest_key_version = ?
            """.trimIndent(),
            Long::class.java,
            digestKeyVersion,
        ) ?: 0L

    private fun countPendingHostInvitations(digestKeyVersion: Int): Long =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from platform_admin_club_command_convergence c
            join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
            where r.digest_key_version = ?
              and c.effect_type = 'HOST_INVITATION'
              and c.state = 'PENDING'
            """.trimIndent(),
            Long::class.java,
            digestKeyVersion,
        ) ?: 0L
}

private fun compareUnsigned(
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
