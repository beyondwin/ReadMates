package com.readmates.auth.application

import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

data class StoredAuthSession(
    val id: String,
    val userId: String,
    val sessionTokenHash: String,
    val createdAt: OffsetDateTime,
    val lastSeenAt: OffsetDateTime,
    val expiresAt: OffsetDateTime,
    val revoked: Boolean = false,
    val userAgent: String?,
    val ipHash: String?,
)

interface AuthSessionRepository {
    fun create(session: StoredAuthSession)
    fun findValidByTokenHash(tokenHash: String): StoredAuthSession?
    fun touchByTokenHash(tokenHash: String)
    fun revokeByTokenHash(tokenHash: String)
    fun revokeAllForUser(userId: String)

    class InMemoryForTest : AuthSessionRepository {
        private val sessions = mutableMapOf<String, StoredAuthSession>()

        override fun create(session: StoredAuthSession) {
            sessions[session.sessionTokenHash] = session
        }

        override fun findValidByTokenHash(tokenHash: String): StoredAuthSession? = sessions[tokenHash]

        override fun touchByTokenHash(tokenHash: String) {
            sessions[tokenHash]?.let { session ->
                sessions[tokenHash] = session.copy(lastSeenAt = session.lastSeenAt.plusNanos(1))
            }
        }

        override fun revokeByTokenHash(tokenHash: String) {
            sessions[tokenHash]?.let { sessions[tokenHash] = it.copy(revoked = true) }
        }

        override fun revokeAllForUser(userId: String) {
            sessions.replaceAll { _, session -> if (session.userId == userId) session.copy(revoked = true) else session }
        }
    }
}

@Repository
class JdbcAuthSessionRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : AuthSessionRepository {
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
