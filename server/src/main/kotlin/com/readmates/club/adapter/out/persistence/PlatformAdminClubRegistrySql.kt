package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.ClubRegistrySearch
import com.readmates.club.application.port.out.PlatformAdminClubRegistryQuery
import com.readmates.shared.db.dbString

internal object PlatformAdminClubRegistrySql {
    const val NORMALIZED_NAME_SQL = "regexp_replace(lower(trim(clubs.name)), '[[:space:]]+', ' ')"

    const val FIRST_HOST_STATE_SQL = """
        case
          when exists (
            select 1 from memberships
            where memberships.club_id = clubs.id
              and memberships.role = 'HOST'
              and memberships.status = 'ACTIVE'
          ) then 'ASSIGNED'
          when exists (
            select 1 from invitations
            where invitations.club_id = clubs.id
              and invitations.role = 'HOST'
              and invitations.status = 'PENDING'
              and invitations.expires_at >= utc_timestamp(6)
          ) then 'INVITED'
          else 'MISSING'
        end
    """

    const val CLUB_PROJECTION_SQL = """
        select
          clubs.id,
          clubs.slug,
          clubs.name,
          clubs.tagline,
          clubs.about,
          clubs.status,
          clubs.public_visibility,
          clubs.admin_revision,
          $NORMALIZED_NAME_SQL as normalized_name,
          coalesce((
            select count(*) from club_domains
            where club_domains.club_id = clubs.id
          ), 0) as domain_count,
          coalesce((
            select sum(case when club_domains.status = 'ACTION_REQUIRED' then 1 else 0 end)
            from club_domains
            where club_domains.club_id = clubs.id
          ), 0) as domain_action_required_count,
          coalesce((
            select count(*)
            from notification_deliveries
            where notification_deliveries.club_id = clubs.id
              and notification_deliveries.status in ('FAILED', 'DEAD')
              and notification_deliveries.updated_at >= utc_timestamp(6) - interval 7 day
          ), 0) as notification_failure_count,
          coalesce((
            select count(*)
            from ai_generation_audit_log
            where ai_generation_audit_log.club_id = clubs.id
              and ai_generation_audit_log.status = 'FAILED'
              and ai_generation_audit_log.created_at >= utc_timestamp(6) - interval 7 day
          ), 0) as ai_failure_count,
          $FIRST_HOST_STATE_SQL as first_host_state
        from clubs
    """

    const val PAGE_PLAN_SQL = """
        select clubs.id
        from clubs
        where clubs.status = ?
          and clubs.public_visibility = ?
          and (
            $NORMALIZED_NAME_SQL > ?
            or ($NORMALIZED_NAME_SQL = ? and clubs.id > ?)
          )
        order by $NORMALIZED_NAME_SQL asc, clubs.id asc
        limit ?
    """

    const val DETAIL_PLAN_SQL = """
        select clubs.id, clubs.slug, clubs.name, clubs.status, clubs.public_visibility
        from clubs
        where clubs.id = ?
        limit 1
    """

    const val DOMAIN_LIST_SQL = """
        select id, club_id, hostname, kind, status, is_primary, verified_at, last_checked_at, provisioning_error_code
        from club_domains
        where club_id = ?
        order by is_primary desc, hostname asc, id asc
    """

    fun listSql(query: PlatformAdminClubRegistryQuery): PreparedRegistrySql {
        val predicates = mutableListOf<String>()
        val arguments = mutableListOf<Any>()
        appendFilters(query, predicates, arguments)
        appendCursor(query, predicates, arguments)
        val whereClause =
            if (predicates.isEmpty()) {
                ""
            } else {
                "where ${predicates.joinToString("\n              and ")}"
            }
        arguments += query.limit
        val sql =
            """
            $CLUB_PROJECTION_SQL
            $whereClause
            order by $NORMALIZED_NAME_SQL asc, clubs.id asc
            limit ?
            """.trimIndent()
        return PreparedRegistrySql(sql, arguments)
    }

    fun detailSql(): String =
        """
        $CLUB_PROJECTION_SQL
        where clubs.id = ?
        limit 1
        """.trimIndent()

    private fun appendFilters(
        query: PlatformAdminClubRegistryQuery,
        predicates: MutableList<String>,
        arguments: MutableList<Any>,
    ) {
        query.search?.let { search ->
            val like = ClubRegistrySearch.escapeLike(search)
            predicates +=
                """
                (
                  $NORMALIZED_NAME_SQL like concat('%', ?, '%') escape '\\'
                  or lower(clubs.slug) like concat('%', ?, '%') escape '\\'
                )
                """.trimIndent()
            arguments += like
            arguments += like
        }
        query.lifecycle?.let { lifecycle ->
            predicates += "clubs.status = ?"
            arguments += lifecycle.name
        }
        query.visibility?.let { visibility ->
            predicates += "clubs.public_visibility = ?"
            arguments += visibility.name
        }
        query.domainStatus?.let { domainStatus ->
            predicates +=
                """
                exists (
                  select 1 from club_domains
                  where club_domains.club_id = clubs.id
                    and club_domains.status = ?
                )
                """.trimIndent()
            arguments += domainStatus.name
        }
        query.onboardingState?.let { onboardingState ->
            predicates += "($FIRST_HOST_STATE_SQL) = ?"
            arguments += onboardingState.name
        }
    }

    private fun appendCursor(
        query: PlatformAdminClubRegistryQuery,
        predicates: MutableList<String>,
        arguments: MutableList<Any>,
    ) {
        val afterName = query.afterNormalizedName
        val afterId = query.afterClubId
        if (afterName == null || afterId == null) {
            return
        }
        predicates +=
            """
            (
              $NORMALIZED_NAME_SQL > ?
              or ($NORMALIZED_NAME_SQL = ? and clubs.id > ?)
            )
            """.trimIndent()
        arguments += afterName
        arguments += afterName
        arguments += afterId.dbString()
    }
}

internal data class PreparedRegistrySql(
    val sql: String,
    val arguments: List<Any>,
)
