package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.ClubPublicProjectionLock
import com.readmates.club.application.port.out.ClubPublicProjectionMutation
import com.readmates.club.application.port.out.ClubPublicProjectionMutationPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.sql.ResultSet
import java.util.UUID

@Repository
@Suppress("TooManyFunctions")
class JdbcClubPublicProjectionMutationAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : ClubPublicProjectionMutationPort {
    override fun lockForExposure(clubId: UUID): ClubPublicProjectionLock {
        val transactionResource = currentTransactionResource()
        val lockedSessionIds =
            jdbcTemplate
                .query(
                    "select id from sessions where club_id = ? and deleted_at is null order by id for update",
                    { rs, _ -> rs.uuid("id") },
                    clubId.dbString(),
                ).distinct()
                .sortedBy(UUID::toString)
        val targets = publicTargetSnapshots(clubId, currentRead = true)
        require(lockedSessionIds.containsAll(targets.map(ClubPublicTargetSnapshot::sessionId))) {
            "Club public projection target escaped the session lock set"
        }
        return JdbcClubPublicProjectionLock(clubId, targets, transactionResource)
    }

    override fun record(mutation: ClubPublicProjectionMutation): Int {
        val sessions =
            if (mutation.exposureChanged) {
                val exposureLock =
                    requireNotNull(mutation.exposureLock) { "Club exposure requires sorted session locks" }
                val jdbcLock = validateAndConsume(exposureLock, mutation.clubId)
                validateTargetIdentity(jdbcLock)
                jdbcLock.sortedTargets
            } else {
                emptyList()
            }
        val mutationGroupId = UUID.randomUUID()
        val clubReceiptId = UUID.randomUUID()
        val clubConvergenceId = UUID.randomUUID()
        val clubMarker = rotateClub(mutation, clubConvergenceId)
        insertReceipt(clubReceiptId, mutationGroupId, mutation, null)
        insertWork(mutation.clubId, clubConvergenceId, null)
        insertLink(clubReceiptId, clubConvergenceId, mutation.clubId, null, null, clubMarker)

        if (!mutation.exposureChanged) return 1
        sessions.forEach { target ->
            val receiptId = UUID.randomUUID()
            val convergenceId = UUID.randomUUID()
            val origin = target.toOrigin(clubMarker.originReadable)
            val generation = rotateSession(mutation.clubId, clubMarker.generation, convergenceId, origin)
            insertReceipt(receiptId, mutationGroupId, mutation, origin.sessionId)
            insertWork(mutation.clubId, convergenceId, origin)
            insertLink(receiptId, convergenceId, mutation.clubId, origin, generation, clubMarker)
        }
        return sessions.size + 1
    }

