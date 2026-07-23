package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.port.out.HostActionNotificationPort
import com.readmates.notification.application.port.out.HostActionNotificationPreviewRecord
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcHostActionNotificationAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostActionNotificationPort {
    override fun countTargets(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
    ): HostActionTargetCounts {
        val policy = targetPolicy(eventType)
        val audiencePredicate =
            if (policy.feedbackAudience) {
                "(session_participants.membership_id is not null or memberships.role = 'HOST')"
            } else {
                "true"
            }
        val emailAudiencePredicate =
            if (policy.feedbackAudience) "session_participants.membership_id is not null" else "true"
        val row =
            jdbcTemplate.queryForMap(
                """
                select
                  count(*) as target_count,
                  count(*) as expected_in_app_count,
                  sum(
                    case when $emailAudiencePredicate
                      and coalesce(notification_preferences.email_enabled, true)
                      and coalesce(notification_preferences.${policy.preferenceColumn}, true)
                      and users.email is not null
                      and trim(users.email) <> ''
                    then 1 else 0 end
                  ) as expected_email_count
                from sessions
                join memberships on memberships.club_id = sessions.club_id
                  and memberships.status = 'ACTIVE'
                join users on users.id = memberships.user_id
                left join session_participants on session_participants.club_id = sessions.club_id
                  and session_participants.session_id = sessions.id
                  and session_participants.membership_id = memberships.id
                  and session_participants.participation_status = 'ACTIVE'
                  and session_participants.attendance_status = 'ATTENDED'
                left join notification_preferences on notification_preferences.membership_id = memberships.id
                  and notification_preferences.club_id = memberships.club_id
                where sessions.club_id = ?
                  and sessions.id = ?
                  and ${policy.statePredicate}
                  and $audiencePredicate
                """.trimIndent(),
                clubId.dbString(),
                sessionId.dbString(),
            )
        val target = (row["target_count"] as Number).toInt()
        val email = (row["expected_email_count"] as? Number)?.toInt() ?: 0
        return HostActionTargetCounts(target, target, email, target - email)
    }

    override fun insertPreview(record: HostActionNotificationPreviewRecord): UUID {
        jdbcTemplate.update(
            """
            insert into host_action_notification_previews (
              id, club_id, session_id, host_membership_id, action_type, event_type,
              request_hash, expected_draft_revision, expected_live_revision,
              target_count, expected_in_app_count, expected_email_count, excluded_count, expires_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            record.id.dbString(),
            record.clubId.dbString(),
            record.sessionId.dbString(),
            record.hostMembershipId.dbString(),
            record.action.dbValue(),
            record.eventType.name,
            record.requestHash,
            record.expectedDraftRevision,
            record.expectedLiveRevision,
            record.counts.targetCount,
            record.counts.expectedInAppCount,
            record.counts.expectedEmailCount,
            record.counts.excludedCount,
            record.expiresAt.toUtcLocalDateTime(),
        )
        return record.id
    }

    override fun lockPreview(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): HostActionNotificationPreviewRecord? =
        jdbcTemplate
            .query(
                """
                select *
                from host_action_notification_previews
                where id = ? and club_id = ? and host_membership_id = ?
                for update
                """.trimIndent(),
                { rs, _ -> rs.toPreview() },
                previewId.dbString(),
                clubId.dbString(),
                hostMembershipId.dbString(),
            ).firstOrNull()

    override fun findDecision(previewId: UUID): StoredHostActionDecision? =
        jdbcTemplate
            .query(
                "select * from host_action_notification_decisions where preview_id = ?",
                { rs, _ -> rs.toDecision() },
                previewId.dbString(),
            ).firstOrNull()

    @Transactional
    override fun completeDecision(
        preview: HostActionNotificationPreviewRecord,
        decision: NotificationDecision,
        liveRevision: Long,
        eventId: UUID?,
        now: OffsetDateTime,
    ): StoredHostActionDecision = findDecision(preview.id) ?: insertDecision(preview, decision, liveRevision, eventId, now)

    private fun insertDecision(
        preview: HostActionNotificationPreviewRecord,
        decision: NotificationDecision,
        liveRevision: Long,
        eventId: UUID?,
        now: OffsetDateTime,
    ): StoredHostActionDecision {
        val id = UUID.randomUUID()
        try {
            jdbcTemplate.update(
                """
                insert into host_action_notification_decisions (
                  id, preview_id, club_id, session_id, host_membership_id, action_type, event_type,
                  live_revision, decision, target_count, expected_in_app_count, expected_email_count,
                  excluded_count, event_id, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                id.dbString(),
                preview.id.dbString(),
                preview.clubId.dbString(),
                preview.sessionId.dbString(),
                preview.hostMembershipId.dbString(),
                preview.action.dbValue(),
                preview.eventType.name,
                liveRevision,
                decision.name,
                preview.counts.targetCount,
                preview.counts.expectedInAppCount,
                preview.counts.expectedEmailCount,
                preview.counts.excludedCount,
                eventId?.dbString(),
                now.toUtcLocalDateTime(),
            )
        } catch (duplicate: DuplicateKeyException) {
            return findDecision(preview.id) ?: throw duplicate
        }
        check(
            jdbcTemplate.update(
                """
                update host_action_notification_previews
                set consumed_at = ?, consumed_decision_id = ?
                where id = ? and consumed_at is null and consumed_decision_id is null
                """.trimIndent(),
                now.toUtcLocalDateTime(),
                id.dbString(),
                preview.id.dbString(),
            ) == 1,
        ) { "Host action notification preview was already consumed" }
        return findDecision(preview.id) ?: error("Stored host action notification decision is missing")
    }

    private fun ResultSet.toPreview() =
        HostActionNotificationPreviewRecord(
            id = uuid("id"),
            clubId = uuid("club_id"),
            sessionId = uuid("session_id"),
            hostMembershipId = uuid("host_membership_id"),
            action = getString("action_type").hostAction(),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            requestHash = getString("request_hash"),
            expectedDraftRevision = nullableLong("expected_draft_revision"),
            expectedLiveRevision = getLong("expected_live_revision"),
            counts = counts(),
            expiresAt = utcOffsetDateTime("expires_at"),
            consumedAt = getTimestamp("consumed_at")?.toLocalDateTime()?.atOffset(java.time.ZoneOffset.UTC),
            consumedDecisionId = getString("consumed_decision_id")?.let(UUID::fromString),
        )

    private fun ResultSet.toDecision() =
        StoredHostActionDecision(
            id = uuid("id"),
            previewId = uuid("preview_id"),
            clubId = uuid("club_id"),
            sessionId = uuid("session_id"),
            hostMembershipId = uuid("host_membership_id"),
            action = getString("action_type").hostAction(),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            liveRevision = getLong("live_revision"),
            decision = NotificationDecision.valueOf(getString("decision")),
            counts = counts(),
            eventId = getString("event_id")?.let(UUID::fromString),
            createdAt = utcOffsetDateTime("created_at"),
        )

    private fun ResultSet.counts() =
        HostActionTargetCounts(
            targetCount = getInt("target_count"),
            expectedInAppCount = getInt("expected_in_app_count"),
            expectedEmailCount = getInt("expected_email_count"),
            excludedCount = getInt("excluded_count"),
        )

    private fun ResultSet.nullableLong(column: String): Long? {
        val value = getLong(column)
        return if (wasNull()) null else value
    }
}

