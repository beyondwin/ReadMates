package com.readmates.session.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

abstract class HostSessionAtomicityDbTestSupport(
    protected val mockMvc: MockMvc,
    protected val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    protected val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    protected fun createDraft(
        title: String,
        key: String,
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
    ): Pair<String, String> {
        val body =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand(title, meetingUrl, meetingPasscode))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(body).get("sessionId").asString() to key
    }

    protected fun open(
        sessionId: String,
        revision: Long,
        key: String,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, """{"sessionRevision":$revision}""", "{}")
            }.andExpect { status { isOk() } }
    }

    protected fun envelope(
        key: String,
        expected: String,
        command: String,
    ) = """{"idempotencyKey":"$key","expected":$expected,"command":$command}"""

    protected fun closeExpected(
        sessionRevision: Long,
        participantSetRevision: Long,
        attendanceSnapshotId: String,
    ): String =
        """
        {
          "sessionRevision": $sessionRevision,
          "participantSetRevision": $participantSetRevision,
          "attendanceSnapshotId": "$attendanceSnapshotId"
        }
        """.trimIndent()

    protected fun sessionCommand(
        title: String,
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
    ): String {
        val meetingFields =
            buildString {
                if (meetingUrl != null) append(""","meetingUrl":"$meetingUrl"""")
                if (meetingPasscode != null) append(""","meetingPasscode":"$meetingPasscode"""")
            }
        return """
            {
              "title": "$title",
              "bookTitle": "영수증 책",
              "bookAuthor": "영수증 저자",
              "date": "2026-09-04",
              "locationLabel": "온라인"
              $meetingFields
            }
            """.trimIndent()
    }

    protected fun close(
        sessionId: String,
        sessionRev: Long,
        setRevision: Long,
        snapshot: String,
        key: String,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        key,
                        closeExpected(sessionRev, setRevision, snapshot),
                        "{}",
                    )
            }.andExpect { status { isOk() } }
    }

    protected fun publishVectorJson(sessionId: String): String {
        val versions = versions(sessionId)
        return """
            {"sessionRevision":${versions.session},"liveRecordRevision":${versions.live},
            "exposureRevision":${versions.exposure},"publicationRevision":${versions.publication}}
            """.trimIndent().replace("\n", "")
    }

    protected data class Versions(
        val session: Long,
        val exposure: Long,
        val live: Long,
        val publication: Long,
        val draft: Long?,
    )

    protected fun versions(sessionId: String): Versions =
        Versions(
            session = sessionRevision(sessionId),
            exposure = exposureRevision(sessionId),
            live = liveRecordRevision(sessionId),
            publication = publicationRevision(sessionId),
            draft = recordDraftRevision(sessionId),
        )

    protected fun sessionRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select session_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing revision")

    protected fun participantSetRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select participant_set_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing set revision")

    protected fun exposureRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select exposure_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing exposure revision")

    protected fun publicationRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select coalesce(publication_revision, 0) from session_publication_versions where session_id = ?",
            Long::class.java,
            sessionId,
        ) ?: 0

    protected fun liveRecordRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select coalesce(max(version), 0) from session_record_revisions where session_id = ?",
            Long::class.java,
            sessionId,
        ) ?: 0

    protected fun recordDraftRevision(sessionId: String): Long? =
        jdbcTemplate
            .query(
                "select draft_revision from session_record_drafts where session_id = ?",
                { rs, _ -> rs.getLong("draft_revision") },
                sessionId,
            ).firstOrNull()

    protected fun attendanceStatus(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select attendance_status from session_participants
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing attendance")

    protected fun attendanceSnapshotId(sessionId: String): String {
        val rows =
            jdbcTemplate.query(
                """
                select membership_id, attendance_revision
                from session_participants
                where session_id = ? and participation_status = 'ACTIVE'
                order by membership_id
                """.trimIndent(),
                { rs, _ -> "${rs.getString("membership_id")}:${rs.getLong("attendance_revision")}" },
                sessionId,
            )
        return "att:${rows.joinToString(",")}"
    }

    protected fun publicContentCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from public_session_publications
            where session_id = ? and trim(public_summary) <> ''
            """.trimIndent(),
            Int::class.java,
            sessionId,
        ) ?: 0

    protected fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    protected companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
    }
}
