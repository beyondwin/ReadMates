package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAccountDuplicateException
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
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
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
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

    override fun findMemberByUserIdAndClubId(userId: UUID, clubId: UUID): CurrentMember? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
              memberships.role,
              memberships.status as membership_status
            from users
            join memberships on memberships.user_id = users.id
            join clubs on clubs.id = memberships.club_id
            where users.id = ?
              and clubs.id = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentMember() },
            userId.dbString(),
            clubId.dbString(),
        ).firstOrNull()
    }

    override fun findMemberByEmailAndClubId(email: String, clubId: UUID): CurrentMember? {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() } ?: return null
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
              memberships.role,
              memberships.status as membership_status
            from users
            join memberships on memberships.user_id = users.id
            join clubs on clubs.id = memberships.club_id
            where lower(users.email) = ?
              and clubs.id = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentMember() },
            normalizedEmail,
            clubId.dbString(),
        ).firstOrNull()
    }

    override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList()
        return jdbcTemplate.query(
            """
            select
              clubs.id as club_id,
              clubs.slug as club_slug,
              clubs.name as club_name,
              memberships.id as membership_id,
              memberships.role,
              memberships.status,
              primary_domains.hostname as primary_host
            from memberships
            join clubs on clubs.id = memberships.club_id
            left join (
              select club_id, min(hostname) as hostname
              from club_domains
              where status = 'ACTIVE'
                and is_primary = true
              group by club_id
            ) primary_domains on primary_domains.club_id = clubs.id
            where memberships.user_id = ?
              and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            """.trimIndent(),
            { resultSet, _ ->
                JoinedClubSummary(
                    clubId = resultSet.uuid("club_id"),
                    clubSlug = resultSet.getString("club_slug"),
                    clubName = resultSet.getString("club_name"),
                    membershipId = resultSet.uuid("membership_id"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = MembershipStatus.valueOf(resultSet.getString("status")),
                    primaryHost = resultSet.getString("primary_host"),
                )
            },
            userId.dbString(),
        )
    }

    override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select platform_admins.user_id, users.email, platform_admins.role
            from platform_admins
            join users on users.id = platform_admins.user_id
            where platform_admins.user_id = ?
              and platform_admins.status = 'ACTIVE'
            limit 1
            """.trimIndent(),
            { resultSet, _ ->
                CurrentPlatformAdmin(
                    userId = resultSet.uuid("user_id"),
                    email = resultSet.getString("email").lowercase(Locale.ROOT),
                    role = PlatformAdminRole.valueOf(resultSet.getString("role")),
                )
            },
            userId.dbString(),
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
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
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

    override fun findUserById(userId: UUID): CurrentUser? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select id, email
            from users
            where id = ?
            limit 1
            """.trimIndent(),
            { resultSet, _ ->
                CurrentUser(
                    userId = resultSet.uuid("id"),
                    email = resultSet.getString("email").lowercase(Locale.ROOT),
                )
            },
            userId.dbString(),
        ).firstOrNull()
    }

    override fun findMembershipStatusByUserId(userId: UUID): MembershipStatus? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select memberships.status
            from memberships
            where memberships.user_id = ?
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> MembershipStatus.valueOf(resultSet.getString("status")) },
            userId.dbString(),
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

        try {
            jdbcTemplate.update(
                """
                insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
                values (?, ?, ?, ?, ?, ?, 'GOOGLE')
                """.trimIndent(),
                userId.dbString(),
                normalizedSubject,
                normalizedEmail,
                normalizedName,
                defaultDisplayNameFor(normalizedName),
                normalizedProfileImageUrl,
            )
        } catch (exception: DuplicateKeyException) {
            throw MemberAccountDuplicateException(exception)
        }

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
        val memberDisplayName = defaultDisplayNameFor(normalizedName)
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("JdbcTemplate is unavailable")

        try {
            jdbcTemplate.update(
                """
                insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
                values (?, ?, ?, ?, ?, ?, 'GOOGLE')
                """.trimIndent(),
                userId.dbString(),
                normalizedSubject,
                normalizedEmail,
                normalizedName,
                memberDisplayName,
                normalizedProfileImageUrl,
            )

            jdbcTemplate.update(
                """
                insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
                select
                  ?,
                  clubs.id,
                  ?,
                  'MEMBER',
                  'VIEWER',
                  null,
                  ?
                from clubs
                where clubs.slug = 'reading-sai'
                """.trimIndent(),
                membershipId.dbString(),
                userId.dbString(),
                memberDisplayName,
            )
        } catch (exception: DuplicateKeyException) {
            throw MemberAccountDuplicateException(exception)
        }

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
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
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
        val memberDisplayName = defaultDisplayNameFor(normalizedName)
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
            memberDisplayName,
            normalizedProfileImageUrl,
        )
        val storedUser = findUserSubjectByEmail(jdbcTemplate, normalizedEmail) ?: return null
        if (storedUser.googleSubjectId != normalizedSubject) {
            return null
        }

        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            select
              ?,
              clubs.id,
              users.id,
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6),
              ?
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
            memberDisplayName,
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
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
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
            clubSlug = getString("club_slug"),
            email = getString("email").lowercase(Locale.ROOT),
            displayName = displayName,
            accountName = getString("account_name"),
            role = MembershipRole.valueOf(getString("role")),
            membershipStatus = MembershipStatus.valueOf(getString("membership_status")),
            clubName = getStringOrNull("club_name") ?: getString("club_slug"),
        )
    }

    private fun java.sql.ResultSet.getStringOrNull(columnLabel: String): String? =
        runCatching { getString(columnLabel) }.getOrNull()

    private fun defaultDisplayNameFor(accountName: String): String = when (accountName) {
        "김호스트" -> "호스트"
        "안멤버1" -> "멤버1"
        "최멤버2" -> "멤버2"
        "김멤버3" -> "멤버3"
        "송멤버4" -> "멤버4"
        "이멤버5" -> "멤버5"
        else -> accountName
    }
}
