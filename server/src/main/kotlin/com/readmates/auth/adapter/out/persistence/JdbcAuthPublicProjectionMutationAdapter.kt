package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.AuthPublicProjectionLock
import com.readmates.auth.application.port.out.AuthPublicProjectionMutation
import com.readmates.auth.application.port.out.AuthPublicProjectionMutationPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.sql.ResultSet
import java.util.UUID

private const val SUBJECT_CONTENT_PARAMETER_COUNT = 3
private val SUBJECT_CONTENT_PREDICATE =
    """
    exists (
      select 1
      from session_participants subject_participant
      where subject_participant.club_id = sessions.club_id
        and subject_participant.session_id = sessions.id
        and subject_participant.membership_id = ?
        and binary subject_participant.participation_status = binary 'ACTIVE'
        and (
          exists (
            select 1 from highlights
            where highlights.club_id = sessions.club_id
              and highlights.session_id = sessions.id
              and highlights.membership_id = ?
          )
          or exists (
            select 1 from one_line_reviews
            where one_line_reviews.club_id = sessions.club_id
              and one_line_reviews.session_id = sessions.id
              and one_line_reviews.membership_id = ?
              and binary one_line_reviews.visibility = binary 'PUBLIC'
          )
        )
    )
    """.trimIndent()
private val PUBLIC_TARGET_SNAPSHOTS_SQL =
    """
    select sessions.id as session_id,
           publications.id as publication_id,
           current_projection.origin_readable as previous_origin_readable,
           coalesce((
             select max(revisions.version)
             from session_record_revisions revisions
             where revisions.club_id = sessions.club_id
               and revisions.session_id = sessions.id
           ), 0) as live_record_revision,
           (sessions.deleted_at is null
             and binary sessions.state = binary 'PUBLISHED'
             and binary sessions.access_scope = binary 'GUEST_READABLE'
             and binary publications.site_visibility = binary 'PUBLIC_RECORD'
           ) as intrinsic_readable
    from active_sessions sessions
    join public_session_publications publications
      on publications.club_id = sessions.club_id and publications.session_id = sessions.id
    left join public_projection_current current_projection
      on current_projection.session_id = sessions.id
    where sessions.club_id = ?
      and (
        coalesce(current_projection.origin_readable, false) = true
        or (sessions.deleted_at is null
          and binary sessions.state = binary 'PUBLISHED'
          and binary sessions.access_scope = binary 'GUEST_READABLE'
          and binary publications.site_visibility = binary 'PUBLIC_RECORD'
        )
      )
    order by sessions.id
    """.trimIndent()

@Repository
@Suppress("TooManyFunctions")
class JdbcAuthPublicProjectionMutationAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AuthPublicProjectionMutationPort {
    override fun lockPotentiallyAffectedSessions(clubId: UUID): AuthPublicProjectionLock {
        val transactionResource = currentTransactionResource()
        val lockedSessionIds = lockAllClubSessions(clubId)
        val targets = publicTargetSnapshots(clubId, currentRead = true)
        require(lockedSessionIds.containsAll(targets.map(AuthPublicTargetSnapshot::sessionId))) {
            "Auth public projection target escaped the session lock set"
        }
        return JdbcAuthPublicProjectionLock(clubId, targets, transactionResource)
    }

    override fun record(
        lock: AuthPublicProjectionLock,
        mutation: AuthPublicProjectionMutation,
    ): Int {
        val jdbcLock = validateAndConsume(lock, mutation.clubId)
        validateTargetIdentity(jdbcLock)
        val affected = affectedSessions(mutation, jdbcLock.sortedTargets)
        if (!mutation.clubBodyChanged && affected.isEmpty()) return 0

        val mutationGroupId = UUID.randomUUID()
        val clubGeneration = incrementClubGeneration(mutation.clubId)
        var targetCount = 0
        if (mutation.clubBodyChanged) {
            insertTarget(mutation, mutationGroupId, clubGeneration, origin = null)
            targetCount += 1
        }
        affected.forEach { origin ->
            insertTarget(mutation, mutationGroupId, clubGeneration, origin)
            targetCount += 1
        }
        return targetCount
    }

    private fun affectedSessions(
        mutation: AuthPublicProjectionMutation,
        targets: List<AuthPublicTargetSnapshot>,
    ): List<AuthPublicOrigin> {
        if (
            targets.isEmpty() ||
            (!mutation.includeSubjectPublicContent && mutation.affectedSessionIds.isEmpty())
        ) {
            return emptyList()
        }
        val targetIds = targets.map(AuthPublicTargetSnapshot::sessionId)
        val contentIds =
            if (mutation.includeSubjectPublicContent) {
                subjectContentSessionIds(mutation, targetIds)
            } else {
                emptySet()
            }
        val selectedIds = contentIds + mutation.affectedSessionIds
        val clubReadable = liveClubReadable(mutation.clubId)
        return targets
            .filter { target ->
                target.sessionId in selectedIds &&
                    (target.previousOriginReadable == true || (clubReadable && target.intrinsicReadable))
            }.map { target -> target.toOrigin(clubReadable) }
    }

