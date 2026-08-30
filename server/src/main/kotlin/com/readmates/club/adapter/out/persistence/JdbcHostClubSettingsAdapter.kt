package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.HostClubSettingsError
import com.readmates.club.application.model.HostClubSettingsException
import com.readmates.club.application.port.out.HostClubSettingsStorePort
import com.readmates.club.application.port.out.StoredHostClubClosePreview
import com.readmates.club.application.port.out.StoredHostClubSettings
import com.readmates.club.application.port.out.StoredHostClubSettingsCommand
import com.readmates.club.application.port.out.StoredHostClubSettingsHistory
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcHostClubSettingsAdapter(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : HostClubSettingsStorePort {
    private val persistence = HostClubSettingsPersistence(jdbc, objectMapper)

    override fun load(
        clubId: UUID,
        forUpdate: Boolean,
    ): StoredHostClubSettings? =
        jdbc
            .query(
                """
                select id, slug, name, approval_policy, default_timezone, schedule_reminder_enabled,
                       record_publication_default, host_settings_revision, status
                from clubs where id = ? ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { rs, _ -> persistence.toSettings(rs) },
                clubId.dbString(),
            ).firstOrNull()

    override fun findCommand(
        clubId: UUID,
        actorMembershipId: UUID,
        keyHash: String,
    ): StoredHostClubSettingsCommand? =
        jdbc
            .query(
                """
                select * from host_club_command_receipts
                where club_id = ? and actor_membership_id = ? and idempotency_key_hash = ?
                """.trimIndent(),
                { rs, _ -> persistence.toCommand(rs) },
                clubId.dbString(),
                actorMembershipId.dbString(),
                keyHash,
            ).firstOrNull()

    override fun updateSettings(
        next: StoredHostClubSettings,
        expectedRevision: Long,
        history: StoredHostClubSettingsHistory,
        command: StoredHostClubSettingsCommand,
    ) {
        val changed =
            jdbc.update(
                """
                update clubs set name = ?, approval_policy = ?, default_timezone = ?, schedule_reminder_enabled = ?,
                  record_publication_default = ?, host_settings_revision = ?, updated_at = utc_timestamp(6)
                where id = ? and host_settings_revision = ? and status = 'ACTIVE'
                """.trimIndent(),
                next.name,
                next.approvalPolicy,
                next.defaultTimezone,
                next.scheduleReminderEnabled,
                next.recordPublicationDefault,
                next.hostSettingsRevision,
                next.clubId.dbString(),
                expectedRevision,
            )
        persistence.requireChanged(changed)
        persistence.insertHistory(history)
        persistence.insertCommand(command)
    }

    override fun activeHostCount(clubId: UUID): Int =
        jdbc.queryForObject(
            "select count(*) from memberships where club_id = ? and role = 'HOST' and status = 'ACTIVE'",
            Int::class.java,
            clubId.dbString(),
        )
            ?: 0

    override fun membershipRole(
        clubId: UUID,
        membershipId: UUID,
        forUpdate: Boolean,
    ): String? =
        jdbc
            .query(
                """
                select role from memberships
                where club_id = ? and id = ? and status = 'ACTIVE'
                ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { rs, _ -> rs.getString("role") },
                clubId.dbString(),
                membershipId.dbString(),
            ).firstOrNull()

    override fun updateMembershipRole(
        clubId: UUID,
        membershipId: UUID,
        role: String,
    ) {
        if (jdbc.update(
                """
                update memberships set role = ?, updated_at = utc_timestamp(6)
                where club_id = ? and id = ? and status = 'ACTIVE'
                """.trimIndent(),
                role,
                clubId.dbString(),
                membershipId.dbString(),
            ) !=
            1
        ) {
            throw HostClubSettingsException(
                "HOST_SETTINGS_MEMBER_NOT_FOUND",
                HostClubSettingsError.NOT_FOUND,
                "Member not found",
            )
        }
    }

    override fun appendHistoryAndCommand(
        history: StoredHostClubSettingsHistory,
        command: StoredHostClubSettingsCommand,
    ) {
        val changed =
            jdbc.update(
                """
                update clubs set host_settings_revision = ?, updated_at = utc_timestamp(6)
                where id = ? and host_settings_revision = ? and status = 'ACTIVE'
                """.trimIndent(),
                history.revision,
                history.clubId.dbString(),
                history.revision - 1,
            )
        persistence.requireChanged(changed)
        persistence.insertHistory(history)
        persistence.insertCommand(command)
    }

    override fun history(
        clubId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<StoredHostClubSettingsHistory> {
        val cursor = SettingsCursor.from(pageRequest.cursor)
        val rows =
            jdbc.query(
                """
                select * from host_club_settings_history
                where club_id = ? and (? is null or occurred_at < ? or (occurred_at = ? and id < ?))
                order by occurred_at desc, id desc limit ?
                """.trimIndent(),
                { rs, _ -> persistence.toHistory(rs) },
                clubId.dbString(),
                cursor?.occurredAt,
                cursor?.occurredAt?.toUtcLocalDateTime(),
                cursor?.occurredAt?.toUtcLocalDateTime(),
                cursor?.id,
                pageRequest.limit + 1,
            )
        val visible = rows.take(pageRequest.limit)
        return CursorPage(
            visible,
            if (rows.size >
                pageRequest.limit
            ) {
                visible.lastOrNull()?.let {
                    CursorCodec.encode(
                        mapOf(
                            "occurredAt" to it.occurredAt.toString(),
                            "id" to it.id.toString(),
                        ),
                    )
                }
            } else {
                null
            },
        )
    }

    override fun saveClosePreview(preview: StoredHostClubClosePreview) {
        jdbc.update(
            """
            insert into host_club_close_previews
              (id, club_id, actor_membership_id, club_revision, effect_hash, effects_json, expires_at, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            preview.id.dbString(),
            preview.clubId.dbString(),
            preview.actorMembershipId.dbString(),
            preview.clubRevision,
            preview.effectHash,
            objectMapper.writeValueAsString(preview.effects),
            preview.expiresAt.toUtcLocalDateTime(),
            preview.createdAt.toUtcLocalDateTime(),
        )
    }

    override fun loadClosePreview(
        previewId: UUID,
        forUpdate: Boolean,
    ): StoredHostClubClosePreview? =
        jdbc
            .query(
                "select * from host_club_close_previews where id = ? ${if (forUpdate) "for update" else ""}",
                { rs, _ -> persistence.toPreview(rs) },
                previewId.dbString(),
            ).firstOrNull()

    override fun archiveClub(
        clubId: UUID,
        expectedRevision: Long,
        previewId: UUID,
        command: StoredHostClubSettingsCommand,
        history: StoredHostClubSettingsHistory,
    ) {
        persistence.requireChanged(
            jdbc.update(
                """
                update clubs set status = 'ARCHIVED', host_settings_revision = ?, updated_at = utc_timestamp(6)
                where id = ? and host_settings_revision = ? and status = 'ACTIVE'
                """.trimIndent(),
                expectedRevision + 1,
                clubId.dbString(),
                expectedRevision,
            ),
        )
        persistence.insertHistory(history)
        persistence.insertCommand(command)
        if (jdbc.update(
                """
                update host_club_close_previews set consumed_receipt_id = ?
                where id = ? and consumed_receipt_id is null
                """.trimIndent(),
                command.receiptId.dbString(),
                previewId.dbString(),
            ) !=
            1
        ) {
            throw HostClubSettingsException(
                "HOST_CLUB_CLOSE_PREVIEW_CONSUMED",
                HostClubSettingsError.CONFLICT,
                "Club close preview was consumed",
            )
        }
    }
}

private class HostClubSettingsPersistence(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun insertHistory(value: StoredHostClubSettingsHistory) {
        jdbc.update(
            """
            insert into host_club_settings_history
              (id, club_id, revision, action, actor_membership_id, subject_membership_id, before_settings_json, after_settings_json, occurred_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            value.id.dbString(),
            value.clubId.dbString(),
            value.revision,
            value.action,
            value.actorMembershipId.dbString(),
            value.subjectMembershipId?.dbString(),
            objectMapper.writeValueAsString(value.beforeSettings),
            objectMapper.writeValueAsString(value.afterSettings),
            value.occurredAt.toUtcLocalDateTime(),
        )
    }

    fun insertCommand(value: StoredHostClubSettingsCommand) {
        jdbc.update(
            """
            insert into host_club_command_receipts
              (id, club_id, actor_membership_id, action, idempotency_key_hash, request_hash, result_revision, safe_result_json, occurred_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            value.receiptId.dbString(),
            value.clubId.dbString(),
            value.actorMembershipId.dbString(),
            value.action,
            value.keyHash,
            value.requestHash,
            value.resultRevision,
            objectMapper.writeValueAsString(value.safeResult),
            value.occurredAt.toUtcLocalDateTime(),
        )
    }

    fun requireChanged(changed: Int) {
        if (changed !=
            1
        ) {
            throw HostClubSettingsException(
                "HOST_SETTINGS_STALE",
                HostClubSettingsError.CONFLICT,
                "Club settings changed",
            )
        }
    }

    fun toSettings(resultSet: ResultSet) =
        resultSet.run {
            StoredHostClubSettings(
                uuid("id"),
                getString("slug"),
                getString("name"),
                getString("approval_policy"),
                getString("default_timezone"),
                getBoolean("schedule_reminder_enabled"),
                getString("record_publication_default"),
                getLong("host_settings_revision"),
                getString("status"),
            )
        }

    fun toCommand(resultSet: ResultSet) =
        resultSet.run {
            StoredHostClubSettingsCommand(
                uuid("id"),
                uuid("club_id"),
                uuid("actor_membership_id"),
                getString("action"),
                getString("idempotency_key_hash"),
                getString("request_hash"),
                getLong("result_revision"),
                objectMapper.readValue(getString("safe_result_json"), nullableMapType),
                utcOffsetDateTime("occurred_at"),
            )
        }

    fun toHistory(resultSet: ResultSet) =
        resultSet.run {
            StoredHostClubSettingsHistory(
                uuid("id"),
                uuid("club_id"),
                getLong("revision"),
                getString("action"),
                uuid("actor_membership_id"),
                getString("subject_membership_id")?.let(UUID::fromString),
                objectMapper.readValue(getString("before_settings_json"), nullableMapType),
                objectMapper.readValue(getString("after_settings_json"), nullableMapType),
                utcOffsetDateTime("occurred_at"),
            )
        }

    fun toPreview(resultSet: ResultSet) =
        resultSet.run {
            StoredHostClubClosePreview(
                uuid("id"),
                uuid("club_id"),
                uuid("actor_membership_id"),
                getLong("club_revision"),
                getString("effect_hash"),
                objectMapper.readValue(getString("effects_json"), stringMapType),
                utcOffsetDateTime("expires_at"),
                getString("consumed_receipt_id")?.let(UUID::fromString),
                utcOffsetDateTime("created_at"),
            )
        }

    private companion object {
        val nullableMapType = object : TypeReference<Map<String, String?>>() {}
        val stringMapType = object : TypeReference<Map<String, String>>() {}
    }
}

private data class SettingsCursor(
    val occurredAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(value: Map<String, String>): SettingsCursor? {
            val at = value["occurredAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
            val id = value["id"]?.takeIf(String::isNotBlank) ?: return null
            return at?.let { SettingsCursor(it, id) }
        }
    }
}
