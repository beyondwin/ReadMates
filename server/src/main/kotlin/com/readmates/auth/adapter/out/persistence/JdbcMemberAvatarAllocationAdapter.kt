package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.auth.application.port.out.MemberAvatarRandomIndexPort
import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcMemberAvatarAllocationAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val randomIndex: MemberAvatarRandomIndexPort,
) : MemberAvatarAllocationPort {
    override fun allocate(
        clubId: UUID,
        userId: UUID?,
    ): BookClubAvatarKey {
        val lockedClubId =
            jdbcTemplate
                .query(
                    "select id from clubs where id = ? for update",
                    { resultSet, _ -> resultSet.uuid("id") },
                    clubId.dbString(),
                ).firstOrNull()
                ?: throw IllegalArgumentException("Club not found")
        return allocateForLockedClub(lockedClubId, userId)
    }

    override fun allocateForClubSlug(
        clubSlug: String,
        userId: UUID?,
    ): BookClubAvatarKey {
        val lockedClubId =
            jdbcTemplate
                .query(
                    "select id from clubs where slug = ? for update",
                    { resultSet, _ -> resultSet.uuid("id") },
                    clubSlug,
                ).firstOrNull()
                ?: throw IllegalArgumentException("Club not found")
        return allocateForLockedClub(lockedClubId, userId)
    }

    private fun allocateForLockedClub(
        clubId: UUID,
        userId: UUID?,
    ): BookClubAvatarKey {
        val previousKey =
            userId?.let {
                jdbcTemplate
                    .query(
                        "select avatar_key from memberships where club_id = ? and user_id = ? limit 1 for update",
                        { resultSet, _ -> BookClubAvatarKey.fromWireValue(resultSet.getString("avatar_key")) },
                        clubId.dbString(),
                        it.dbString(),
                    ).firstOrNull()
            }
        previousKey?.let { return it }

        val usedKeys =
            visibleAvatarKeysUsedByOtherMembers(clubId, userId)
                .mapNotNull(BookClubAvatarKey::fromWireValue)
                .toSet()
        val candidates = BookClubAvatarKey.ordered.filterNot(usedKeys::contains).ifEmpty { BookClubAvatarKey.ordered }
        return candidates[randomIndex.nextIndex(candidates.size)]
    }

    private fun visibleAvatarKeysUsedByOtherMembers(
        clubId: UUID,
        userId: UUID?,
    ): List<String> {
        val sql =
            buildString {
                append(
                    """
                    select avatar_key
                    from memberships
                    where club_id = ?
                      and status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED')
                    """.trimIndent(),
                )
                if (userId != null) {
                    append("\n  and user_id <> ?")
                }
                append("\nfor update")
            }
        val arguments =
            if (userId == null) {
                arrayOf(clubId.dbString())
            } else {
                arrayOf(clubId.dbString(), userId.dbString())
            }
        return jdbcTemplate.query(sql, { resultSet, _ -> resultSet.getString("avatar_key") }, *arguments)
    }
}
