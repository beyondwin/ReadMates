package com.readmates.session.api

import com.readmates.session.adapter.out.persistence.HostOperatingRoomCandidateQueries
import com.readmates.session.application.model.HostOperatingRoomCandidateState
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDateTime
import java.util.UUID

@SpringBootTest(
    properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"],
)
@Tag("integration")
class HostOperatingRoomCandidateDbTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val queries: HostOperatingRoomCandidateQueries,
) : ReadmatesMySqlIntegrationTestSupport() {
    @BeforeEach
    fun prepare() {
        cleanup()
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status) values (?, ?, ?, '', '', 'ACTIVE')",
            CLUB_ID,
            "operating-room-candidates",
            "Operating room candidates",
        )
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status) values (?, ?, ?, '', '', 'ACTIVE')",
            OTHER_CLUB_ID,
            "other-operating-room-candidates",
            "Other operating room candidates",
        )
        jdbcTemplate.update(
            "insert into users (id, email, name, short_name) values (?, ?, ?, ?)",
            USER_ID,
            "operating-room-host@example.com",
            "Operating Room Host",
            "OR Host",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'OR Host', 'globe-notebook')
            """.trimIndent(),
            HOST_MEMBERSHIP_ID,
            CLUB_ID,
            USER_ID,
        )
    }

    @AfterEach
    fun cleanup() {
        jdbcTemplate.update("delete from session_participants where session_id like '30000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from sessions where id like '30000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from memberships where id = ?", HOST_MEMBERSHIP_ID)
        jdbcTemplate.update("delete from users where id = ?", USER_ID)
        jdbcTemplate.update("delete from clubs where id in (?, ?)", CLUB_ID, OTHER_CLUB_ID)
    }

    @Test
    fun `orders open then future drafts then closed with deterministic ties and cross club unsafe rows excluded`() {
        insertSession("301", 91, "OPEN", "2026-08-30", "18:00:00")
        insertSession("302", 92, "DRAFT", "2026-08-31", "20:00:00")
        insertSession("303", 93, "DRAFT", "2026-08-30", "13:00:00")
        insertSession("304", 94, "CLOSED", "2026-08-29", "20:00:00")
        insertSession("305", 95, "CLOSED", "2026-08-28", "20:00:00")
        insertSession("306", 96, "PUBLISHED", "2026-08-30", "20:00:00")
        insertSession("307", 97, "DRAFT", "2026-08-30", "10:00:00")
        insertSession("308", 98, "CLOSED", "2026-08-31", "20:00:00", deleted = true)
        insertSession("309", 90, "DRAFT", "2026-08-30", "13:00:00")
        insertSession("310", 99, "CLOSED", "2026-08-29", "20:00:00")
        insertSession("401", 999, "OPEN", "2026-08-30", "17:00:00", clubId = OTHER_CLUB_ID)
        insertSession("402", 998, "DRAFT", "2026-08-30", "12:30:00", clubId = OTHER_CLUB_ID)
        insertSession("403", 997, "CLOSED", "2026-08-30", "23:00:00", clubId = OTHER_CLUB_ID)

        val candidates =
            queries.loadHostOperatingRoomCandidates(
                clubId = UUID.fromString(CLUB_ID),
                evaluatedAt = LocalDateTime.parse("2026-08-30T12:00:00"),
            )

        val candidateSuffixes = candidates.map { it.sessionId.toString().takeLast(3) }

        assertEquals(
            listOf("301", "309", "303", "302", "310", "304", "305"),
            candidateSuffixes,
        )
        assertEquals(emptySet<String>(), candidateSuffixes.toSet().intersect(setOf("401", "402", "403")))
        assertEquals(
            listOf(
                HostOperatingRoomCandidateState.OPEN,
                HostOperatingRoomCandidateState.DRAFT,
                HostOperatingRoomCandidateState.DRAFT,
                HostOperatingRoomCandidateState.DRAFT,
                HostOperatingRoomCandidateState.CLOSED,
                HostOperatingRoomCandidateState.CLOSED,
                HostOperatingRoomCandidateState.CLOSED,
            ),
            candidates.map { it.state },
        )
    }

    @Test
    fun `draft schedule availability requires member visibility and an active participant snapshot`() {
        insertSession(
            "311",
            101,
            "DRAFT",
            "2026-09-01",
            "20:00:00",
            accessScope = "GUEST_READABLE",
            participantSetRevision = 1,
        )
        insertSession(
            "312",
            102,
            "DRAFT",
            "2026-09-02",
            "20:00:00",
            accessScope = "HOST_ONLY",
            participantSetRevision = 1,
        )
        insertSession(
            "313",
            103,
            "DRAFT",
            "2026-09-03",
            "20:00:00",
            accessScope = "GUEST_READABLE",
            participantSetRevision = 1,
        )
        insertSession("314", 104, "DRAFT", "2026-09-04", "20:00:00", accessScope = "GUEST_READABLE")
        insertSession(
            "315",
            105,
            "CLOSED",
            "2026-08-29",
            "20:00:00",
            accessScope = "GUEST_READABLE",
            participantSetRevision = 1,
        )
        insertSession("316", 106, "OPEN", "2026-08-30", "20:00:00", accessScope = "GUEST_READABLE")
        insertParticipant("311", "ACTIVE")
        insertParticipant("312", "ACTIVE")
        insertParticipant("313", "REMOVED")
        insertParticipant("314", "ACTIVE")
        insertParticipant("315", "ACTIVE")
        insertParticipant("316", "ACTIVE")

        val candidates =
            queries.loadHostOperatingRoomCandidates(
                clubId = UUID.fromString(CLUB_ID),
                evaluatedAt = LocalDateTime.parse("2026-08-30T12:00:00"),
            )

        assertEquals(
            mapOf(
                "316" to true,
                "311" to true,
                "312" to false,
                "313" to false,
                "314" to false,
                "315" to false,
            ),
            candidates.associate { it.sessionId.toString().takeLast(3) to it.scheduleSeenAvailable },
        )
    }

    private fun insertSession(
        suffix: String,
        number: Int,
        state: String,
        date: String,
        startTime: String,
        accessScope: String = "HOST_ONLY",
        participantSetRevision: Long = 0,
        deleted: Boolean = false,
        clubId: String = CLUB_ID,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state,
              visibility, access_scope, participant_set_revision,
              deleted_at, deleted_by_membership_id, purge_after
            ) values (?, ?, ?, ?, ?, 'Author', ?, ?, '23:00:00', 'Online', ?, ?,
                      ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            sessionId(suffix),
            clubId,
            number,
            "Session $number",
            "Book $number",
            date,
            startTime,
            "$date 12:00:00",
            state,
            if (accessScope == "GUEST_READABLE" || state in setOf("CLOSED", "PUBLISHED")) {
                "MEMBER"
            } else {
                "HOST_ONLY"
            },
            accessScope,
            participantSetRevision,
            if (deleted) "2026-08-29 00:00:00" else null,
            if (deleted) HOST_MEMBERSHIP_ID else null,
            if (deleted) "2026-09-28 00:00:00" else null,
        )
    }

    private fun insertParticipant(
        sessionSuffix: String,
        participationStatus: String,
    ) {
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            ) values (uuid(), ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', ?)
            """.trimIndent(),
            CLUB_ID,
            sessionId(sessionSuffix),
            HOST_MEMBERSHIP_ID,
            participationStatus,
        )
    }

    private fun sessionId(suffix: String) = "30000000-0000-0000-0000-${suffix.padStart(12, '0')}"

    companion object {
        private const val CLUB_ID = "30000000-0000-0000-0000-000000000001"
        private const val OTHER_CLUB_ID = "30000000-0000-0000-0000-000000000002"
        private const val USER_ID = "30000000-0000-0000-0000-000000000101"
        private const val HOST_MEMBERSHIP_ID = "30000000-0000-0000-0000-000000000201"
    }
}
