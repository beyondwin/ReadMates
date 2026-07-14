@file:Suppress("MaxLineLength")

package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.aigen.application.port.out.AiGenerationMembershipChangedException
import com.readmates.shared.db.dbString
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.PreparedStatement
import java.text.Normalizer
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAiGenerationCommitPersistenceAdapter(
    private val jdbc: JdbcTemplate,
) : AiGenerationCommitPersistencePort {
    @Suppress("ThrowsCount")
    override fun upsertTranscriptSpeakersAsParticipants(
        clubId: UUID,
        sessionId: UUID,
        validatedTurns: List<ValidatedTranscriptTurn>,
    ): Int {
        val speakersByMembership = validatedTurns.groupBy { it.speakerMembershipId }
        if (speakersByMembership.values.any { turns -> turns.map { it.speakerName.normalized() }.distinct().size != 1 }) {
            throw AiGenerationMembershipChangedException()
        }
        val speakers = speakersByMembership.values.map { it.first() }
        val activeMembers = lockActiveClubMemberships(clubId)
        val activeNames = activeMembers.groupBy { it.displayName.normalized() }
        val requestedNames = speakers.map { it.speakerName.normalized() }.toSet()
        if (activeNames.filterKeys { it in requestedNames }.values.any { it.size != 1 }) {
            throw AiGenerationMembershipChangedException()
        }
        val verifiedSpeakers =
            speakers.map { turn ->
                val membership =
                    activeMembers.singleOrNull { it.membershipId == turn.speakerMembershipId }
                        ?: lockMembership(turn.speakerMembershipId)
                        ?: throw AiGenerationMembershipChangedException()
                if (membership.clubId != clubId || membership.status != ACTIVE ||
                    membership.displayName.normalized() != turn.speakerName.normalized()
                ) {
                    throw AiGenerationMembershipChangedException()
                }
                turn
            }
        val synchronizedMemberships = lockSynchronizedParticipants(sessionId, verifiedSpeakers.map { it.speakerMembershipId })
        val changedCount = verifiedSpeakers.count { it.speakerMembershipId !in synchronizedMemberships }
        jdbc.batchUpdate(
            """
            insert into session_participants
              (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
            values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            on duplicate key update
              rsvp_status = 'GOING', attendance_status = 'ATTENDED', participation_status = 'ACTIVE'
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun getBatchSize(): Int = verifiedSpeakers.size

                override fun setValues(
                    statement: PreparedStatement,
                    index: Int,
                ) {
                    statement.setString(1, UUID.randomUUID().dbString())
                    statement.setString(2, clubId.dbString())
                    statement.setString(SESSION_ID_PARAMETER_INDEX, sessionId.dbString())
                    statement.setString(MEMBERSHIP_ID_PARAMETER_INDEX, verifiedSpeakers[index].speakerMembershipId.dbString())
                }
            },
        )
        return changedCount
    }

    override fun findReceipt(
        jobId: UUID,
        revision: Long,
    ): AiGenerationCommitReceipt? =
        jdbc
            .query(
                """
                select job_id, revision, session_id, club_id, committed_at
                from ai_generation_commit_receipts
                where job_id = ? and revision = ?
                """.trimIndent(),
                { rs, _ ->
                    AiGenerationCommitReceipt(
                        jobId = UUID.fromString(rs.getString("job_id")),
                        revision = rs.getLong("revision"),
                        sessionId = UUID.fromString(rs.getString("session_id")),
                        clubId = UUID.fromString(rs.getString("club_id")),
                        committedAt = rs.getObject("committed_at", LocalDateTime::class.java).toInstant(ZoneOffset.UTC),
                    )
                },
                jobId.dbString(),
                revision,
            ).firstOrNull()

    override fun insertReceipt(receipt: AiGenerationCommitReceipt): Boolean =
        try {
            jdbc.update(
                """
                insert into ai_generation_commit_receipts (job_id, revision, session_id, club_id, committed_at)
                values (?, ?, ?, ?, ?)
                """.trimIndent(),
                receipt.jobId.dbString(),
                receipt.revision,
                receipt.sessionId.dbString(),
                receipt.clubId.dbString(),
                LocalDateTime.ofInstant(receipt.committedAt, ZoneOffset.UTC),
            ) == 1
        } catch (_: DuplicateKeyException) {
            false
        }

    private fun lockActiveClubMemberships(clubId: UUID): List<LockedMembership> =
        jdbc.query(
            """
            select memberships.id as membership_id,
                   memberships.club_id,
                   memberships.status,
                   coalesce(memberships.short_name, users.name) as display_name
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = ? and memberships.status = 'ACTIVE'
            for update
            """.trimIndent(),
            { rs, _ ->
                LockedMembership(
                    UUID.fromString(rs.getString("membership_id")),
                    UUID.fromString(rs.getString("club_id")),
                    rs.getString("status"),
                    rs.getString("display_name"),
                )
            },
            clubId.dbString(),
        )

    private fun lockMembership(membershipId: UUID): LockedMembership? =
        jdbc
            .query(
                """
                select memberships.id as membership_id,
                       memberships.club_id,
                       memberships.status,
                       coalesce(memberships.short_name, users.name) as display_name
                from memberships
                join users on users.id = memberships.user_id
                where memberships.id = ?
                for update
                """.trimIndent(),
                { rs, _ ->
                    LockedMembership(
                        UUID.fromString(rs.getString("membership_id")),
                        UUID.fromString(rs.getString("club_id")),
                        rs.getString("status"),
                        rs.getString("display_name"),
                    )
                },
                membershipId.dbString(),
            ).firstOrNull()

    private fun lockSynchronizedParticipants(
        sessionId: UUID,
        membershipIds: List<UUID>,
    ): Set<UUID> {
        if (membershipIds.isEmpty()) return emptySet()
        val placeholders = membershipIds.joinToString(",") { "?" }
        val parameters = arrayOf(sessionId.dbString(), *membershipIds.map { it.dbString() }.toTypedArray())
        return jdbc
            .query(
                """
                select membership_id, rsvp_status, attendance_status, participation_status
                from session_participants
                where session_id = ? and membership_id in ($placeholders)
                for update
                """.trimIndent(),
                { rs, _ ->
                    UUID.fromString(rs.getString("membership_id")) to
                        (
                            rs.getString("rsvp_status") == "GOING" &&
                                rs.getString("attendance_status") == "ATTENDED" &&
                                rs.getString("participation_status") == "ACTIVE"
                        )
                },
                *parameters,
            ).filter { it.second }
            .mapTo(linkedSetOf()) { it.first }
    }

    private fun String.normalized(): String = Normalizer.normalize(trim(), Normalizer.Form.NFC)

    private data class LockedMembership(
        val membershipId: UUID,
        val clubId: UUID,
        val status: String,
        val displayName: String,
    )

    private companion object {
        const val ACTIVE = "ACTIVE"
        const val SESSION_ID_PARAMETER_INDEX = 3
        const val MEMBERSHIP_ID_PARAMETER_INDEX = 4
    }
}
