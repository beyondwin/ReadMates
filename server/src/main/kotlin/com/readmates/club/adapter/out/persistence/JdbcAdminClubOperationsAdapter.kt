package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminClubAiUsage
import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminClubClosingRisks
import com.readmates.club.application.model.AdminClubMemberActivity
import com.readmates.club.application.model.AdminClubNotificationFailureCluster
import com.readmates.club.application.model.AdminClubNotificationHealth
import com.readmates.club.application.model.AdminClubOperationsClub
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminClubReadinessSummary
import com.readmates.club.application.model.AdminClubSafeLink
import com.readmates.club.application.model.AdminClubSessionProgress
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.sql.ResultSet
import java.time.Clock
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

@Repository
@Suppress("TooManyFunctions")
class JdbcAdminClubOperationsAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock,
) : AdminClubOperationsSnapshotPort {
    override fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot? {
        val club = loadClub(clubId) ?: return null
        return AdminClubOperationsSnapshot(
            generatedAt = OffsetDateTime.now(clock),
            club = club,
            readiness = readiness(clubId, club),
            memberActivity = memberActivity(clubId),
            sessionProgress = sessionProgress(clubId),
            notificationHealth = notificationHealth(clubId),
            aiUsage = aiUsage(clubId),
            closingRisks = closingRisks(clubId, club.slug),
            safeLinks =
                listOf(
                    AdminClubSafeLink("Host app", "/clubs/${club.slug}/app", "HOST_ROUTE"),
                    AdminClubSafeLink("알림 운영", "/admin/notifications?clubId=$clubId", "ADMIN_ROUTE"),
                    AdminClubSafeLink("AI Ops", "/admin/ai-ops?clubId=$clubId", "ADMIN_ROUTE"),
                ),
        )
    }

    private fun loadClub(clubId: UUID): AdminClubOperationsClub? =
        jdbcTemplate
            .query(
                """
                select id, slug, name, status, public_visibility
                from clubs
                where id = ?
                limit 1
                """.trimIndent(),
                { rs, _ ->
                    AdminClubOperationsClub(
                        clubId = rs.uuid("id"),
                        slug = rs.getString("slug"),
                        name = rs.getString("name"),
                        status = rs.getString("status"),
                        publicVisibility = rs.getString("public_visibility"),
                    )
                },
                clubId.dbString(),
            ).firstOrNull()

    private fun readiness(
        clubId: UUID,
        club: AdminClubOperationsClub,
    ): AdminClubReadinessSummary {
        val blockers = mutableListOf<String>()
        val activeHostCount =
            scalarInt(
                """
                select count(*)
                from memberships
                where club_id = ? and role = 'HOST' and status = 'ACTIVE'
                """.trimIndent(),
                clubId,
            )
        val domainActionCount =
            scalarInt(
                """
                select count(*)
                from club_domains
                where club_id = ? and status = 'ACTION_REQUIRED'
                """.trimIndent(),
                clubId,
            )
        if (activeHostCount == 0) blockers += "HOST_REQUIRED"
        if (domainActionCount > 0) blockers += "DOMAIN_ACTION_REQUIRED"
        if (club.status != "ACTIVE") blockers += "CLUB_NOT_ACTIVE"
        return AdminClubReadinessSummary(
            state = if (blockers.isEmpty()) "READY" else "NEEDS_ATTENTION",
            blockingReasons = blockers,
            nextAction = blockers.firstOrNull(),
        )
    }

    private fun memberActivity(clubId: UUID): AdminClubMemberActivity =
        jdbcTemplate.queryForObject(
            """
            select
              sum(case when status in ('ACTIVE', 'VIEWER') then 1 else 0 end) as active_count,
              sum(case when status in ('SUSPENDED', 'LEFT', 'INACTIVE') then 1 else 0 end) as dormant_count,
              sum(case when status in ('INVITED', 'PENDING_APPROVAL') then 1 else 0 end) as pending_viewer_count,
              sum(case when role = 'HOST' and status in ('ACTIVE', 'VIEWER') then 1 else 0 end) as host_count
            from memberships
            where club_id = ?
            """.trimIndent(),
            { rs, _ ->
                AdminClubMemberActivity(
                    activeCount = rs.getInt("active_count"),
                    dormantCount = rs.getInt("dormant_count"),
                    pendingViewerCount = rs.getInt("pending_viewer_count"),
                    hostCount = rs.getInt("host_count"),
                )
            },
            clubId.dbString(),
        ) ?: AdminClubMemberActivity(0, 0, 0, 0)

    private fun sessionProgress(clubId: UUID): AdminClubSessionProgress =
        jdbcTemplate.queryForObject(
            """
            select
              sum(case when session_date >= current_date() and state in ('DRAFT', 'OPEN') then 1 else 0 end) as upcoming_count,
              sum(case when state = 'OPEN' then 1 else 0 end) as current_open_count,
              sum(case when state = 'CLOSED' then 1 else 0 end) as closed_count,
              sum(case when state = 'PUBLISHED' then 1 else 0 end) as published_record_count,
              sum(case when state = 'CLOSED' and not exists (
                select 1 from public_session_publications p where p.session_id = sessions.id and p.is_public = true
              ) then 1 else 0 end) as incomplete_record_count
            from sessions
            where club_id = ?
            """.trimIndent(),
            { rs, _ ->
                AdminClubSessionProgress(
                    upcomingCount = rs.getInt("upcoming_count"),
                    currentOpenCount = rs.getInt("current_open_count"),
                    closedCount = rs.getInt("closed_count"),
                    publishedRecordCount = rs.getInt("published_record_count"),
                    incompleteRecordCount = rs.getInt("incomplete_record_count"),
                )
            },
            clubId.dbString(),
        ) ?: AdminClubSessionProgress(0, 0, 0, 0, 0)

    private fun closingRisks(
        clubId: UUID,
        clubSlug: String,
    ): AdminClubClosingRisks {
        val candidates = closingRiskCandidates(clubId, clubSlug)
        return AdminClubClosingRisks(
            incompleteCount = candidates.size,
            blockedCount = candidates.count { it.overallState == "BLOCKED" },
            readyCount = candidates.count { it.overallState == "READY" },
            items = candidates.take(CLOSING_RISK_ITEM_LIMIT),
        )
    }

    private fun closingRiskCandidates(
        clubId: UUID,
        clubSlug: String,
    ): List<AdminClubClosingRiskItem> =
        jdbcTemplate
            .query(
                """
                select
                  sessions.id,
                  sessions.number,
                  sessions.book_title,
                  sessions.session_date,
                  sessions.state,
                  sessions.visibility,
                  public_session_publications.public_summary,
                  public_session_publications.is_public,
                  public_session_publications.visibility as publication_visibility,
                  public_session_publications.published_at,
                  (
                    select count(*)
                    from highlights
                    where highlights.club_id = sessions.club_id
                      and highlights.session_id = sessions.id
                  ) as highlight_count,
                  (
                    select count(*)
                    from one_line_reviews
                    where one_line_reviews.club_id = sessions.club_id
                      and one_line_reviews.session_id = sessions.id
                  ) as one_liner_count,
                  (
                    select session_feedback_documents.source_text
                    from session_feedback_documents
                    where session_feedback_documents.club_id = sessions.club_id
                      and session_feedback_documents.session_id = sessions.id
                    order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
                    limit 1
                  ) as feedback_source_text,
                  (
                    select notification_event_outbox.status
                    from notification_event_outbox
                    where notification_event_outbox.club_id = sessions.club_id
                      and notification_event_outbox.aggregate_id = sessions.id
                      and notification_event_outbox.event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
                    order by notification_event_outbox.created_at desc, notification_event_outbox.id desc
                    limit 1
                  ) as latest_notification_status
                from sessions
                left join public_session_publications
                  on public_session_publications.club_id = sessions.club_id
                 and public_session_publications.session_id = sessions.id
                where sessions.club_id = ?
                  and sessions.state in ('CLOSED', 'PUBLISHED')
                order by sessions.session_date desc, sessions.number desc
                limit $CLOSING_RISK_SCAN_LIMIT
                """.trimIndent(),
                { rs, _ -> rs.toClosingRiskCandidate(clubSlug) },
                clubId.dbString(),
            ).mapNotNull { it }

    private fun notificationHealth(clubId: UUID): AdminClubNotificationHealth =
        AdminClubNotificationHealth(
            pending = notificationStatusCount(clubId, "status in ('PENDING', 'SENDING')"),
            failed = notificationStatusCount(clubId, "status = 'FAILED'"),
            dead = notificationStatusCount(clubId, "status = 'DEAD'"),
            lastSuccessAt =
                jdbcTemplate.queryForObject(
                    """
                    select max(updated_at) as last_success_at
                    from notification_deliveries
                    where club_id = ? and status = 'SENT'
                    """.trimIndent(),
                    { rs, _ -> rs.utcOffsetDateTimeOrNull("last_success_at") },
                    clubId.dbString(),
                ),
            failureClusters = failureClusters(clubId),
            recentFailed7d = notificationFailureWindowCount(clubId, prior = false),
            priorFailed7d = notificationFailureWindowCount(clubId, prior = true),
        )

    private fun notificationStatusCount(
        clubId: UUID,
        statusPredicate: String,
    ): Int =
        scalarInt(
            """
            select count(*)
            from notification_deliveries
            where club_id = ? and $statusPredicate
            """.trimIndent(),
            clubId,
        )

    private fun notificationFailureWindowCount(
        clubId: UUID,
        prior: Boolean,
    ): Int {
        val windowPredicate =
            if (prior) {
                """
                updated_at >= utc_timestamp(6) - interval 14 day
                  and updated_at < utc_timestamp(6) - interval 7 day
                """.trimIndent()
            } else {
                "updated_at >= utc_timestamp(6) - interval 7 day"
            }
        return scalarInt(
            """
            select count(*)
            from notification_deliveries
            where club_id = ? and status in ('FAILED', 'DEAD')
              and $windowPredicate
            """.trimIndent(),
            clubId,
        )
    }

    private fun failureClusters(clubId: UUID): List<AdminClubNotificationFailureCluster> =
        jdbcTemplate.query(
            """
            select
              case
                when last_error is null or trim(last_error) = '' then 'unknown'
                when lower(last_error) like '%timeout%' then 'provider_timeout'
                when lower(last_error) like '%mailbox%' then 'mailbox_unavailable'
                when lower(last_error) like '%smtp%' then 'smtp_error'
                else 'delivery_error'
              end as safe_error_code,
              count(*) as failure_count
            from notification_deliveries
            where club_id = ?
              and status in ('FAILED', 'DEAD')
              and updated_at >= utc_timestamp(6) - interval 7 day
            group by safe_error_code
            order by failure_count desc, safe_error_code asc
            limit 5
            """.trimIndent(),
            { rs, _ ->
                AdminClubNotificationFailureCluster(
                    rs.getString("safe_error_code"),
                    rs.getInt("failure_count"),
                )
            },
            clubId.dbString(),
        ) ?: emptyList()

    private fun aiUsage(clubId: UUID): AdminClubAiUsage =
        jdbcTemplate.queryForObject(
            """
            select
              sum(case when status in ('PENDING', 'RUNNING', 'COMMITTING') then 1 else 0 end) as active_jobs,
              sum(case when status = 'FAILED' and created_at >= timestampadd(day, -7, utc_timestamp(6)) then 1 else 0 end) as failed_recent_jobs,
              sum(case when status = 'FAILED' and created_at >= timestampadd(day, -14, utc_timestamp(6)) and created_at < timestampadd(day, -7, utc_timestamp(6)) then 1 else 0 end) as prior_failed_jobs_7d,
              sum(case when status in ('PENDING', 'RUNNING') and created_at < timestampadd(hour, -6, utc_timestamp(6)) then 1 else 0 end) as stale_candidates,
              coalesce(sum(cost_estimate_usd), 0) as cost_estimate_usd
            from ai_generation_audit_log
            where club_id = ?
            """.trimIndent(),
            { rs, _ ->
                val activeJobs = rs.getInt("active_jobs")
                val failedRecentJobs = rs.getInt("failed_recent_jobs")
                val staleCandidates = rs.getInt("stale_candidates")
                val priorFailedJobs7d = rs.getInt("prior_failed_jobs_7d")
                AdminClubAiUsage(
                    activeJobs = activeJobs,
                    failedRecentJobs = failedRecentJobs,
                    staleCandidates = staleCandidates,
                    costEstimateUsd = rs.getBigDecimal("cost_estimate_usd").formatCost(),
                    state =
                        if (activeJobs + failedRecentJobs + staleCandidates == 0) {
                            "NO_RECENT_USAGE"
                        } else {
                            "HAS_ACTIVITY"
                        },
                    priorFailedJobs7d = priorFailedJobs7d,
                )
            },
            clubId.dbString(),
        ) ?: AdminClubAiUsage(0, 0, 0, "0.0000", "NO_RECENT_USAGE", 0)

    private fun scalarInt(
        sql: String,
        clubId: UUID,
    ): Int = jdbcTemplate.queryForObject(sql, Int::class.java, clubId.dbString()) ?: 0
}

