package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.InvitationDomainError
import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.auth.application.port.out.HostInvitationLinkStorePort
import com.readmates.auth.application.port.out.StoredHostInvitationLink
import com.readmates.auth.application.port.out.StoredHostInvitationLinkCommand
import com.readmates.auth.application.port.out.StoredHostInvitationLinkEvent
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
class JdbcHostInvitationLinkStoreAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : HostInvitationLinkStorePort {
    private val rows = HostInvitationLinkRows(objectMapper)

    override fun lockClub(clubId: UUID) {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    override fun findCommand(
        clubId: UUID,
        actorMembershipId: UUID,
        idempotencyKeyHash: String,
    ): StoredHostInvitationLinkCommand? =
        jdbcTemplate
            .query(
                """
                select id, club_id, actor_membership_id, link_id, action, idempotency_key_hash, request_hash, revision
                from host_invitation_link_events
                where club_id = ? and actor_membership_id = ? and idempotency_key_hash = ?
                limit 1
                """.trimIndent(),
                { rs, _ -> rows.toCommand(rs) },
                clubId.dbString(),
                actorMembershipId.dbString(),
                idempotencyKeyHash,
            ).firstOrNull()

    override fun insertLink(
        link: StoredHostInvitationLink,
        command: StoredHostInvitationLinkCommand,
        event: StoredHostInvitationLinkEvent,
    ) {
        jdbcTemplate.update(
            """
            insert into host_invitation_links (
              id, club_id, created_by_membership_id, name, token_hash, status,
              max_uses, used_count, expires_at, revision, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            link.id.dbString(),
            link.clubId.dbString(),
            link.createdByMembershipId.dbString(),
            link.name,
            link.tokenHash,
            link.status.name,
            link.maxUses,
            link.usedCount,
            link.expiresAt.toUtcLocalDateTime(),
            link.revision,
            link.createdAt.toUtcLocalDateTime(),
            link.updatedAt.toUtcLocalDateTime(),
        )
        insertEvent(event)
    }

    override fun list(
        clubId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<StoredHostInvitationLink> {
        val cursor = LinkCursor.from(pageRequest.cursor)
        val rows =
            jdbcTemplate.query(
                """
                select l.*, c.slug as club_slug, c.name as club_name
                from host_invitation_links l join clubs c on c.id = l.club_id
                where l.club_id = ?
                  and (? is null or l.created_at < ? or (l.created_at = ? and l.id < ?))
                order by l.created_at desc, l.id desc
                limit ?
                """.trimIndent(),
                { rs, _ -> rows.toLink(rs) },
                clubId.dbString(),
                cursor?.createdAt,
                cursor?.createdAt?.toUtcLocalDateTime(),
                cursor?.createdAt?.toUtcLocalDateTime(),
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
                            "createdAt" to it.createdAt.toString(),
                            "id" to it.id.toString(),
                        ),
                    )
                }
            } else {
                null
            },
        )
    }

    override fun findForUpdate(
        clubId: UUID,
        linkId: UUID,
    ): StoredHostInvitationLink? =
        jdbcTemplate
            .query(
                """
                select l.*, c.slug as club_slug, c.name as club_name
                from host_invitation_links l join clubs c on c.id = l.club_id
                where l.club_id = ? and l.id = ? for update
                """.trimIndent(),
                { rs, _ -> rows.toLink(rs) },
                clubId.dbString(),
                linkId.dbString(),
            ).firstOrNull()

    override fun update(
        link: StoredHostInvitationLink,
        command: StoredHostInvitationLinkCommand,
        event: StoredHostInvitationLinkEvent,
    ) {
        val changed =
            jdbcTemplate.update(
                """
                update host_invitation_links
                set name = ?, status = ?, max_uses = ?, expires_at = ?, revision = ?, updated_at = ?
                where id = ? and club_id = ? and revision = ?
                """.trimIndent(),
                link.name,
                link.status.name,
                link.maxUses,
                link.expiresAt.toUtcLocalDateTime(),
                link.revision,
                link.updatedAt.toUtcLocalDateTime(),
                link.id.dbString(),
                link.clubId.dbString(),
                link.revision - 1,
            )
        if (changed !=
            1
        ) {
            throw InvitationDomainException(
                "INVITATION_LINK_STALE",
                InvitationDomainError.CONFLICT,
                "Invitation link changed",
            )
        }
        insertEvent(event)
    }

    override fun history(
        clubId: UUID,
        linkId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<StoredHostInvitationLinkEvent> {
        val cursor = LinkCursor.from(pageRequest.cursor)
        val rows =
            jdbcTemplate.query(
                """
                select * from host_invitation_link_events
                where club_id = ? and link_id = ?
                  and (? is null or occurred_at < ? or (occurred_at = ? and id < ?))
                order by occurred_at desc, id desc
                limit ?
                """.trimIndent(),
                { rs, _ -> rows.toEvent(rs) },
                clubId.dbString(),
                linkId.dbString(),
                cursor?.createdAt,
                cursor?.createdAt?.toUtcLocalDateTime(),
                cursor?.createdAt?.toUtcLocalDateTime(),
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
                            "createdAt" to it.occurredAt.toString(),
                            "id" to it.receiptId.toString(),
                        ),
                    )
                }
            } else {
                null
            },
        )
    }

    override fun findByTokenHash(
        tokenHash: String,
        forUpdate: Boolean,
    ): StoredHostInvitationLink? =
        jdbcTemplate
            .query(
                """
                select l.*, c.slug as club_slug, c.name as club_name
                from host_invitation_links l join clubs c on c.id = l.club_id
                where l.token_hash = ? ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { rs, _ -> rows.toLink(rs) },
                tokenHash,
            ).firstOrNull()

    override fun consume(
        linkId: UUID,
        expectedRevision: Long,
        event: StoredHostInvitationLinkEvent,
    ): StoredHostInvitationLink {
        val changed =
            jdbcTemplate.update(
                """
                update host_invitation_links
                set used_count = used_count + 1,
                    status = case when used_count + 1 >= max_uses then 'EXHAUSTED' else status end,
                    revision = revision + 1,
                    updated_at = ?
                where id = ? and revision = ? and status = 'ACTIVE'
                  and expires_at > ? and used_count < max_uses
                """.trimIndent(),
                event.occurredAt.toUtcLocalDateTime(),
                linkId.dbString(),
                expectedRevision,
                event.occurredAt.toUtcLocalDateTime(),
            )
        if (changed !=
            1
        ) {
            throw InvitationDomainException(
                "INVITATION_LINK_EXHAUSTED",
                InvitationDomainError.CONFLICT,
                "Invitation link is exhausted",
            )
        }
        insertEvent(event)
        return jdbcTemplate
            .query(
                """
                select l.*, c.slug as club_slug, c.name as club_name
                from host_invitation_links l join clubs c on c.id = l.club_id where l.id = ?
                """.trimIndent(),
                { rs, _ -> rows.toLink(rs) },
                linkId.dbString(),
            ).single()
    }

    private fun insertEvent(event: StoredHostInvitationLinkEvent) {
        jdbcTemplate.update(
            """
            insert into host_invitation_link_events (
              id, link_id, club_id, revision, action, before_settings_json, after_settings_json,
              actor_membership_id, idempotency_key_hash, request_hash, occurred_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            event.receiptId.dbString(),
            event.linkId.dbString(),
            event.clubId.dbString(),
            event.revision,
            event.action,
            objectMapper.writeValueAsString(event.beforeSettings),
            objectMapper.writeValueAsString(event.afterSettings),
            event.actorMembershipId?.dbString(),
            event.idempotencyKeyHash,
            event.requestHash,
            event.occurredAt.toUtcLocalDateTime(),
        )
    }
}

private class HostInvitationLinkRows(
    private val objectMapper: ObjectMapper,
) {
    fun toLink(resultSet: ResultSet) =
        resultSet.run {
            StoredHostInvitationLink(
                id = uuid("id"),
                clubId = uuid("club_id"),
                createdByMembershipId = uuid("created_by_membership_id"),
                clubSlug = getString("club_slug"),
                clubName = getString("club_name"),
                name = getString("name"),
                tokenHash = getString("token_hash"),
                status = HostInvitationLinkStatus.valueOf(getString("status")),
                maxUses = getInt("max_uses"),
                usedCount = getInt("used_count"),
                expiresAt = utcOffsetDateTime("expires_at"),
                revision = getLong("revision"),
                createdAt = utcOffsetDateTime("created_at"),
                updatedAt = utcOffsetDateTime("updated_at"),
            )
        }

    fun toCommand(resultSet: ResultSet) =
        resultSet.run {
            StoredHostInvitationLinkCommand(
                receiptId = uuid("id"),
                clubId = uuid("club_id"),
                actorMembershipId = getString("actor_membership_id")?.let(UUID::fromString),
                linkId = uuid("link_id"),
                action = getString("action"),
                idempotencyKeyHash = getString("idempotency_key_hash"),
                requestHash = getString("request_hash"),
                resultRevision = getLong("revision"),
            )
        }

    fun toEvent(resultSet: ResultSet) =
        resultSet.run {
            StoredHostInvitationLinkEvent(
                receiptId = uuid("id"),
                linkId = uuid("link_id"),
                clubId = uuid("club_id"),
                revision = getLong("revision"),
                action = getString("action"),
                beforeSettings = objectMapper.readValue(getString("before_settings_json"), mapType),
                afterSettings = objectMapper.readValue(getString("after_settings_json"), mapType),
                actorMembershipId = getString("actor_membership_id")?.let(UUID::fromString),
                idempotencyKeyHash = getString("idempotency_key_hash"),
                requestHash = getString("request_hash"),
                occurredAt = utcOffsetDateTime("occurred_at"),
            )
        }

    private companion object {
        val mapType = object : TypeReference<Map<String, String?>>() {}
    }
}

private data class LinkCursor(
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): LinkCursor? {
            val created = cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
            val id = cursor["id"]?.takeIf(String::isNotBlank) ?: return null
            return created?.let { LinkCursor(it, id) }
        }
    }
}