    private fun lockAllClubSessions(clubId: UUID): List<UUID> =
        jdbcTemplate
            .query(
                "select id from sessions where club_id = ? and deleted_at is null order by id for update",
                { rs, _ -> rs.uuid("id") },
                clubId.dbString(),
            ).distinct()
            .sortedBy(UUID::toString)

    private fun publicTargetSnapshots(
        clubId: UUID,
        currentRead: Boolean = false,
    ): List<AuthPublicTargetSnapshot> =
        jdbcTemplate
            .query(
                PUBLIC_TARGET_SNAPSHOTS_SQL + if (currentRead) "\nfor share" else "",
                { rs, _ -> rs.toTargetSnapshot() },
                clubId.dbString(),
            ).sortedBy { it.sessionId.toString() }

    private fun subjectContentSessionIds(
        mutation: AuthPublicProjectionMutation,
        targetIds: List<UUID>,
    ): Set<UUID> {
        if (targetIds.isEmpty()) return emptySet()
        val placeholders = targetIds.joinToString(",") { "?" }
        val parameters =
            buildList {
                add(mutation.clubId.dbString())
                addAll(targetIds.map(UUID::dbString))
                repeat(SUBJECT_CONTENT_PARAMETER_COUNT) { add(mutation.subjectMembershipId.dbString()) }
            }.toTypedArray()
        return jdbcTemplate
            .query(
                """
                select sessions.id
                from active_sessions sessions
                where sessions.club_id = ?
                  and sessions.id in ($placeholders)
                  and ($SUBJECT_CONTENT_PREDICATE)
                order by sessions.id
                """.trimIndent(),
                { rs, _ -> rs.uuid("id") },
                *parameters,
            ).toSet()
    }

    private fun liveClubReadable(clubId: UUID): Boolean =
        jdbcTemplate.queryForObject(
            """
            select binary status = binary 'ACTIVE' and binary public_visibility = binary 'PUBLIC'
            from clubs where id = ? for update
            """.trimIndent(),
            Boolean::class.java,
            clubId.dbString(),
        ) ?: false

    private fun validateTargetIdentity(lock: JdbcAuthPublicProjectionLock) {
        val current = publicTargetSnapshots(lock.clubId)
        val currentIds = current.map(AuthPublicTargetSnapshot::sessionId)
        val lockedIds = lock.sortedTargets.map(AuthPublicTargetSnapshot::sessionId)
        require(currentIds == lockedIds) {
            "Auth public projection target set changed after lock"
        }
        require(hasSameProjectionIdentity(current, lock.sortedTargets)) {
            "Auth public projection target identity changed after lock"
        }
    }

    private fun hasSameProjectionIdentity(
        current: List<AuthPublicTargetSnapshot>,
        expected: List<AuthPublicTargetSnapshot>,
    ): Boolean =
        current.size == expected.size &&
            current.zip(expected).all { (actual, locked) ->
                actual.sessionId == locked.sessionId &&
                    actual.publicationId == locked.publicationId &&
                    actual.liveRecordRevision == locked.liveRecordRevision &&
                    actual.intrinsicReadable == locked.intrinsicReadable
            }

    private fun validateAndConsume(
        lock: AuthPublicProjectionLock,
        clubId: UUID,
    ): JdbcAuthPublicProjectionLock {
        require(lock is JdbcAuthPublicProjectionLock) { "Auth public projection lock was not issued by JDBC" }
        require(lock.clubId == clubId) { "Auth public projection lock belongs to another club" }
        require(lock.transactionResource === currentTransactionResource()) {
            "Auth public projection lock belongs to another transaction"
        }
        require(!lock.consumed) { "Auth public projection lock was already consumed" }
        lock.consumed = true
        return lock
    }

    private fun currentTransactionResource(): Any {
        require(TransactionSynchronizationManager.isActualTransactionActive()) {
            "Auth public projection locks require an active transaction"
        }
        val dataSource = requireNotNull(jdbcTemplate.dataSource) { "JDBC data source is required" }
        return requireNotNull(TransactionSynchronizationManager.getResource(dataSource)) {
            "Auth public projection locks require a transaction-bound connection"
        }
    }

    private fun incrementClubGeneration(clubId: UUID): Long {
        jdbcTemplate.update(
            """
            insert into public_club_projection_generations (club_id, generation, origin_readable, updated_at)
            select clubs.id, 1,
                   (binary clubs.status = binary 'ACTIVE' and binary clubs.public_visibility = binary 'PUBLIC'),
                   utc_timestamp(6)
            from clubs where clubs.id = ?
            on duplicate key update generation = generation + 1, updated_at = utc_timestamp(6)
            """.trimIndent(),
            clubId.dbString(),
        )
        return checkNotNull(
            jdbcTemplate.queryForObject(
                "select generation from public_club_projection_generations where club_id = ?",
                Long::class.java,
                clubId.dbString(),
            ),
        )
    }

