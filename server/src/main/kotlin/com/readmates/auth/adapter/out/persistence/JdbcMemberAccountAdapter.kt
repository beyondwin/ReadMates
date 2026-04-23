package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.Locale
import java.util.UUID

@Repository
class JdbcMemberAccountAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberAccountStorePort {
    private val devSeedEmails = setOf(
        "host@example.com",
        "member1@example.com",
        "member2@example.com",
        "member3@example.com",
        "member4@example.com",
        "member5@example.com",
    )

    private data class UserSubjectRow(
        val googleSubjectId: String?,
    )

    override fun findActiveMemberByEmail(email: String): CurrentMember? {
        return queryActiveMemberByEmail(email)
    }

    override fun findDevSeedActiveMemberByEmail(email: String): CurrentMember? {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT)
        if (normalizedEmail !in devSeedEmails) {
            return null
        }
        return queryActiveMemberByEmail(normalizedEmail)
    }

    override fun findActiveMemberByUserId(userId: String): CurrentMember? {
        val normalizedUserId = userId.trim().takeIf { it.isNotEmpty() } ?: return null
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              memberships.role,
              memberships.status as membership_status
            from users
            join memberships on memberships.user_id = users.id
            join clubs on clubs.id = memberships.club_id
            where users.id = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentMember() },
            UUID.fromString(normalizedUserId).dbString(),
        ).firstOrNull()
    }

    override fun findMemberByGoogleSubject(googleSubjectId: String): CurrentMember? {
        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() } ?: return null
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              memberships.role,
              memberships.status as membership_status
            from users
            join memberships on memberships.user_id = users.id
            join clubs on clubs.id = memberships.club_id
            where users.google_subject_id = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentMember() },
            normalizedSubject,
        ).firstOrNull()
    }

    override fun findAnyUserIdByEmail(email: String): UUID? {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() } ?: return null
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select id
            from users
            where lower(email) = ?
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            normalizedEmail,
        ).firstOrNull()
    }

    override fun connectGoogleSubject(userId: UUID, googleSubjectId: String, profileImageUrl: String?): Boolean {
        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() } ?: return false
        val normalizedProfileImageUrl = profileImageUrl?.trim()?.takeIf { it.isNotEmpty() }
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return false
        return try {
            jdbcTemplate.update(
                """
                update users
                set google_subject_id = ?,
                    profile_image_url = ?,
                    auth_provider = 'GOOGLE',
                    password_hash = null,
                    password_set_at = null,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and (
                    google_subject_id is null
                    or google_subject_id = ?
                    or google_subject_id like 'readmates-dev-google-%'
                  )
                """.trimIndent(),
                normalizedSubject,
                normalizedProfileImageUrl,
                userId.dbString(),
                normalizedSubject,
            ) == 1
        } catch (_: DuplicateKeyException) {
            false
        }
    }

    override fun createGoogleUser(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): UUID {
        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Google subject is required")
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Google email is required")
        val normalizedName = displayName
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: normalizedEmail.substringBefore("@").takeIf { it.isNotEmpty() }
            ?: "Google User"
        val normalizedProfileImageUrl = profileImageUrl?.trim()?.takeIf { it.isNotEmpty() }
        val userId = UUID.randomUUID()
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("JdbcTemplate is unavailable")

        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId.dbString(),
            normalizedSubject,
            normalizedEmail,
            normalizedName,
            shortNameFor(normalizedName),
            normalizedProfileImageUrl,
        )

        return userId
    }

    override fun createViewerGoogleMember(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember {
        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Google subject is required")
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Google email is required")
        val normalizedName = displayName
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: normalizedEmail.substringBefore("@").takeIf { it.isNotEmpty() }
            ?: "Google User"
        val normalizedProfileImageUrl = profileImageUrl?.trim()?.takeIf { it.isNotEmpty() }
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("JdbcTemplate is unavailable")

        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId.dbString(),
            normalizedSubject,
            normalizedEmail,
            normalizedName,
            shortNameFor(normalizedName),
            normalizedProfileImageUrl,
        )

        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            select
              ?,
              clubs.id,
              ?,
              'MEMBER',
              'VIEWER',
              null
            from clubs
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
            membershipId.dbString(),
            userId.dbString(),
        )

        return findMemberByUserIdIncludingViewer(userId)
            ?: throw IllegalStateException("Created Google user has no membership")
    }

    override fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              memberships.role,
              memberships.status as membership_status
            from users
            join memberships on memberships.user_id = users.id
            join clubs on clubs.id = memberships.club_id
            where users.id = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentMember() },
            userId.dbString(),
        ).firstOrNull()
    }

    override fun googleSubjectOwnerEmail(googleSubjectId: String): String? {
        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() } ?: return null
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select email
            from users
            where google_subject_id = ?
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("email").lowercase(Locale.ROOT) },
            normalizedSubject,
        ).firstOrNull()
    }

    override fun recordLastLogin(userId: UUID) {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return
        jdbcTemplate.update(
            """
            update users
            set last_login_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id = ?
            """.trimIndent(),
            userId.dbString(),
        )
    }

    override fun createDevGoogleMember(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember? {
        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() } ?: return null
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() } ?: return null
        val normalizedName = displayName
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: normalizedEmail.substringBefore("@").takeIf { it.isNotEmpty() }
            ?: "Google User"
        val normalizedProfileImageUrl = profileImageUrl?.trim()?.takeIf { it.isNotEmpty() }
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        if (googleSubjectBelongsToDifferentEmail(jdbcTemplate, normalizedSubject, normalizedEmail)) {
            return null
        }

        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, ?, 'GOOGLE')
            on duplicate key update
              google_subject_id = if(email = values(email), values(google_subject_id), google_subject_id),
              name = if(email = values(email), values(name), name),
              short_name = if(email = values(email), values(short_name), short_name),
              profile_image_url = if(email = values(email), values(profile_image_url), profile_image_url),
              auth_provider = if(email = values(email), values(auth_provider), auth_provider),
              updated_at = if(email = values(email), utc_timestamp(6), updated_at)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            normalizedSubject,
            normalizedEmail,
            normalizedName,
            shortNameFor(normalizedName),
            normalizedProfileImageUrl,
        )
        val storedUser = findUserSubjectByEmail(jdbcTemplate, normalizedEmail) ?: return null
        if (storedUser.googleSubjectId != normalizedSubject) {
            return null
        }

        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            select
              ?,
              clubs.id,
              users.id,
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6)
            from clubs
            join users on users.email = ?
            where clubs.slug = 'reading-sai'
            on duplicate key update
              role = values(role),
              status = values(status),
              joined_at = coalesce(memberships.joined_at, values(joined_at)),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            normalizedEmail,
        )

        return queryActiveMemberByEmail(normalizedEmail)
    }

    private fun queryActiveMemberByEmail(email: String): CurrentMember? {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT)
        if (normalizedEmail.isEmpty()) {
            return null
        }
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null

        return jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              memberships.role,
              memberships.status as membership_status
            from users
            join memberships on memberships.user_id = users.id
            join clubs on clubs.id = memberships.club_id
            where lower(users.email) = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentMember() },
            normalizedEmail,
        ).firstOrNull()
    }

    private fun findUserSubjectByEmail(jdbcTemplate: JdbcTemplate, normalizedEmail: String): UserSubjectRow? =
        jdbcTemplate.query(
            """
            select google_subject_id
            from users
            where email = ?
            """.trimIndent(),
            { resultSet, _ ->
                UserSubjectRow(
                    googleSubjectId = resultSet.getString("google_subject_id"),
                )
            },
            normalizedEmail,
        ).firstOrNull()

    private fun googleSubjectBelongsToDifferentEmail(
        jdbcTemplate: JdbcTemplate,
        googleSubjectId: String,
        normalizedEmail: String,
    ): Boolean =
        jdbcTemplate.query(
            """
            select email
            from users
            where google_subject_id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("email").lowercase(Locale.ROOT) },
            googleSubjectId,
        ).firstOrNull()
            ?.let { existingEmail -> existingEmail != normalizedEmail }
            ?: false

    private fun java.sql.ResultSet.toCurrentMember(): CurrentMember {
        val displayName = getString("display_name")
        return CurrentMember(
            userId = uuid("user_id"),
            membershipId = uuid("membership_id"),
            clubId = uuid("club_id"),
            email = getString("email").lowercase(Locale.ROOT),
            displayName = displayName,
            shortName = getString("short_name") ?: shortNameFor(displayName),
            role = MembershipRole.valueOf(getString("role")),
            membershipStatus = MembershipStatus.valueOf(getString("membership_status")),
        )
    }

    private fun shortNameFor(displayName: String): String = when (displayName) {
        "김호스트" -> "호스트"
        "안멤버1" -> "멤버1"
        "최멤버2" -> "멤버2"
        "김멤버3" -> "멤버3"
        "송멤버4" -> "멤버4"
        "이멤버5" -> "멤버5"
        else -> displayName
    }
}
