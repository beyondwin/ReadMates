package com.readmates.sessionrecord.application.service

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.shared.security.Sha256
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class SessionRecordSnapshotCodecTest {
    private val codec =
        SessionRecordSnapshotCodec(
            JsonMapper.builder().findAndAddModules().build(),
        )

    @Test
    fun `snapshot codec is deterministic and keeps membership attribution`() {
        val memberId = UUID.randomUUID()
        val snapshot =
            SessionRecordSnapshot(
                visibility = SessionRecordVisibility.MEMBER,
                publicationSummary = "요약",
                highlights = listOf(SessionRecordEntry(memberId, "독자", "하이라이트")),
                oneLineReviews = listOf(SessionRecordEntry(memberId, "독자", "한줄평")),
                feedbackDocument =
                    SessionRecordFeedbackDocument(
                        fileName = "feedback.md",
                        title = "회차 피드백",
                        markdown = "# 회차 피드백",
                    ),
            )

        val encoded = codec.encode(snapshot)

        assertEquals(snapshot, codec.decode(encoded.json))
        assertEquals(64, encoded.sha256.length)
        assertEquals(Sha256.hex(encoded.json), encoded.sha256)
        assertEquals(encoded, codec.encode(snapshot))
    }

    @Test
    fun `snapshot codec rejects a missing schema`() {
        val json =
            """
            {
              "visibility": "MEMBER",
              "publicationSummary": "요약",
              "highlights": [],
              "oneLineReviews": [],
              "feedbackDocument": {
                "fileName": "feedback.md",
                "title": "회차 피드백",
                "markdown": "# 회차 피드백"
              }
            }
            """.trimIndent()

        assertThrows(IllegalArgumentException::class.java) {
            codec.decode(json)
        }
    }

    @Test
    fun `snapshot codec rejects an unknown schema`() {
        val json =
            """
            {
              "schema": "readmates-session-record:v2",
              "visibility": "MEMBER",
              "publicationSummary": "요약",
              "highlights": [],
              "oneLineReviews": [],
              "feedbackDocument": {
                "fileName": "feedback.md",
                "title": "회차 피드백",
                "markdown": "# 회차 피드백"
              }
            }
            """.trimIndent()

        assertThrows(IllegalArgumentException::class.java) {
            codec.decode(json)
        }
    }
}
