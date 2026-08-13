package com.readmates.sessionrecord.adapter.out.codec

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.shared.security.Sha256
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import tools.jackson.core.JacksonException
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.util.UUID
import org.mockito.Mockito.`when` as whenever

class JacksonSessionRecordSnapshotCodecTest {
    private val codec =
        JacksonSessionRecordSnapshotCodec(
            JsonMapper.builder().findAndAddModules().build(),
        )

    @Test
    fun `encode preserves exact deterministic json hash and membership attribution`() {
        val snapshot = snapshot(SessionRecordVisibility.MEMBER)
        val expectedJson =
            "{" +
                "\"schema\":\"readmates-session-record:v1\"," +
                "\"visibility\":\"MEMBER\"," +
                "\"publicationSummary\":\"요약\"," +
                "\"highlights\":[{" +
                "\"membershipId\":\"11111111-1111-1111-1111-111111111111\"," +
                "\"authorDisplayName\":\"독자\",\"text\":\"하이라이트\"}]," +
                "\"oneLineReviews\":[{" +
                "\"membershipId\":\"11111111-1111-1111-1111-111111111111\"," +
                "\"authorDisplayName\":\"독자\",\"text\":\"한줄평\"}]," +
                "\"feedbackDocument\":{" +
                "\"fileName\":\"feedback.md\",\"title\":\"회차 피드백\"," +
                "\"markdown\":\"# 회차 피드백\"}}"

        val encoded = codec.encode(snapshot)

        assertThat(encoded.json).isEqualTo(expectedJson)
        assertThat(encoded.sha256).hasSize(64)
        assertThat(encoded.sha256).isEqualTo(Sha256.hex(expectedJson))
        assertThat(codec.encode(snapshot)).isEqualTo(encoded)
        assertThat(codec.decode(encoded.json)).isEqualTo(snapshot)
        assertThat(
            codec
                .decode(encoded.json)
                .highlights
                .single()
                .membershipId,
        ).isEqualTo(UUID.fromString("11111111-1111-1111-1111-111111111111"))
    }

    @Test
    fun `encode hashes the exact mapper bytes without trimming`() {
        val snapshot = snapshot(SessionRecordVisibility.MEMBER)
        val mapper = mock<ObjectMapper>()
        val mapperJson = "  {\"schema\":\"readmates-session-record:v1\"}\n"
        whenever(mapper.writeValueAsString(snapshot)).thenReturn(mapperJson)
        val exactBytesCodec = JacksonSessionRecordSnapshotCodec(mapper)

        val encoded = exactBytesCodec.encode(snapshot)

        assertThat(encoded.json).isEqualTo(mapperJson)
        assertThat(encoded.sha256).isEqualTo(Sha256.hex(mapperJson))
    }

    @Test
    fun `encode preserves every visibility spelling and exact schema`() {
        assertThat(SessionRecordVisibility.entries.associateWith { codec.encode(snapshot(it)).json })
            .containsOnlyKeys(
                SessionRecordVisibility.HOST_ONLY,
                SessionRecordVisibility.MEMBER,
                SessionRecordVisibility.PUBLIC,
            ).allSatisfy { visibility, json ->
                assertThat(json).contains("\"schema\":\"readmates-session-record:v1\"")
                assertThat(json).contains("\"visibility\":\"${visibility.name}\"")
                assertThat(codec.decode(json).visibility).isEqualTo(visibility)
            }
    }

    @Test
    fun `decode rejects a missing schema with the stable error`() {
        assertThatThrownBy {
            codec.decode(validJson().replace("\"schema\":\"readmates-session-record:v1\",", ""))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Unsupported session record snapshot schema")
    }

    @Test
    fun `decode rejects an unknown schema with the stable error`() {
        assertThatThrownBy {
            codec.decode(validJson().replace("readmates-session-record:v1", "readmates-session-record:v2"))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Unsupported session record snapshot schema")
    }

    @Test
    fun `decode rejects malformed json before deserialization`() {
        assertThatThrownBy { codec.decode("{\"schema\":") }
            .isInstanceOf(JacksonException::class.java)
    }

    private fun snapshot(visibility: SessionRecordVisibility) =
        SessionRecordSnapshot(
            visibility = visibility,
            publicationSummary = "요약",
            highlights = listOf(SessionRecordEntry(MEMBER_ID, "독자", "하이라이트")),
            oneLineReviews = listOf(SessionRecordEntry(MEMBER_ID, "독자", "한줄평")),
            feedbackDocument =
                SessionRecordFeedbackDocument(
                    fileName = "feedback.md",
                    title = "회차 피드백",
                    markdown = "# 회차 피드백",
                ),
        )

    private fun validJson(): String = codec.encode(snapshot(SessionRecordVisibility.MEMBER)).json

    private companion object {
        val MEMBER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111111")
    }
}