    private fun rotateClub(
        mutation: ClubPublicProjectionMutation,
        convergenceId: UUID,
    ): ClubMarker {
        val liveReadable =
            checkNotNull(
                jdbcTemplate.queryForObject(
                    """
                    select binary status = binary 'ACTIVE' and binary public_visibility = binary 'PUBLIC'
                    from clubs where id = ? for update
                    """.trimIndent(),
                    Boolean::class.java,
                    mutation.clubId.dbString(),
                ),
            )
        val previous =
            jdbcTemplate
                .query(
                    "select origin_readable from public_club_projection_generations where club_id = ? for update",
                    { rs, _ -> rs.getBoolean("origin_readable") },
                    mutation.clubId.dbString(),
                ).firstOrNull()
        val readable = liveReadable && (mutation.exposureChanged || previous != false)
        jdbcTemplate.update(
            """
            insert into public_club_projection_generations (
              club_id, generation, origin_readable, convergence_id, updated_at
            ) values (?, 1, ?, ?, utc_timestamp(6))
            on duplicate key update
              generation = generation + 1,
              origin_readable = values(origin_readable),
              convergence_id = values(convergence_id),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            mutation.clubId.dbString(),
            readable,
            convergenceId.dbString(),
        )
        val generation =
            checkNotNull(
                jdbcTemplate.queryForObject(
                    "select generation from public_club_projection_generations where club_id = ?",
                    Long::class.java,
                    mutation.clubId.dbString(),
                ),
            )
        return ClubMarker(generation, readable)
    }

    private fun publicTargetSnapshots(
        clubId: UUID,
        currentRead: Boolean = false,
    ): List<ClubPublicTargetSnapshot> =
        jdbcTemplate
            .query(
                """
                select sessions.id as session_id,
                       publications.id as publication_id,
                       coalesce((
                         select max(revisions.version) from session_record_revisions revisions
                         where revisions.club_id = sessions.club_id and revisions.session_id = sessions.id
                       ), 0) as live_record_revision,
                       coalesce(current_projection.origin_readable, false) as previous_origin_readable,
                       (sessions.deleted_at is null
                         and binary sessions.state = binary 'PUBLISHED'
                         and binary sessions.access_scope = binary 'GUEST_READABLE'
                         and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                       ) as intrinsic_readable
                from active_sessions sessions
                join public_session_publications publications
                  on publications.club_id = sessions.club_id and publications.session_id = sessions.id
                left join public_projection_current current_projection on current_projection.session_id = sessions.id
                where sessions.club_id = ?
                  and (coalesce(current_projection.origin_readable, false) = true
                    or (sessions.deleted_at is null
                      and binary sessions.state = binary 'PUBLISHED'
                      and binary sessions.access_scope = binary 'GUEST_READABLE'
                      and binary publications.site_visibility = binary 'PUBLIC_RECORD'))
                order by sessions.id
                """.trimIndent() + if (currentRead) "\nfor share" else "",
                { rs, _ -> rs.toTargetSnapshot() },
                clubId.dbString(),
            ).sortedBy { it.sessionId.toString() }

    private fun validateTargetIdentity(lock: JdbcClubPublicProjectionLock) {
        val current = publicTargetSnapshots(lock.clubId)
        val currentIds = current.map(ClubPublicTargetSnapshot::sessionId)
        val lockedIds = lock.sortedTargets.map(ClubPublicTargetSnapshot::sessionId)
        require(currentIds == lockedIds) {
            "Club public projection target set changed after lock"
        }
        require(hasSameProjectionIdentity(current, lock.sortedTargets)) {
            "Club public projection target identity changed after lock"
        }
    }

    private fun hasSameProjectionIdentity(
        current: List<ClubPublicTargetSnapshot>,
        expected: List<ClubPublicTargetSnapshot>,
    ): Boolean =
        current.size == expected.size &&
            current.zip(expected).all { (actual, locked) ->
                actual.sessionId == locked.sessionId &&
                    actual.publicationId == locked.publicationId &&
                    actual.liveRecordRevision == locked.liveRecordRevision &&
                    actual.intrinsicReadable == locked.intrinsicReadable
            }

    private fun validateAndConsume(
        lock: ClubPublicProjectionLock,
        clubId: UUID,
    ): JdbcClubPublicProjectionLock {
        require(lock is JdbcClubPublicProjectionLock) { "Club public projection lock was not issued by JDBC" }
        require(lock.clubId == clubId) { "Club public projection lock belongs to another club" }
        require(lock.transactionResource === currentTransactionResource()) {
            "Club public projection lock belongs to another transaction"
        }
        require(!lock.consumed) { "Club public projection lock was already consumed" }
        lock.consumed = true
        return lock
    }

    private fun currentTransactionResource(): Any {
        require(TransactionSynchronizationManager.isActualTransactionActive()) {
            "Club public projection locks require an active transaction"
        }
        val dataSource = requireNotNull(jdbcTemplate.dataSource) { "JDBC data source is required" }
        return requireNotNull(TransactionSynchronizationManager.getResource(dataSource)) {
            "Club public projection locks require a transaction-bound connection"
        }
    }

    private fun rotateSession(
        clubId: UUID,
        clubGeneration: Long,
        convergenceId: UUID,
        origin: SessionOrigin,
    ): Long {
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            ) values (?, ?, ?, 1, ?, ?, ?, ?, utc_timestamp(6))
            on duplicate key update
              generation = generation + 1,
              club_generation = values(club_generation),
              live_record_revision = values(live_record_revision),
              origin_readable = values(origin_readable),
              convergence_id = values(convergence_id),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            origin.sessionId.dbString(),
            clubId.dbString(),
            origin.publicationId?.dbString(),
            clubGeneration,
            origin.liveRecordRevision,
            origin.originReadable,
            convergenceId.dbString(),
        )
        return checkNotNull(
            jdbcTemplate.queryForObject(
                "select generation from public_projection_current where session_id = ?",
                Long::class.java,
                origin.sessionId.dbString(),
            ),
        )
    }

    private fun insertReceipt(
        receiptId: UUID,
        mutationGroupId: UUID,
        mutation: ClubPublicProjectionMutation,
        sessionId: UUID?,
    ) {
        jdbcTemplate.update(
            """
            insert into club_public_projection_mutation_receipts (
              id, mutation_group_id, club_id_snapshot, actor_user_id_snapshot,
              session_id_snapshot, operation, created_at
            ) values (?, ?, ?, ?, ?, ?, utc_timestamp(6))
            """.trimIndent(),
            receiptId.dbString(),
            mutationGroupId.dbString(),
            mutation.clubId.dbString(),
            mutation.actorUserId?.dbString(),
            sessionId?.dbString(),
            mutation.operation,
        )
    }

    private fun insertWork(
        clubId: UUID,
        convergenceId: UUID,
        origin: SessionOrigin?,
    ) {
        jdbcTemplate.update(
            """
            insert into public_convergence_work (
              convergence_id, club_id_snapshot, session_id_snapshot, publication_id_snapshot,
              next_attempt_no, available_at, retention_until, created_at, updated_at
            ) values (?, ?, ?, ?, 1, utc_timestamp(6), timestampadd(day, 30, utc_timestamp(6)),
                      utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            convergenceId.dbString(),
            clubId.dbString(),
            origin?.sessionId?.dbString(),
            origin?.publicationId?.dbString(),
        )
    }

    private fun insertLink(
        receiptId: UUID,
        convergenceId: UUID,
        clubId: UUID,
        origin: SessionOrigin?,
        generation: Long?,
        clubMarker: ClubMarker,
    ) {
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_links (
              mutation_receipt_id, convergence_id, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, committed_generation, committed_club_generation,
              live_record_revision, origin_readable, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, utc_timestamp(6))
            """.trimIndent(),
            receiptId.dbString(),
            convergenceId.dbString(),
            clubId.dbString(),
            origin?.sessionId?.dbString(),
            origin?.publicationId?.dbString(),
            generation,
            clubMarker.generation,
            origin?.liveRecordRevision,
            origin?.originReadable ?: clubMarker.originReadable,
        )
    }

    private fun ResultSet.toTargetSnapshot() =
        ClubPublicTargetSnapshot(
            sessionId = uuid("session_id"),
            publicationId = uuidOrNull("publication_id"),
            liveRecordRevision = getLong("live_record_revision"),
            previousOriginReadable = getBoolean("previous_origin_readable"),
            intrinsicReadable = getBoolean("intrinsic_readable"),
        )

    private fun ClubPublicTargetSnapshot.toOrigin(clubReadable: Boolean) =
        SessionOrigin(
            sessionId = sessionId,
            publicationId = publicationId,
            liveRecordRevision = liveRecordRevision,
            originReadable = clubReadable && intrinsicReadable,
        )

    private data class ClubMarker(
        val generation: Long,
        val originReadable: Boolean,
    )

    private data class SessionOrigin(
        val sessionId: UUID,
        val publicationId: UUID?,
        val liveRecordRevision: Long,
        val originReadable: Boolean,
    )

    private data class ClubPublicTargetSnapshot(
        val sessionId: UUID,
        val publicationId: UUID?,
        val liveRecordRevision: Long,
        val previousOriginReadable: Boolean,
        val intrinsicReadable: Boolean,
    )

    private class JdbcClubPublicProjectionLock(
        val clubId: UUID,
        val sortedTargets: List<ClubPublicTargetSnapshot>,
        val transactionResource: Any,
        var consumed: Boolean = false,
    ) : ClubPublicProjectionLock
}
