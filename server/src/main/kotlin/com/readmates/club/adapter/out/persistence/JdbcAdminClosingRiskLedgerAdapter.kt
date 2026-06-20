package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.port.out.AdminClosingRiskLedgerPort
import com.readmates.club.application.port.out.AdminClubClosingRiskLedgerSync
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.temporal.ChronoUnit
import java.util.UUID

@Repository
class JdbcAdminClosingRiskLedgerAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminClosingRiskLedgerPort {
    override fun syncToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): List<AdminTodayClosingRiskItem> {
        upsertActiveToday(items, observedAt)
        resolveMissingForClubs(clubsToResolveForToday(items), items.map { it.sessionId }.toSet(), observedAt)
        val rows = loadRows(items.map { it.sessionId }.toSet()).associateBy { it.sessionId }
        return items.map { item -> item.withTracking(rows[item.sessionId], observedAt) }
    }

    override fun syncClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskLedgerSync {
        upsertActiveClub(clubId, items, observedAt)
        resolveMissingForClub(clubId, items.map { it.sessionId }.toSet(), observedAt)
        val rows = loadRowsForClub(clubId)
        val activeBySession = rows.filterNot { it.currentState == LEDGER_STATE_RESOLVED }.associateBy { it.sessionId }
        return AdminClubClosingRiskLedgerSync(
            activeItems = items.map { item -> item.withTracking(activeBySession[item.sessionId], observedAt) },
            recentlyResolvedItems =
                rows
                    .filter { it.currentState == LEDGER_STATE_RESOLVED && it.resolvedAt != null }
                    .take(RECENTLY_RESOLVED_LIMIT)
                    .map { row -> row.toResolvedClubRisk(observedAt) },
        )
    }

    private fun upsertActiveToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ) {
        for (item in items) {
            upsertOne(
                clubId = item.clubId,
                sessionId = item.sessionId,
                currentState = item.overallState,
                primaryBlocker = item.primaryBlocker,
                hostClosingHref = item.hostClosingHref,
                observedAt = observedAt,
            )
        }
    }

    private fun upsertActiveClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ) {
        for (item in items) {
            upsertOne(
                clubId = clubId,
                sessionId = item.sessionId,
                currentState = item.overallState,
                primaryBlocker = item.primaryBlocker,
                hostClosingHref = item.hostClosingHref,
                observedAt = observedAt,
            )
        }
    }

    private fun upsertOne(
        clubId: UUID,
        sessionId: UUID,
        currentState: String,
        primaryBlocker: String?,
        hostClosingHref: String,
        observedAt: OffsetDateTime,
    ) {
        val existing = loadRows(setOf(sessionId)).firstOrNull()
        if (existing == null) {
            jdbcTemplate.update(
                """
                insert into admin_closing_risk_ledger (
                  id, club_id, session_id, current_state, primary_blocker,
                  first_detected_at, last_seen_at, resolved_at, occurrence_count, last_host_closing_href
                )
                values (?, ?, ?, ?, ?, ?, ?, null, 1, ?)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                clubId.dbString(),
                sessionId.dbString(),
                currentState,
                primaryBlocker,
                observedAt.toUtcLocalDateTime(),
                observedAt.toUtcLocalDateTime(),
                hostClosingHref,
            )
            return
        }

        jdbcTemplate.update(
            """
            update admin_closing_risk_ledger
            set current_state = ?,
                primary_blocker = ?,
                last_seen_at = ?,
                resolved_at = null,
                occurrence_count = occurrence_count + ?,
                last_host_closing_href = ?
            where club_id = ?
              and session_id = ?
            """.trimIndent(),
            currentState,
            primaryBlocker,
            observedAt.toUtcLocalDateTime(),
            if (existing.currentState == LEDGER_STATE_RESOLVED) 1 else 0,
            hostClosingHref,
            clubId.dbString(),
            sessionId.dbString(),
        )
    }

    private fun resolveMissingForClubs(
        clubIds: Set<UUID>,
        activeSessionIds: Set<UUID>,
        observedAt: OffsetDateTime,
    ) {
        for (clubId in clubIds) {
            resolveMissingForClub(clubId, activeSessionIds, observedAt)
        }
    }

    private fun resolveMissingForClub(
        clubId: UUID,
        activeSessionIds: Set<UUID>,
        observedAt: OffsetDateTime,
    ) {
        val activeRows = loadRowsForClub(clubId).filterNot { it.currentState == LEDGER_STATE_RESOLVED }
        for (row in activeRows.filterNot { activeSessionIds.contains(it.sessionId) }) {
            jdbcTemplate.update(
                """
                update admin_closing_risk_ledger
                set current_state = ?,
                    resolved_at = ?
                where club_id = ?
                  and session_id = ?
                """.trimIndent(),
                LEDGER_STATE_RESOLVED,
                observedAt.toUtcLocalDateTime(),
                clubId.dbString(),
                row.sessionId.dbString(),
            )
        }
    }

    private fun clubsToResolveForToday(items: List<AdminTodayClosingRiskItem>): Set<UUID> =
        if (items.isEmpty()) loadActiveLedgerClubIds() else emptySet()

    private fun loadActiveLedgerClubIds(): Set<UUID> =
        jdbcTemplate
            .query(
                """
                select distinct club_id
                from admin_closing_risk_ledger
                where current_state <> ?
                """.trimIndent(),
                { rs, _ -> rs.uuid("club_id") },
                LEDGER_STATE_RESOLVED,
            ).toSet()

    private fun loadRows(sessionIds: Set<UUID>): List<LedgerRow> {
        if (sessionIds.isEmpty()) return emptyList()
        val placeholders = sessionIds.joinToString(",") { "?" }
        return jdbcTemplate.query(
            """
            select l.*, s.number, s.book_title, s.session_date
            from admin_closing_risk_ledger l
            join sessions s on s.id = l.session_id
            where l.session_id in ($placeholders)
            """.trimIndent(),
            { rs, _ -> rs.toLedgerRow() },
            *sessionIds.map { it.dbString() }.toTypedArray(),
        )
    }

    private fun loadRowsForClub(clubId: UUID): List<LedgerRow> =
        jdbcTemplate.query(
            """
            select l.*, s.number, s.book_title, s.session_date
            from admin_closing_risk_ledger l
            join sessions s on s.id = l.session_id
            where l.club_id = ?
            order by coalesce(l.resolved_at, l.last_seen_at) desc, s.number desc
            """.trimIndent(),
            { rs, _ -> rs.toLedgerRow() },
            clubId.dbString(),
        )

    private fun ResultSet.toLedgerRow(): LedgerRow =
        LedgerRow(
            clubId = uuid("club_id"),
            sessionId = uuid("session_id"),
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            meetingDate = getObject("session_date", LocalDate::class.java),
            currentState = getString("current_state"),
            primaryBlocker = getString("primary_blocker"),
            firstDetectedAt = utcOffsetDateTime("first_detected_at"),
            lastSeenAt = utcOffsetDateTime("last_seen_at"),
            resolvedAt = utcOffsetDateTimeOrNull("resolved_at"),
            occurrenceCount = getInt("occurrence_count"),
            hostClosingHref = getString("last_host_closing_href"),
        )

    private fun AdminTodayClosingRiskItem.withTracking(
        row: LedgerRow?,
        observedAt: OffsetDateTime,
    ): AdminTodayClosingRiskItem =
        if (row == null) {
            copy(ledgerState = LEDGER_STATE_UNTRACKED)
        } else {
            copy(
                firstDetectedAt = row.firstDetectedAt,
                lastSeenAt = row.lastSeenAt,
                resolvedAt = row.resolvedAt,
                ageDays = ageDays(row.firstDetectedAt, observedAt),
                occurrenceCount = row.occurrenceCount,
                ledgerState = row.toResponseLedgerState(),
            )
        }

    private fun AdminClubClosingRiskItem.withTracking(
        row: LedgerRow?,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskItem =
        if (row == null) {
            copy(ledgerState = LEDGER_STATE_UNTRACKED)
        } else {
            copy(
                firstDetectedAt = row.firstDetectedAt,
                lastSeenAt = row.lastSeenAt,
                resolvedAt = row.resolvedAt,
                ageDays = ageDays(row.firstDetectedAt, observedAt),
                occurrenceCount = row.occurrenceCount,
                ledgerState = row.toResponseLedgerState(),
            )
        }

    private fun LedgerRow.toResolvedClubRisk(observedAt: OffsetDateTime): AdminClubClosingRiskItem =
        AdminClubClosingRiskItem(
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            meetingDate = meetingDate,
            overallState = LEDGER_STATE_RESOLVED,
            primaryBlocker = primaryBlocker,
            hostClosingHref = hostClosingHref,
            firstDetectedAt = firstDetectedAt,
            lastSeenAt = lastSeenAt,
            resolvedAt = resolvedAt,
            ageDays = ageDays(firstDetectedAt, observedAt),
            occurrenceCount = occurrenceCount,
            ledgerState = LEDGER_STATE_RESOLVED,
        )

    private fun LedgerRow.toResponseLedgerState(): String =
        if (currentState == LEDGER_STATE_RESOLVED) LEDGER_STATE_RESOLVED else LEDGER_STATE_ACTIVE

    private fun ageDays(
        firstDetectedAt: OffsetDateTime,
        observedAt: OffsetDateTime,
    ): Long = ChronoUnit.DAYS.between(firstDetectedAt.toLocalDate(), observedAt.toLocalDate()).coerceAtLeast(0)

    private data class LedgerRow(
        val clubId: UUID,
        val sessionId: UUID,
        val sessionNumber: Int,
        val bookTitle: String,
        val meetingDate: LocalDate,
        val currentState: String,
        val primaryBlocker: String?,
        val firstDetectedAt: OffsetDateTime,
        val lastSeenAt: OffsetDateTime,
        val resolvedAt: OffsetDateTime?,
        val occurrenceCount: Int,
        val hostClosingHref: String,
    )
}

private const val LEDGER_STATE_ACTIVE = "ACTIVE"
private const val LEDGER_STATE_RESOLVED = "RESOLVED"
private const val LEDGER_STATE_UNTRACKED = "UNTRACKED"
private const val RECENTLY_RESOLVED_LIMIT = 5
