package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class TranscriptParserTest {
    private val parser = TranscriptParser()

    private val exportedDiscussion =
        """
        7회차 독서모임
        2026. 7. 14. 오후 7:30 · 58분 12초
        가람, 나래

        가람 00:00
        첫 번째 공개 테스트 발언입니다.
        둘째 줄도 같은 발언입니다.

        나래 01:05
        두 번째 공개 테스트 발언입니다.
        """.trimIndent()

    @Test
    fun `parses BOM export header and multiline turns with stable ids`() {
        val parsed = parser.parse("\uFEFF$exportedDiscussion")

        assertThat(parsed.turns.map { it.turnId }).containsExactly("t000001", "t000002")
        assertThat(parsed.turns.map { it.speakerName }).containsExactly("가람", "나래")
        assertThat(parsed.turns[0].text).isEqualTo("첫 번째 공개 테스트 발언입니다.\n둘째 줄도 같은 발언입니다.")
        assertThat(parsed.turns[1].startSeconds).isEqualTo(65)
        assertThat(parsed.normalizedTranscript).doesNotStartWith("\uFEFF")
    }

    @Test
    fun `accepts transcript without export preamble and normalizes line endings`() {
        val parsed = parser.parse("가람 00:00\r\n공개 테스트 발언입니다.\r\n\r\n나래 00:01\r다음 발언입니다.")

        assertThat(parsed.turns).hasSize(2)
        assertThat(parsed.normalizedTranscript).doesNotContain("\r")
    }

    @Test
    fun `normalizes trailing whitespace while preserving paragraph breaks`() {
        val parsed = parser.parse("가람 00:00   \r\n첫 줄입니다.   \r\n\t\r\n둘째 줄입니다.\t")

        assertThat(parsed.normalizedTranscript).isEqualTo("가람 00:00\n첫 줄입니다.\n\n둘째 줄입니다.")
        assertThat(parsed.turns.single().text).isEqualTo("첫 줄입니다.\n\n둘째 줄입니다.")
    }

    @Test
    fun `accepts a turn at exactly three hours`() {
        val parsed = parser.parse("가람 180:00\n경계 시각의 공개 테스트 발언입니다.")

        assertThat(parsed.turns.single().startSeconds).isEqualTo(10_800)
    }

    @Test
    fun `parses generic speaker labels so membership preflight owns the typed rejection`() {
        val parsed = parser.parse("화자 1 00:00\n공개 테스트 발언입니다.")

        assertThat(parsed.turns.single().speakerName).isEqualTo("화자 1")
    }

    @Test
    fun `participant preamble comparison uses NFC plus trim`() {
        val decomposedGaram = "\u1100\u1161람"
        val parsed =
            parser.parse(
                "모임\n2026. 7. 14. 오후 7:30 · 1분 0초\n가람\n\n$decomposedGaram 00:00\n공개 테스트 발언입니다.",
            )

        assertThat(parsed.turns.single().speakerName).isEqualTo(decomposedGaram)
    }

    @Test
    fun `rejects an empty transcript with a typed safe code`() {
        assertCoded(ErrorCode.TRANSCRIPT_EMPTY, " \n\t")
    }

    @Test
    fun `rejects malformed transcript forms without echoing input`() {
        val cases =
            listOf(
                "임의 메모\n가람 00:00\n공개 테스트 발언입니다.",
                "가람 00:00\n\n나래 00:01\n두 번째 발언입니다.",
                "가람 03:00:00\n지원하지 않는 시각입니다.",
                "가람 00:02\n첫 발언입니다.\n\n나래 00:02\n같은 시각입니다.",
                "가람 00:02\n첫 발언입니다.\n\n나래 00:01\n감소한 시각입니다.",
                "${"제".repeat(201)}\n2026. 7. 14. 오후 7:30 · 58분 12초\n가람 00:00\n발언입니다.",
                "모임\n2026. 7. 14. 오후 7:30 · 58분 12초\n${"가".repeat(501)}\n가람 00:00\n발언입니다.",
                "모임\n2026. 7. 14. 오후 7:30 · 58분 12초\n임의 메모\n가람 00:00\n발언입니다.",
                "가람 00:00\n\u0000\u0007",
                "가람 00:00\n\u200B\u202E\uFEFF",
            )

        cases.forEach { transcript ->
            assertThatThrownBy { parser.parse(transcript) }
                .isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { coded ->
                    assertThat(coded.code).isEqualTo(ErrorCode.TRANSCRIPT_FORMAT_INVALID)
                    assertThat(coded.message).doesNotContain(transcript)
                }
        }
    }

    @Test
    fun `rejects timestamps beyond three hours with a distinct code`() {
        assertCoded(ErrorCode.TRANSCRIPT_DURATION_EXCEEDED, "가람 180:01\n경계를 넘은 발언입니다.")
    }

    private fun assertCoded(
        expected: ErrorCode,
        transcript: String,
    ) {
        assertThatThrownBy { parser.parse(transcript) }
            .isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { coded ->
                assertThat(coded.code).isEqualTo(expected)
            }
    }
}
