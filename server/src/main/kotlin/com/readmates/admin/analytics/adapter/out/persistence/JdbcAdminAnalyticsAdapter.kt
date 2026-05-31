@file:Suppress(
    "TooManyFunctions",
    "ktlint:standard:argument-list-wrapping",
    "ktlint:standard:function-signature",
    "ktlint:standard:trailing-comma-on-declaration-site",
)

package com.readmates.admin.analytics.adapter.out.persistence

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AdminAnalyticsSeriesRawPoint
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.PreparedStatementSetter
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.sql.Date
import java.sql.PreparedStatement
import java.sql.Timestamp
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneOffset

private const val LAST_7D_BUCKET_DAYS = 1L
private const val LAST_30D_BUCKET_DAYS = 7L
private const val LAST_90D_BUCKET_DAYS = 14L

@Repository
class JdbcAdminAnalyticsAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock,
) : AdminAnalyticsAggregatePort {
    override fun loadAggregates(window: AnalyticsWindow): AdminAnalyticsRawAggregates {
        val w = window.days
        return AdminAnalyticsRawAggregates(
            sessionsCurrent = jdbcTemplate.sessionCount(w, prior = false),
            sessionsPrior = jdbcTemplate.sessionCount(w, prior = true),
            completedSessionsCurrent = jdbcTemplate.completedSessionCount(w, prior = false),
            completedSessionsPrior = jdbcTemplate.completedSessionCount(w, prior = true),
            participantsCurrent = jdbcTemplate.participantCount(w, prior = false, goingMaybeOnly = false),
            participantsPrior = jdbcTemplate.participantCount(w, prior = true, goingMaybeOnly = false),
            goingMaybeCurrent = jdbcTemplate.participantCount(w, prior = false, goingMaybeOnly = true),
            goingMaybePrior = jdbcTemplate.participantCount(w, prior = true, goingMaybeOnly = true),
            activeMembersCurrent = jdbcTemplate.activeMemberCount(w, prior = false),
            activeMembersPrior = jdbcTemplate.activeMemberCount(w, prior = true),
            aiCostCurrent = jdbcTemplate.aiCost(w, prior = false),
            aiCostPrior = jdbcTemplate.aiCost(w, prior = true),
            notifTerminalCurrent = jdbcTemplate.notifCount(w, prior = false, sentOnly = false),
            notifSentCurrent = jdbcTemplate.notifCount(w, prior = false, sentOnly = true),
            notifTerminalPrior = jdbcTemplate.notifCount(w, prior = true, sentOnly = false),
            notifSentPrior = jdbcTemplate.notifCount(w, prior = true, sentOnly = true),
            benchmark = jdbcTemplate.benchmark(w),
            series = jdbcTemplate.series(window, clock),
        )
    }
}

// session_date is a DATE; current window = last w days, prior = [2w, w) days ago.
private fun sessionDatePredicate(prior: Boolean): String =
    if (prior) {
        "session_date >= current_date() - interval ? day and session_date < current_date() - interval ? day"
    } else {
        "session_date >= current_date() - interval ? day"
    }

private fun sessionDateArgs(
    w: Long,
    prior: Boolean,
): List<Any> = if (prior) listOf(2 * w, w) else listOf(w)

private fun JdbcTemplate.sessionCount(
    w: Long,
    prior: Boolean,
): Int =
    scalarInt(
        "select count(*) from sessions where ${sessionDatePredicate(prior)}",
        sessionDateArgs(w, prior),
    )

private fun JdbcTemplate.completedSessionCount(
    w: Long,
    prior: Boolean,
): Int =
    scalarInt(
        """
        select count(*)
        from sessions
        where state in ('CLOSED','PUBLISHED')
          and ${sessionDatePredicate(prior)}
        """.trimIndent(),
        sessionDateArgs(w, prior),
    )