    private fun insertTarget(
        mutation: AuthPublicProjectionMutation,
        mutationGroupId: UUID,
        clubGeneration: Long,
        origin: AuthPublicOrigin?,
    ) {
        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        val stored = origin?.let { rotateCurrent(mutation.clubId, it, clubGeneration, convergenceId) }
        val storedOrigin =
            if (origin != null && stored != null) origin.copy(originReadable = stored.originReadable) else origin
        insertReceipt(receiptId, mutationGroupId, mutation, origin?.sessionId)
        insertWork(mutation.clubId, origin, convergenceId)
        insertLink(receiptId, convergenceId, mutation.clubId, storedOrigin, stored?.generation, clubGeneration)
    }

    private fun rotateCurrent(
        clubId: UUID,
        origin: AuthPublicOrigin,
        clubGeneration: Long,
        convergenceId: UUID,
    ): StoredProjectionMarker {
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            ) values (?, ?, ?, 1, ?, ?, ?, ?, utc_timestamp(6))
            on duplicate key update
              generation = generation + 1,
              club_generation = values(club_generation),
              publication_id_snapshot = values(publication_id_snapshot),
              live_record_revision = values(live_record_revision),
              origin_readable = if(
                public_projection_current.emergency_denied,
                false,
                values(origin_readable)
              ),
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
        return jdbcTemplate.queryForObject(
            "select generation, origin_readable from public_projection_current where session_id = ?",
            { rs, _ -> StoredProjectionMarker(rs.getLong("generation"), rs.getBoolean("origin_readable")) },
            origin.sessionId.dbString(),
        )
    }

    private fun insertReceipt(
        receiptId: UUID,
        mutationGroupId: UUID,
        mutation: AuthPublicProjectionMutation,
        sessionId: UUID?,
    ) {
        jdbcTemplate.update(
            """
            insert into auth_public_projection_mutation_receipts (
              id, mutation_group_id, club_id_snapshot, actor_membership_id_snapshot,
              subject_membership_id_snapshot, session_id_snapshot, operation, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, utc_timestamp(6))
            """.trimIndent(),
            receiptId.dbString(),
            mutationGroupId.dbString(),
            mutation.clubId.dbString(),
            mutation.actorMembershipId?.dbString(),
            mutation.subjectMembershipId.dbString(),
            sessionId?.dbString(),
            mutation.operation,
        )
    }

    private fun insertWork(
        clubId: UUID,
        origin: AuthPublicOrigin?,
        convergenceId: UUID,
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
        origin: AuthPublicOrigin?,
        generation: Long?,
        clubGeneration: Long,
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
            clubGeneration,
            origin?.liveRecordRevision,
            origin?.originReadable ?: clubOriginReadable(clubId),
        )
    }

    private fun clubOriginReadable(clubId: UUID): Boolean =
        jdbcTemplate.queryForObject(
            "select origin_readable from public_club_projection_generations where club_id = ?",
            Boolean::class.java,
            clubId.dbString(),
        ) ?: false

    private fun ResultSet.toTargetSnapshot(): AuthPublicTargetSnapshot =
        AuthPublicTargetSnapshot(
            sessionId = uuid("session_id"),
            publicationId = uuidOrNull("publication_id"),
            liveRecordRevision = getLong("live_record_revision"),
            previousOriginReadable =
                getObject("previous_origin_readable")?.let { getBoolean("previous_origin_readable") },
            intrinsicReadable = getBoolean("intrinsic_readable"),
        )

    private fun AuthPublicTargetSnapshot.toOrigin(clubReadable: Boolean) =
        AuthPublicOrigin(
            sessionId = sessionId,
            publicationId = publicationId,
            liveRecordRevision = liveRecordRevision,
            originReadable = clubReadable && intrinsicReadable && previousOriginReadable != false,
        )

    private data class AuthPublicTargetSnapshot(
        val sessionId: UUID,
        val publicationId: UUID?,
        val liveRecordRevision: Long,
        val previousOriginReadable: Boolean?,
        val intrinsicReadable: Boolean,
    )

    private data class AuthPublicOrigin(
        val sessionId: UUID,
        val publicationId: UUID?,
        val liveRecordRevision: Long,
        val originReadable: Boolean,
    )

    private data class StoredProjectionMarker(
        val generation: Long,
        val originReadable: Boolean,
    )

    private class JdbcAuthPublicProjectionLock(
        val clubId: UUID,
        val sortedTargets: List<AuthPublicTargetSnapshot>,
        val transactionResource: Any,
        var consumed: Boolean = false,
    ) : AuthPublicProjectionLock
}