private fun BigDecimal.formatCost(): String = setScale(COST_SCALE).toPlainString()

private fun ResultSet.toClosingRiskCandidate(clubSlug: String): AdminClubClosingRiskItem? {
    val state = getString("state")
    val visibility = getString("visibility")
    val summaryPublished = !getString("public_summary").isNullOrBlank()
    val recordSaved = summaryPublished || getInt("highlight_count") > 0 || getInt("one_liner_count") > 0
    val feedbackSourceText = getString("feedback_source_text")
    val feedbackMissing = feedbackSourceText == null
    val feedbackInvalid = feedbackSourceText != null && !feedbackSourceText.contains(FEEDBACK_DOCUMENT_MARKER)
    val notificationSent = getString("latest_notification_status") in setOf("PUBLISHED", "SENT")
    val publicVisible =
        getBoolean("is_public") &&
            getTimestamp("published_at") != null &&
            getString("publication_visibility") == "PUBLIC"

    val closingState =
        when {
            feedbackInvalid -> ClosingRiskState("BLOCKED", "FEEDBACK_DOCUMENT_INVALID")
            !recordSaved -> ClosingRiskState("IN_PROGRESS", "RECORD_PACKAGE_REQUIRED")
            feedbackMissing -> ClosingRiskState("IN_PROGRESS", "FEEDBACK_DOCUMENT_REQUIRED")
            !notificationSent -> ClosingRiskState("READY", "MEMBER_NOTIFICATION_REQUIRED")
            visibility == "PUBLIC" && !publicVisible -> ClosingRiskState("READY", "PUBLIC_RECORD_REQUIRED")
            state == "PUBLISHED" || publicVisible -> null
            else -> null
        } ?: return null
    val sessionId = uuid("id")

    return AdminClubClosingRiskItem(
        sessionId = sessionId,
        sessionNumber = getInt("number"),
        bookTitle = getString("book_title"),
        meetingDate = getObject("session_date", LocalDate::class.java),
        overallState = closingState.overallState,
        primaryBlocker = closingState.primaryBlocker,
        hostClosingHref = "/clubs/$clubSlug/app/host/sessions/$sessionId/closing",
    )
}

private data class ClosingRiskState(
    val overallState: String,
    val primaryBlocker: String?,
)

private const val COST_SCALE = 4
private const val CLOSING_RISK_ITEM_LIMIT = 5
private const val CLOSING_RISK_SCAN_LIMIT = 50
private const val FEEDBACK_DOCUMENT_MARKER = "<!-- readmates-feedback:v1 -->"