private fun JdbcTemplate.participantCount(
    w: Long,
    prior: Boolean,
    goingMaybeOnly: Boolean,
): Int {
    val rsvpClause = if (goingMaybeOnly) " and sp.rsvp_status in ('GOING','MAYBE')" else ""
    return scalarInt(
        """
        select count(*)
        from session_participants sp
        join sessions s on s.id = sp.session_id and s.club_id = sp.club_id
        where ${sessionDatePredicate(prior).replace("session_date", "s.session_date")}$rsvpClause
        """.trimIndent(),
        sessionDateArgs(w, prior),
    )
}

private fun JdbcTemplate.activeMemberCount(
    w: Long,
    prior: Boolean,
): Int =
    scalarInt(
        """
        select count(distinct sp.membership_id)
        from session_participants sp
        join sessions s on s.id = sp.session_id and s.club_id = sp.club_id
        where ${sessionDatePredicate(prior).replace("session_date", "s.session_date")}
        """.trimIndent(),
        sessionDateArgs(w, prior),
    )

private fun JdbcTemplate.aiCost(
    w: Long,
    prior: Boolean,
): BigDecimal {
    val predicate =
        if (prior) {
            "created_at >= utc_timestamp(6) - interval ? day and created_at < utc_timestamp(6) - interval ? day"
        } else {
            "created_at >= utc_timestamp(6) - interval ? day"
        }
    return scalarBigDecimal(
        "select coalesce(sum(cost_estimate_usd), 0) from ai_generation_audit_log where $predicate",
        sessionDateArgs(w, prior),
    )
}

private fun JdbcTemplate.notifCount(
    w: Long,
    prior: Boolean,
    sentOnly: Boolean,
): Int {
    val statusClause = if (sentOnly) "status = 'SENT'" else "status in ('SENT','FAILED','DEAD')"
    val predicate =
        if (prior) {
            "updated_at >= utc_timestamp(6) - interval ? day and updated_at < utc_timestamp(6) - interval ? day"
        } else {
            "updated_at >= utc_timestamp(6) - interval ? day"
        }
    return scalarInt(
        "select count(*) from notification_deliveries where $statusClause and $predicate",
        sessionDateArgs(w, prior),
    )
}

private fun JdbcTemplate.benchmark(w: Long): List<AdminAnalyticsBenchmarkRaw> =
    query(
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
        left join session_participants sp force index (session_participants_session_club_fk)
          on sp.session_id = s.id and sp.club_id = s.club_id
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
        w,
        w,
        w,
        w,
    ) ?: emptyList()

private fun JdbcTemplate.series(
    window: AnalyticsWindow,
    clock: Clock,
): List<AdminAnalyticsSeriesRawPoint> {
    val today = LocalDate.now(clock)
    val bucketDays = bucketDays(window)
    val firstStart = today.minusDays(window.days - 1)
    val finalExclusiveEnd = today.plusDays(1)
    val buckets = mutableListOf<Pair<LocalDate, LocalDate>>()
    var start = firstStart
    while (!start.isAfter(today)) {
        val proposedEnd = start.plusDays(bucketDays)
        val exclusiveEnd = if (proposedEnd.isAfter(finalExclusiveEnd)) finalExclusiveEnd else proposedEnd
        buckets += start to exclusiveEnd
        start = exclusiveEnd
    }
    return buckets.map { (startInclusive, endExclusive) ->
        AdminAnalyticsSeriesRawPoint(
            bucketStart = startInclusive,
            sessions = sessionCountBetween(startInclusive, endExclusive),
            completedSessions = completedSessionCountBetween(startInclusive, endExclusive),
            participants = participantCountBetween(startInclusive, endExclusive, goingMaybeOnly = false),
            goingMaybe = participantCountBetween(startInclusive, endExclusive, goingMaybeOnly = true),
            activeMembers = activeMemberCountBetween(startInclusive, endExclusive),
            aiCost = aiCostBetween(startInclusive, endExclusive),
            notifTerminal = notifCountBetween(startInclusive, endExclusive, sentOnly = false),
            notifSent = notifCountBetween(startInclusive, endExclusive, sentOnly = true),
        )
    }
}

