package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.out.AuthSessionStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcAuthSessionAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : AuthSessionStorePort {
    override fun create(session: StoredAuthSession) {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: error("Cannot create auth session without a configured database")
        jdbcTemplate.update(
            """
            insert into auth_sessions (
              id,
              user_id,
              session_token_hash,
              created_at,
              last_seen_at,
              expires_at,
              user_agent,
              ip_hash
            )
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.fromString(session.id).dbString(),
            UUID.fromString(session.userId).dbString(),
            session.sessionTokenHash,
            session.createdAt.toUtcLocalDateTime(),
            session.lastSeenAt.toUtcLocalDateTime(),
            session.expiresAt.toUtcLocalDateTime(),
            session.userAgent,
            session.ipHash,
        )
    }

    override fun findValidByTokenHash(tokenHash: String): StoredAuthSession? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select id, user_id, session_token_hash, created_at, last_seen_at, expires_at, revoked_at, user_agent, ip_hash
            from auth_sessions
            where session_token_hash = ?
              and revoked_at is null
              and expires_at > utc_timestamp(6)
            """.trimIndent(),
            { resultSet, _ ->
                StoredAuthSession(
                    id = resultSet.uuid("id").toString(),
                    userId = resultSet.uuid("user_id").toString(),
                    sessionTokenHash = resultSet.getString("session_token_hash"),
                    createdAt = resultSet.utcOffsetDateTime("created_at"),
                    lastSeenAt = resultSet.utcOffsetDateTime("last_seen_at"),
                    expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                    revoked = resultSet.getObject("revoked_at") != null,
                    userAgent = resultSet.getString("user_agent"),
                    ipHash = resultSet.getString("ip_hash"),
                )
            },
            tokenHash,
        ).firstOrNull()
    }

    override fun touchByTokenHash(tokenHash: String) {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return
        jdbcTemplate.update(
            """
            update auth_sessions
            set last_seen_at = utc_timestamp(6)
            where session_token_hash = ?
              and revoked_at is null
              and expires_at > utc_timestamp(6)
            """.trimIndent(),
            tokenHash,
        )
    }

    override fun revokeByTokenHash(tokenHash: String) {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return
        jdbcTemplate.update(
            """
            update auth_sessions
            set revoked_at = utc_timestamp(6)
            where session_token_hash = ?
              and revoked_at is null
            """.trimIndent(),
            tokenHash,
        )
    }

    override fun revokeAllForUser(userId: String) {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return
        jdbcTemplate.update(
            """
            update auth_sessions
            set revoked_at = utc_timestamp(6)
            where user_id = ?
              and revoked_at is null
            """.trimIndent(),
            UUID.fromString(userId).dbString(),
        )
    }
}