private data class HostActionTargetPolicy(
    val preferenceColumn: String,
    val statePredicate: String,
    val feedbackAudience: Boolean,
)

private fun targetPolicy(eventType: NotificationEventType): HostActionTargetPolicy =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED ->
            HostActionTargetPolicy(
                preferenceColumn = "next_book_published_enabled",
                statePredicate = "sessions.state = 'DRAFT'",
                feedbackAudience = false,
            )
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        NotificationEventType.SESSION_RECORD_UPDATED,
        ->
            HostActionTargetPolicy(
                preferenceColumn = "feedback_document_published_enabled",
                statePredicate = "sessions.state in ('CLOSED', 'PUBLISHED')",
                feedbackAudience = true,
            )
        else -> error("Unsupported host-confirmed event type: $eventType")
    }

private fun HostConfirmedAction.dbValue(): String =
    when (this) {
        HostConfirmedAction.NEXT_BOOK_PUBLISH -> "VISIBILITY_UPDATE"
        HostConfirmedAction.SESSION_RECORD_APPLY -> "RECORD_APPLY"
    }

private fun String.hostAction(): HostConfirmedAction =
    when (this) {
        "VISIBILITY_UPDATE" -> HostConfirmedAction.NEXT_BOOK_PUBLISH
        "RECORD_APPLY" -> HostConfirmedAction.SESSION_RECORD_APPLY
        else -> error("Unknown host action notification type: $this")
    }