private fun bucketDays(window: AnalyticsWindow): Long =
    when (window) {
        AnalyticsWindow.LAST_7D -> LAST_7D_BUCKET_DAYS
        AnalyticsWindow.LAST_30D -> LAST_30D_BUCKET_DAYS
        AnalyticsWindow.LAST_90D -> LAST_90D_BUCKET_DAYS
    }

private fun sessionDateRangeArgs(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
): List<Any> = listOf(Date.valueOf(startInclusive), Date.valueOf(endExclusive))

private fun timestampRangeArgs(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
): List<Any> =
    listOf(
        Timestamp.from(startInclusive.atStartOfDay().toInstant(ZoneOffset.UTC)),
        Timestamp.from(endExclusive.atStartOfDay().toInstant(ZoneOffset.UTC)),
    )

private fun JdbcTemplate.sessionCountBetween(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
): Int =
    scalarInt(
        "select count(*) from sessions where session_date >= ? and session_date < ?",
        sessionDateRangeArgs(startInclusive, endExclusive),
    )

private fun JdbcTemplate.completedSessionCountBetween(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
): Int =
    scalarInt(
        """
        select count(*)
        from sessions
        where state in ('CLOSED','PUBLISHED')
          and session_date >= ?
          and session_date < ?
        """.trimIndent(),
        sessionDateRangeArgs(startInclusive, endExclusive),
    )

private fun JdbcTemplate.participantCountBetween(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
    goingMaybeOnly: Boolean,
): Int {
    val rsvpClause = if (goingMaybeOnly) " and sp.rsvp_status in ('GOING','MAYBE')" else ""
    return scalarInt(
        """
        select count(*)
        from session_participants sp
        join sessions s on s.id = sp.session_id and s.club_id = sp.club_id
        where s.session_date >= ? and s.session_date < ?$rsvpClause
        """.trimIndent(),
        sessionDateRangeArgs(startInclusive, endExclusive),
    )
}

private fun JdbcTemplate.activeMemberCountBetween(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
): Int =
    scalarInt(
        """
        select count(distinct sp.membership_id)
        from session_participants sp
        join sessions s on s.id = sp.session_id and s.club_id = sp.club_id
        where s.session_date >= ? and s.session_date < ?
        """.trimIndent(),
        sessionDateRangeArgs(startInclusive, endExclusive),
    )

private fun JdbcTemplate.aiCostBetween(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
): BigDecimal =
    scalarBigDecimal(
        """
        select coalesce(sum(cost_estimate_usd), 0)
        from ai_generation_audit_log
        where created_at >= ? and created_at < ?
        """.trimIndent(),
        timestampRangeArgs(startInclusive, endExclusive),
    )

private fun JdbcTemplate.notifCountBetween(
    startInclusive: LocalDate,
    endExclusive: LocalDate,
    sentOnly: Boolean,
): Int {
    val statusClause = if (sentOnly) "status = 'SENT'" else "status in ('SENT','FAILED','DEAD')"
    return scalarInt(
        """
        select count(*)
        from notification_deliveries
        where $statusClause
          and updated_at >= ?
          and updated_at < ?
        """.trimIndent(),
        timestampRangeArgs(startInclusive, endExclusive),
    )
}

private fun JdbcTemplate.scalarInt(
    sql: String,
    args: List<Any> = emptyList(),
): Int = scalarValue(sql, args) { rs, _ -> rs.getInt(1) } ?: 0

private fun JdbcTemplate.scalarBigDecimal(
    sql: String,
    args: List<Any> = emptyList(),
): BigDecimal = scalarValue(sql, args) { rs, _ -> rs.getBigDecimal(1) ?: BigDecimal.ZERO } ?: BigDecimal.ZERO

private fun <T> JdbcTemplate.scalarValue(
    sql: String,
    args: List<Any>,
    mapper: RowMapper<T>,
): T? =
    query(
        sql,
        PreparedStatementSetter { statement -> bind(statement, args) },
        mapper,
    ).firstOrNull()

private fun bind(
    statement: PreparedStatement,
    args: List<Any>,
) {
    args.forEachIndexed { index, arg ->
        statement.setObject(index + 1, arg)
    }
}
