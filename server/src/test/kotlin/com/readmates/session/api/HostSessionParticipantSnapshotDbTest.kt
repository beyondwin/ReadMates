package com.readmates.session.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.application.service.InvitationService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class HostSessionParticipantSnapshotDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val invitationService: InvitationService,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdSessionIds = linkedSetOf<String>()
    private val createdInvitationEmails = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("session_participant_change_audit", "session_id", createdSessionIds)
            deleteWhereIn("reading_checkins", "session_id", createdSessionIds)
            deleteWhereIn("questions", "session_id", createdSessionIds)
            deleteWhereIn("one_line_reviews", "session_id", createdSessionIds)
            deleteWhereIn("long_reviews", "session_id", createdSessionIds)
            deleteWhereIn("session_participants", "session_id", createdSessionIds)
            deleteWhereIn("session_participants", "membership_id", createdMembershipIds)
            deleteWhereIn("host_session_lifecycle_audit", "session_id", createdSessionIds)
            deleteWhereIn("host_session_change_audit", "session_id", createdSessionIds)
            deleteWhereIn("session_publication_versions", "session_id", createdSessionIds)
            deleteWhereIn("sessions", "id", createdSessionIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            if (createdInvitationEmails.isNotEmpty()) {
                val placeholders = createdInvitationEmails.joinToString(",") { "?" }
                jdbcTemplate.update(
                    "delete from invitations where invited_email in ($placeholders)",
                    *createdInvitationEmails.toTypedArray(),
                )
            }
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            createdSessionIds.clear()
            createdInvitationEmails.clear()
        }
    }

    @Test
    fun `open snapshots active members and switches draft host-only to open guest readable hidden`() {
        val joinedBefore = insertActiveMember("snapshot.join.before", "열린 전 합류")
        val sessionId = createDraft("참여자 스냅샷 초안")
        createdSessionIds += sessionId
        val epochBeforeOpen = meetingEpoch()
        open(sessionId, expectedRevision = 0)

        assertThat(sessionState(sessionId)).isEqualTo("OPEN")
        assertThat(accessScope(sessionId)).isEqualTo("GUEST_READABLE")
        assertThat(siteVisibility(sessionId)).isEqualTo("HIDDEN")
        assertThat(participantSetRevision(sessionId)).isEqualTo(1)
        assertThat(activeMembershipIds(sessionId)).contains(joinedBefore, HOST_MEMBERSHIP_ID, MEMBER5_MEMBERSHIP_ID)
        assertThat(meetingEpoch()).isEqualTo(epochBeforeOpen + 1)
    }

    @Test
    fun `join after open stays out of the snapshot until an explicit add`() {
        val sessionId = createDraft("열린 뒤 가입")
        createdSessionIds += sessionId
        open(sessionId, expectedRevision = 0)
        val snapshotAfterOpen = activeMembershipIds(sessionId)
        val revisionAfterOpen = participantSetRevision(sessionId)
        val epochAfterOpen = meetingEpoch()

        val joinedAfter = insertViewerAndActivate("snapshot.join.after", "열린 뒤 합류")

        assertThat(activeMembershipIds(sessionId)).isEqualTo(snapshotAfterOpen)
        assertThat(participationStatusOrNull(sessionId, joinedAfter)).isNull()
        assertThat(participantSetRevision(sessionId)).isEqualTo(revisionAfterOpen)
        assertThat(meetingEpoch()).isEqualTo(epochAfterOpen)

        val epochBeforeAdd = meetingEpoch()
        addToCurrentSession(joinedAfter)

        assertThat(participationStatus(sessionId, joinedAfter)).isEqualTo("ACTIVE")
        assertThat(activeMembershipIds(sessionId)).contains(joinedAfter)
        assertThat(participantSetRevision(sessionId)).isEqualTo(revisionAfterOpen + 1)
        assertThat(meetingEpoch()).isEqualTo(epochBeforeAdd + 1)
        assertThat(latestAudit(sessionId, joinedAfter)).containsExactly("REMOVED", "ACTIVE", revisionAfterOpen + 1)
    }

    @Test
    fun `invitation accept after open stays out of the snapshot until an explicit add`() {
        val sessionId = createDraft("초대 후 합류")
        createdSessionIds += sessionId
        open(sessionId, expectedRevision = 0)
        val snapshotAfterOpen = activeMembershipIds(sessionId)
        val revisionAfterOpen = participantSetRevision(sessionId)
        val historical = insertActiveMember("snapshot.invite.history", "기존 응답 멤버")
        addToCurrentSession(historical)
        setHistoricalFacts(sessionId, historical, rsvp = "GOING", attendance = "ATTENDED")
        removeFromCurrentSession(historical)
        val revisionAfterHistory = participantSetRevision(sessionId)

        val invited = acceptInvitationAfterOpen("snapshot.invite.after", applyToCurrentSession = true)

        assertThat(activeMembershipIds(sessionId)).isEqualTo(snapshotAfterOpen)
        assertThat(participationStatusOrNull(sessionId, invited)).isNull()
        assertThat(participantSetRevision(sessionId)).isEqualTo(revisionAfterHistory)
        assertThat(participationStatus(sessionId, historical)).isEqualTo("REMOVED")
        assertThat(rsvpStatus(sessionId, historical)).isEqualTo("GOING")
        assertThat(attendanceStatus(sessionId, historical)).isEqualTo("ATTENDED")
        assertThat(revisionAfterOpen).isLessThan(revisionAfterHistory)

        addToCurrentSession(invited)
        assertThat(participationStatus(sessionId, invited)).isEqualTo("ACTIVE")
        assertThat(activeMembershipIds(sessionId)).contains(invited)
    }

    @Test
    fun `leave and suspend remove from the denominator without erasing historical response or attendance`() {
        val sessionId = createDraft("탈퇴와 정지")
        createdSessionIds += sessionId
        open(sessionId, expectedRevision = 0)
        val leaving = insertActiveMember("snapshot.leave", "탈퇴 멤버")
        val suspending = insertActiveMember("snapshot.suspend", "정지 멤버")
        addToCurrentSession(leaving)
        addToCurrentSession(suspending)
        setHistoricalFacts(sessionId, leaving, rsvp = "GOING", attendance = "ATTENDED")
        setHistoricalFacts(sessionId, suspending, rsvp = "MAYBE", attendance = "ABSENT")
        val denominatorBefore = activeMembershipIds(sessionId).size.toLong()
        val revisionBeforeLeave = participantSetRevision(sessionId)

        leaveClub(leaving)
        suspendMember(suspending)

        assertThat(participationStatus(sessionId, leaving)).isEqualTo("REMOVED")
        assertThat(participationStatus(sessionId, suspending)).isEqualTo("REMOVED")
        assertThat(rsvpStatus(sessionId, leaving)).isEqualTo("GOING")
        assertThat(attendanceStatus(sessionId, leaving)).isEqualTo("ATTENDED")
        assertThat(rsvpStatus(sessionId, suspending)).isEqualTo("MAYBE")
        assertThat(attendanceStatus(sessionId, suspending)).isEqualTo("ABSENT")
        assertThat(activeMembershipIds(sessionId)).doesNotContain(leaving, suspending)
        assertThat(activeMembershipIds(sessionId).size.toLong()).isEqualTo(denominatorBefore - 2)
        assertThat(participantSetRevision(sessionId)).isEqualTo(revisionBeforeLeave + 2)
        assertThat(latestAudit(sessionId, leaving)).containsExactly("ACTIVE", "REMOVED", revisionBeforeLeave + 1)
        assertThat(latestAudit(sessionId, suspending)).containsExactly("ACTIVE", "REMOVED", revisionBeforeLeave + 2)
    }

    @Test
    fun `restore does not auto add and explicit exclude then reactivate writes audit`() {
        val sessionId = createDraft("복귀와 제외")
        createdSessionIds += sessionId
        open(sessionId, expectedRevision = 0)
        val membershipId = insertActiveMember("snapshot.reactivate", "복귀 멤버")
        addToCurrentSession(membershipId)
        suspendMember(membershipId)
        val revisionAfterSuspend = participantSetRevision(sessionId)
        val epochAfterSuspend = meetingEpoch()

        restoreMember(membershipId)

        assertThat(participationStatus(sessionId, membershipId)).isEqualTo("REMOVED")
        assertThat(participantSetRevision(sessionId)).isEqualTo(revisionAfterSuspend)
        assertThat(meetingEpoch()).isEqualTo(epochAfterSuspend)

        addToCurrentSession(membershipId)
        val revisionAfterReactivate = participantSetRevision(sessionId)
        removeFromCurrentSession(membershipId)

        assertThat(participationStatus(sessionId, membershipId)).isEqualTo("REMOVED")
        assertThat(participantSetRevision(sessionId)).isEqualTo(revisionAfterReactivate + 1)
        assertThat(latestAudit(sessionId, membershipId)).containsExactly(
            "ACTIVE",
            "REMOVED",
            revisionAfterReactivate + 1,
        )
        assertThat(auditCount(sessionId, membershipId)).isGreaterThanOrEqualTo(3)
    }

    @Test
    fun `duplicate display names stay distinguishable without exposing email`() {
        val sessionId = createDraft("같은 이름")
        createdSessionIds += sessionId
        val first = insertActiveMember("snapshot.dup.one", "같은이름", displayName = "같은이름-하나")
        val second = insertActiveMember("snapshot.dup.two", "같은이름", displayName = "같은이름-둘")
        open(sessionId, expectedRevision = 0)

        val attendees =
            mockMvc
                .get("/api/host/sessions/$sessionId") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
                .get("attendees")
        val duplicated =
            buildList {
                for (index in 0 until attendees.size()) {
                    val node = attendees.get(index)
                    if (node.get("membershipId").asString() in setOf(first, second)) add(node)
                }
            }
        assertThat(duplicated).hasSize(2)
        assertThat(duplicated.map { it.get("accountName").asString() }.toSet()).containsExactly("같은이름")
        assertThat(duplicated.map { it.get("displayName").asString() }.toSet()).hasSize(2)
        assertThat(duplicated.map { it.get("avatarKey").asString() }.toSet()).hasSize(2)
        duplicated.forEach { node ->
            assertThat(node.propertyNames().toSet()).doesNotContain("email")
            assertThat(node.toPrettyString()).doesNotContain("@example.com")
        }
    }

    @Test
    fun `response denominator follows the active participant snapshot`() {
        val sessionId = createDraft("응답 분모")
        createdSessionIds += sessionId
        val extra = insertActiveMember("snapshot.denominator", "분모 멤버")
        open(sessionId, expectedRevision = 0)
        val openDenominator = activeMembershipIds(sessionId).size
        assertThat(openDenominator).isGreaterThanOrEqualTo(7)
        assertThat(pendingRsvpCount(sessionId)).isEqualTo(openDenominator.toLong())

        val lateJoin = insertViewerAndActivate("snapshot.denominator.late", "늦은 합류")
        assertThat(activeMembershipIds(sessionId)).doesNotContain(lateJoin)
        assertThat(pendingRsvpCount(sessionId)).isEqualTo(openDenominator.toLong())

        removeFromCurrentSession(extra)
        assertThat(pendingRsvpCount(sessionId)).isEqualTo(openDenominator - 1L)
        assertThat(rsvpStatus(sessionId, extra)).isEqualTo("NO_RESPONSE")
    }

    private fun createDraft(title: String): String {
        val body =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "$title",
                          "bookTitle": "스냅샷 책",
                          "bookAuthor": "스냅샷 저자",
                          "date": "2026-09-10",
                          "locationLabel": "온라인"
                        }
                        """.trimIndent()
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(body).get("sessionId").asString()
    }

    private fun open(
        sessionId: String,
        expectedRevision: Long,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedSessionRevision":$expectedRevision}"""
            }.andExpect { status { isOk() } }
    }

    private fun addToCurrentSession(membershipId: String) {
        mockMvc
            .post("/api/host/members/$membershipId/current-session/add") {
                cookie(hostCookie())
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect { status { isOk() } }
    }

    private fun removeFromCurrentSession(membershipId: String) {
        mockMvc
            .post("/api/host/members/$membershipId/current-session/remove") {
                cookie(hostCookie())
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect { status { isOk() } }
    }

    private fun suspendMember(membershipId: String) {
        mockMvc
            .post("/api/host/members/$membershipId/suspend") {
                cookie(hostCookie())
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"currentSessionPolicy":"APPLY_NOW"}"""
            }.andExpect { status { isOk() } }
    }

    private fun restoreMember(membershipId: String) {
        mockMvc
            .post("/api/host/members/$membershipId/restore") {
                cookie(hostCookie())
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect { status { isOk() } }
    }

    private fun leaveClub(membershipId: String) {
        val email =
            jdbcTemplate.queryForObject(
                """
                select users.email
                from memberships
                join users on users.id = memberships.user_id
                where memberships.id = ?
                """.trimIndent(),
                String::class.java,
                membershipId,
            ) ?: error("missing member email")
        mockMvc
            .post("/api/me/membership/leave") {
                cookie(sessionCookieForEmail(email))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"currentSessionPolicy":"APPLY_NOW"}"""
            }.andExpect { status { isOk() } }
    }

    private fun insertActiveMember(
        prefix: String,
        name: String,
        displayName: String = name,
    ): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-snapshot-$userId",
            "$prefix.${UUID.randomUUID()}@example.com",
            name,
            displayName,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), ?, ?)
            """.trimIndent(),
            membershipId,
            CLUB_ID,
            userId,
            displayName,
            if (prefix.endsWith("two")) "lemon-green-book" else "mushroom-green-book",
        )
        createdMembershipIds += membershipId
        return membershipId
    }

    private fun acceptInvitationAfterOpen(
        prefix: String,
        applyToCurrentSession: Boolean,
    ): String {
        val email = "$prefix.${UUID.randomUUID()}@example.com"
        return acceptInvitationForEmail(email, "초대 합류", applyToCurrentSession)
    }

    private fun acceptInvitationForEmail(
        email: String,
        name: String,
        applyToCurrentSession: Boolean,
    ): String {
        createdInvitationEmails += email
        val token =
            mockMvc
                .post("/api/host/invitations") {
                    cookie(hostCookie())
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "email":"$email",
                          "name":"$name",
                          "applyToCurrentSession":$applyToCurrentSession
                        }
                        """.trimIndent()
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
                .substringAfter("\"acceptUrl\":\"")
                .substringBefore("\"")
                .substringAfterLast("/")
        invitationService.acceptGoogleInvitation(
            rawToken = token,
            googleSubjectId = "google-snapshot-invite-${UUID.randomUUID()}",
            email = email,
            displayName = name,
            profileImageUrl = null,
        )
        val membershipId = membershipIdForEmail(email)
        createdMembershipIds += membershipId
        val userId =
            jdbcTemplate.queryForObject(
                "select user_id from memberships where id = ?",
                String::class.java,
                membershipId,
            )
        if (userId != null) createdUserIds += userId
        return membershipId
    }

    private fun membershipIdForEmail(email: String): String =
        jdbcTemplate.queryForObject(
            """
            select memberships.id
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
            """.trimIndent(),
            String::class.java,
            email,
        ) ?: error("missing membership")

    private fun insertViewerAndActivate(
        prefix: String,
        name: String,
    ): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-snapshot-viewer-$userId",
            "$prefix.${UUID.randomUUID()}@example.com",
            name,
            name,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'VIEWER', null, ?, 'pudding-notebook')
            """.trimIndent(),
            membershipId,
            CLUB_ID,
            userId,
            name,
        )
        createdMembershipIds += membershipId
        mockMvc
            .post("/api/host/members/$membershipId/activate") {
                cookie(hostCookie())
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect { status { isOk() } }
        return membershipId
    }

    private fun setHistoricalFacts(
        sessionId: String,
        membershipId: String,
        rsvp: String,
        attendance: String,
    ) {
        jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = ?, attendance_status = ?
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            rsvp,
            attendance,
            sessionId,
            membershipId,
        )
    }

    private fun activeMembershipIds(sessionId: String): Set<String> =
        jdbcTemplate
            .query(
                """
                select membership_id
                from session_participants
                where session_id = ? and participation_status = 'ACTIVE'
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("membership_id") },
                sessionId,
            ).toSet()

    private fun pendingRsvpCount(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            where session_id = ?
              and participation_status = 'ACTIVE'
              and rsvp_status = 'NO_RESPONSE'
            """.trimIndent(),
            Long::class.java,
            sessionId,
        ) ?: 0

    private fun participantSetRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select participant_set_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing participant set revision")

    private fun sessionState(sessionId: String): String =
        jdbcTemplate.queryForObject("select state from sessions where id = ?", String::class.java, sessionId)
            ?: error("missing state")

    private fun accessScope(sessionId: String): String =
        jdbcTemplate.queryForObject("select access_scope from sessions where id = ?", String::class.java, sessionId)
            ?: error("missing access scope")

    private fun siteVisibility(sessionId: String): String =
        jdbcTemplate.queryForObject(
            """
            select coalesce(
              (
                select site_visibility
                from public_session_publications
                where session_id = sessions.id
                limit 1
              ),
              'HIDDEN'
            )
            from sessions
            where id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
        ) ?: error("missing site visibility")

    private fun meetingEpoch(): Long =
        jdbcTemplate.queryForObject(
            "select meeting_epoch from club_host_list_epochs where club_id = ?",
            Long::class.java,
            CLUB_ID,
        ) ?: 0

    private fun participationStatus(
        sessionId: String,
        membershipId: String,
    ): String = participationStatusOrNull(sessionId, membershipId) ?: error("missing participant")

    private fun participationStatusOrNull(
        sessionId: String,
        membershipId: String,
    ): String? =
        jdbcTemplate
            .query(
                """
                select participation_status
                from session_participants
                where session_id = ? and membership_id = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("participation_status") },
                sessionId,
                membershipId,
            ).firstOrNull()

    private fun rsvpStatus(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            "select rsvp_status from session_participants where session_id = ? and membership_id = ?",
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing rsvp")

    private fun attendanceStatus(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            "select attendance_status from session_participants where session_id = ? and membership_id = ?",
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing attendance")

    private fun latestAudit(
        sessionId: String,
        membershipId: String,
    ): List<Any> {
        val row =
            jdbcTemplate
                .query(
                    """
                    select before_status, after_status, participant_set_revision, actor_membership_id, created_at
                    from session_participant_change_audit
                    where session_id = ? and membership_id = ?
                    order by created_at desc, id desc
                    limit 1
                    """.trimIndent(),
                    { resultSet, _ ->
                        listOf(
                            resultSet.getString("before_status"),
                            resultSet.getString("after_status"),
                            resultSet.getLong("participant_set_revision"),
                        )
                    },
                    sessionId,
                    membershipId,
                ).firstOrNull() ?: error("missing participant audit")
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select actor_membership_id
                from session_participant_change_audit
                where session_id = ? and membership_id = ?
                order by created_at desc, id desc
                limit 1
                """.trimIndent(),
                String::class.java,
                sessionId,
                membershipId,
            ),
        ).isNotBlank()
        return row
    }

    private fun auditCount(
        sessionId: String,
        membershipId: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participant_change_audit
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
            membershipId,
        ) ?: 0

    private fun hostCookie(): Cookie = sessionCookieForEmail("host@example.com")

    private fun sessionCookieForEmail(email: String): Cookie {
        val userId =
            jdbcTemplate.queryForObject(
                "select id from users where email = ?",
                String::class.java,
                email,
            ) ?: error("Expected seeded user for $email")
        val issuedSession =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "HostSessionParticipantSnapshotDbTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun deleteWhereIn(
        table: String,
        column: String,
        ids: Set<String>,
    ) {
        if (ids.isEmpty()) return
        val placeholders = ids.joinToString(",") { "?" }
        jdbcTemplate.update("delete from $table where $column in ($placeholders)", *ids.toTypedArray())
    }

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
        header("X-Readmates-Bff-Secret", "test-bff-secret")
        header("Origin", "http://localhost:3000")
    }

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
        const val MEMBER5_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000206"
    }
}
