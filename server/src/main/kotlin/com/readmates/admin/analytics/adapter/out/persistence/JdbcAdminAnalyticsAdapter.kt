package com.readmates.admin.analytics.adapter.out.persistence

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.time.Clock

@Repository
class JdbcAdminAnalyticsAdapter(
    private val jdbcTemplate: JdbcTemplate,
    @Suppress("unused") private val clock: Clock,
) : AdminAnalyticsAggregatePort {
    override fun loadAggregates(window: AnalyticsWindow): AdminAnalyticsRawAggregates {
        val w = window.days
        return AdminAnalyticsRawAggregates(
            sessionsCurrent = sessionCount(w, prior = false),
            sessionsPrior = sessionCount(w, prior = true),
            completedSessionsCurrent = completedSessionCount(w, prior = false),
            completedSessionsPrior = completedSessionCount(w, prior = true),
            participantsCurrent = participantCount(w, prior = false, goingMaybeOnly = false),
            participantsPrior = participantCount(w, prior = true, goingMaybeOnly = false),
            goingMaybeCurrent = participantCount(w, prior = false, goingMaybeOnly = true),
            goingMaybePrior = participantCount(w, prior = true, goingMaybeOnly = true),
            activeMembersCurrent = activeMemberCount(w, prior = false),
            activeMembersPrior = activeMemberCount(w, prior = true),
            aiCostCurrent = aiCost(w, prior = false),
            aiCostPrior = aiCost(w, prior = true),
            notifTerminalCurrent = notifCount(w, prior = false, sentOnly = false),
            notifSentCurrent = notifCount(w, prior = false, sentOnly = true),
            notifTerminalPrior = notifCount(w, prior = true, sentOnly = false),
            notifSentPrior = notifCount(w, prior = true, sentOnly = true),
            benchmark = benchmark(w),
        )
    }

    // session_date is a DATE; current window = last w days, prior = [2w, w) days ago.
    private fun sessionDatePredicate(prior: Boolean): String =
        if (prior) {
            "session_date >= current_date() - interval ? day and session_date < current_date() - interval ? day"
        } else {
            "session_date >= current_date() - interval ? day"
        }

    private fun sessionDateArgs(w: Long, prior: Boolean): Array<Any> =
        if (prior) arrayOf(2 * w, w) else arrayOf(w)

    private fun sessionCount(w: Long, prior: Boolean): Int =
        scalarInt(
            "select count(*) from sessions where ${sessionDatePredicate(prior)}",
            *sessionDateArgs(w, prior),
        )

    private fun completedSessionCount(w: Long, prior: Boolean): Int =
        scalarInt(
            "select count(*) from sessions where state in ('CLOSED','PUBLISHED') and ${sessionDatePredicate(prior)}",
            *sessionDateArgs(w, prior),
        )

    private fun participantCount(w: Long, prior: Boolean, goingMaybeOnly: Boolean): Int {
        val rsvpClause = if (goingMaybeOnly) " and sp.rsvp_status in ('GOING','MAYBE')" else ""
        return scalarInt(
            """
            select count(*)
            from session_participants sp
            join sessions s on s.id = sp.session_id
            where ${sessionDatePredicate(prior).replace("session_date", "s.session_date")}$rsvpClause
            """.trimIndent(),
            *sessionDateArgs(w, prior),
        )
    }

    private fun activeMemberCount(w: Long, prior: Boolean): Int =
        scalarInt(
            """
            select count(distinct sp.membership_id)
            from session_participants sp
            join sessions s on s.id = sp.session_id
            where ${sessionDatePredicate(prior).replace("session_date", "s.session_date")}
            """.trimIndent(),
            *sessionDateArgs(w, prior),
        )

    private fun aiCost(w: Long, prior: Boolean): BigDecimal {
        val predicate =
            if (prior) {
                "created_at >= utc_timestamp(6) - interval ? day and created_at < utc_timestamp(6) - interval ? day"
            } else {
                "created_at >= utc_timestamp(6) - interval ? day"
            }
        val args = if (prior) arrayOf<Any>(2 * w, w) else arrayOf<Any>(w)
        return jdbcTemplate.queryForObject(
            "select coalesce(sum(cost_estimate_usd), 0) from ai_generation_audit_log where $predicate",
            BigDecimal::class.java,
            *args,
        ) ?: BigDecimal.ZERO
    }

    private fun notifCount(w: Long, prior: Boolean, sentOnly: Boolean): Int {
        val statusClause = if (sentOnly) "status = 'SENT'" else "status in ('SENT','FAILED','DEAD')"
        val predicate =
            if (prior) {
                "updated_at >= utc_timestamp(6) - interval ? day and updated_at < utc_timestamp(6) - interval ? day"
            } else {
                "updated_at >= utc_timestamp(6) - interval ? day"
            }
        val args = if (prior) arrayOf<Any>(2 * w, w) else arrayOf<Any>(w)
        return scalarInt(
            "select count(*) from notification_deliveries where $statusClause and $predicate",
            *args,
        )
    }

    private fun benchmark(w: Long): List<AdminAnalyticsBenchmarkRaw> =
        jdbcTemplate.query(
            """
            select
              c.id as club_id, c.slug as slug, c.name as name,
              count(distinct sp.membership_id) as active_members,
              count(distinct s.id) as sessions,
              count(distinct case when s.state in ('CLOSED','PUBLISHED') then s.id end) as completed_sessions,
              count(sp.id) as participants,
              sum(case when sp.rsvp_status in ('GOING','MAYBE') then 1 else 0 end) as going_maybe,
              coalesce((
                select sum(a.cost_estimate_usd) from ai_generation_audit_log a
                where a.club_id = c.id and a.created_at >= utc_timestamp(6) - interval ? day
              ), 0) as ai_cost,
              coalesce((
                select count(*) from notification_deliveries n
                where n.club_id = c.id and n.status in ('SENT','FAILED','DEAD')
                  and n.updated_at >= utc_timestamp(6) - interval ? day
              ), 0) as notif_terminal,
              coalesce((
                select count(*) from notification_deliveries n
                where n.club_id = c.id and n.status = 'SENT'
                  and n.updated_at >= utc_timestamp(6) - interval ? day
              ), 0) as notif_sent
            from clubs c
            left join sessions s on s.club_id = c.id and s.session_date >= current_date() - interval ? day
            left join session_participants sp on sp.session_id = s.id
            group by c.id, c.slug, c.name
            having sessions > 0
            order by active_members desc, c.name asc
            limit 20
            """.trimIndent(),
            { rs, _ ->
                AdminAnalyticsBenchmarkRaw(
                    clubId = rs.uuid("club_id"),
                    slug = rs.getString("slug"),
                    name = rs.getString("name"),
                    activeMembers = rs.getInt("active_members"),
                    sessions = rs.getInt("sessions"),
                    completedSessions = rs.getInt("completed_sessions"),
                    participants = rs.getInt("participants"),
                    goingMaybe = rs.getInt("going_maybe"),
                    aiCost = rs.getBigDecimal("ai_cost") ?: BigDecimal.ZERO,
                    notifTerminal = rs.getInt("notif_terminal"),
                    notifSent = rs.getInt("notif_sent"),
                )
            },
            w, w, w, w,
        ) ?: emptyList()

    private fun scalarInt(sql: String, vararg args: Any): Int =
        jdbcTemplate.queryForObject(sql, Int::class.java, *args) ?: 0
}
