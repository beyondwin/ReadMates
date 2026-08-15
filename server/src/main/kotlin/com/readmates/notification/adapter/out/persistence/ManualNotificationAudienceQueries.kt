package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class ManualNotificationAudienceQueries(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun validateMembershipEdits(
        clubId: UUID,
        membershipIds: Set<UUID>,
    ): Boolean {
        if (membershipIds.isEmpty()) return true
        val placeholders = membershipIds.joinToString(",") { "?" }
        val count =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from memberships
                where club_id = ?
                  and status = 'ACTIVE'
                  and id in ($placeholders)
                """.trimIndent(),
                Int::class.java,
                *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
            ) ?: 0
        return count == membershipIds.size
    }

    fun previewTargets(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): ManualNotificationTargetSnapshot {
        val baseIds = baseMembershipIds(clubId, selection)
        val includedIds = activeMembershipIds(clubId, selection.includedMembershipIds)
        val excludedIds = selection.excludedMembershipIds.toSet()
        val finalIds = (baseIds - excludedIds + includedIds).sortedBy { it.toString() }
        return if (finalIds.isEmpty()) {
            emptySnapshot(baseIds, includedIds, selection)
        } else {
            eligibleSnapshot(clubId, baseIds, includedIds, finalIds, selection)
        }
    }

    fun activeMembershipIds(
        clubId: UUID,
        membershipIds: List<UUID>,
    ): Set<UUID> {
        if (membershipIds.isEmpty()) return emptySet()
        val placeholders = membershipIds.joinToString(",") { "?" }
        return jdbcTemplate
            .query(
                """
                select id
                from memberships
                where club_id = ?
                  and status = 'ACTIVE'
                  and id in ($placeholders)
                """.trimIndent(),
                { resultSet, _ -> resultSet.uuid("id") },
                *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
            ).toSet()
    }

    fun isCurrentHost(
        clubId: UUID,
        hostMembershipId: UUID,
    ): Boolean =
        jdbcTemplate
            .query(
                """
                select role, status
                from memberships
                where club_id = ?
                  and id = ?
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    resultSet.getString("role") == "HOST" && resultSet.getString("status") == "ACTIVE"
                },
                clubId.dbString(),
                hostMembershipId.dbString(),
            ).firstOrNull() == true

    fun lockAudienceInputs(
        clubId: UUID,
        sessionId: UUID,
    ) {
        jdbcTemplate.queryForList(
            "select id from memberships where club_id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
        jdbcTemplate.queryForList(
            """
            select users.id
            from users
            join memberships on memberships.user_id = users.id
            where memberships.club_id = ?
            for update
            """.trimIndent(),
            String::class.java,
            clubId.dbString(),
        )
        jdbcTemplate.queryForList(
            """
            select membership_id
            from session_participants
            where club_id = ?
              and session_id = ?
            for update
            """.trimIndent(),
            String::class.java,
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.queryForList(
            "select membership_id from notification_preferences where club_id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    private fun emptySnapshot(
        baseIds: Set<UUID>,
        includedIds: Set<UUID>,
        selection: ManualNotificationSelection,
    ) = ManualNotificationTargetSnapshot(
        baseCount = baseIds.size,
        excludedCount = selection.excludedMembershipIds.count { it in baseIds },
        includedCount = includedIds.size,
        finalTargetCount = 0,
        inAppEligibleCount = 0,
        emailEligibleCount = 0,
        emailSkippedByPreferenceCount = 0,
        emailMissingCount = 0,
        targetMembershipIds = emptyList(),
        inAppMembershipIds = emptyList(),
        emailMembershipIds = emptyList(),
    )

    private fun eligibleSnapshot(
        clubId: UUID,
        baseIds: Set<UUID>,
        includedIds: Set<UUID>,
        finalIds: List<UUID>,
        selection: ManualNotificationSelection,
    ): ManualNotificationTargetSnapshot {
        val emailRequested = selection.requestedChannels != ManualNotificationRequestedChannels.IN_APP
        val inAppRequested = selection.requestedChannels != ManualNotificationRequestedChannels.EMAIL
        val eligibility = emailEligibility(clubId, selection.eventType, finalIds)
        val inAppIds = if (inAppRequested) finalIds else emptyList()
        val emailIds = if (emailRequested) eligibility.eligibleIds else emptyList()
        return ManualNotificationTargetSnapshot(
            baseCount = baseIds.size,
            excludedCount = selection.excludedMembershipIds.count { it in baseIds },
            includedCount = includedIds.size,
            finalTargetCount = finalIds.size,
            inAppEligibleCount = inAppIds.size,
            emailEligibleCount = emailIds.size,
            emailSkippedByPreferenceCount = if (emailRequested) eligibility.preferenceSkipped else 0,
            emailMissingCount = if (emailRequested) eligibility.missing else 0,
            targetMembershipIds = finalIds,
            inAppMembershipIds = inAppIds,
            emailMembershipIds = emailIds,
        )
    }

    private fun baseMembershipIds(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): Set<UUID> {
        val sql = audienceSql(selection.audience) ?: return activeMembershipIds(clubId, selection.selectedMembershipIds)
        val args =
            if (selection.audience == ManualNotificationAudience.ALL_ACTIVE_MEMBERS) {
                arrayOf(clubId.dbString())
            } else {
                arrayOf(selection.sessionId.dbString(), clubId.dbString())
            }
        return jdbcTemplate.query(sql, { resultSet, _ -> resultSet.uuid("id") }, *args).toSet()
    }

    private fun audienceSql(audience: ManualNotificationAudience): String? =
        when (audience) {
            ManualNotificationAudience.ALL_ACTIVE_MEMBERS ->
                """
                select memberships.id
                from memberships
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
                """.trimIndent()
            ManualNotificationAudience.SESSION_PARTICIPANTS ->
                """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
                """.trimIndent()
            ManualNotificationAudience.CONFIRMED_ATTENDEES ->
                """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                  and session_participants.attendance_status = 'ATTENDED'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
                """.trimIndent()
            ManualNotificationAudience.SELECTED_MEMBERS -> null
        }

    private fun emailEligibility(
        clubId: UUID,
        eventType: NotificationEventType,
        membershipIds: List<UUID>,
    ): EmailEligibility {
        val preferenceColumn = notificationPreferenceColumn(eventType)
        val placeholders = membershipIds.joinToString(",") { "?" }
        val results = loadEmailEligibility(clubId, membershipIds, placeholders, preferenceColumn)
        return EmailEligibility(
            eligibleIds =
                results
                    .filter { !it.email.isNullOrBlank() && it.emailEnabled && it.eventEnabled }
                    .map { it.membershipId }
                    .sortedBy { it.toString() },
            preferenceSkipped = results.count { !it.email.isNullOrBlank() && !(it.emailEnabled && it.eventEnabled) },
            missing = results.count { it.email.isNullOrBlank() },
        )
    }

    private fun loadEmailEligibility(
        clubId: UUID,
        membershipIds: List<UUID>,
        placeholders: String,
        preferenceColumn: String,
    ): List<EmailEligibilityRow> =
        jdbcTemplate.query(
            """
            select
              memberships.id,
              users.email,
              coalesce(notification_preferences.email_enabled, true) as email_enabled,
              coalesce(notification_preferences.$preferenceColumn, true) as event_enabled
            from memberships
            join users on users.id = memberships.user_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where memberships.club_id = ?
              and memberships.id in ($placeholders)
            """.trimIndent(),
            { resultSet, _ ->
                EmailEligibilityRow(
                    membershipId = resultSet.uuid("id"),
                    email = resultSet.getString("email"),
                    emailEnabled = resultSet.getBoolean("email_enabled"),
                    eventEnabled = resultSet.getBoolean("event_enabled"),
                )
            },
            *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
        )
}

private fun notificationPreferenceColumn(eventType: NotificationEventType): String =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED -> "next_book_published_enabled"
        NotificationEventType.SESSION_REMINDER_DUE -> "session_reminder_due_enabled"
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "feedback_document_published_enabled"
        NotificationEventType.REVIEW_PUBLISHED -> "review_published_enabled"
        NotificationEventType.SESSION_RECORD_UPDATED -> "feedback_document_published_enabled"
        NotificationEventType.AI_GENERATION_READY -> "feedback_document_published_enabled"
    }

private data class EmailEligibility(
    val eligibleIds: List<UUID>,
    val preferenceSkipped: Int,
    val missing: Int,
)

private data class EmailEligibilityRow(
    val membershipId: UUID,
    val email: String?,
    val emailEnabled: Boolean,
    val eventEnabled: Boolean,
)
