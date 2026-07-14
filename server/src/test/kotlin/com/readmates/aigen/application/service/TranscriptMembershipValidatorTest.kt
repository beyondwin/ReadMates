package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ParsedTranscriptTurn
import com.readmates.aigen.application.port.out.ActiveClubMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class TranscriptMembershipValidatorTest {
    private val validator = TranscriptMembershipValidator()
    private val garamId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val naraeId = UUID.fromString("00000000-0000-0000-0000-000000000202")

    @Test
    fun `speaker set may be a subset of active club members`() {
        val validated =
            validator.validate(
                turns = listOf(turn("가람")),
                activeMembers = listOf(member(garamId, "가람"), member(naraeId, "나래")),
            )

        val validatedTurn = validated.single()
        assertThat(validatedTurn.speakerMembershipId).isEqualTo(garamId)
        assertThat(validatedTurn.speakerName).isEqualTo("가람")
    }

    @Test
    fun `NFC plus trim matches while comparison remains case sensitive`() {
        val decomposedGaram = "\u1100\u1161람"

        val validated =
            validator.validate(
                turns = listOf(turn("  $decomposedGaram  ")),
                activeMembers = listOf(member(garamId, "가람")),
            )
        assertThat(validated.single().speakerMembershipId).isEqualTo(garamId)

        assertInvalid(ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER, listOf("alice")) {
            validator.validate(listOf(turn("alice")), listOf(member(garamId, "Alice")))
        }
    }

    @Test
    fun `validated speaker name is emitted in canonical NFC form`() {
        val decomposed = "A\u0301lice"

        val validated = validator.validate(listOf(turn("Álice")), listOf(member(garamId, decomposed)))

        assertThat(validated.single().speakerName).isEqualTo("Álice")
    }

    @Test
    fun `rejects inactive other club generic and absent speakers`() {
        assertInvalid(
            ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER,
            listOf("비활성", "다른클럽", "없는이름", "화자 1", "참석자 1", "speaker", "unknown"),
        ) {
            validator.validate(
                turns =
                    listOf(
                        turn("비활성", 1),
                        turn("다른클럽", 2),
                        turn("없는이름", 3),
                        turn("화자 1", 4),
                        turn("참석자 1", 5),
                        turn("speaker", 6),
                        turn("unknown", 7),
                    ),
                activeMembers = listOf(member(garamId, "가람")),
            )
        }
    }

    @Test
    fun `generic label remains rejected even when an active display name collides`() {
        assertInvalid(ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER, listOf("참석자 1")) {
            validator.validate(
                turns = listOf(turn("참석자 1")),
                activeMembers = listOf(member(garamId, "참석자 1")),
            )
        }
    }

    @Test
    fun `rejects duplicate active member names after normalization`() {
        assertInvalid(ErrorCode.TRANSCRIPT_SPEAKER_AMBIGUOUS, listOf("가람")) {
            validator.validate(
                turns = listOf(turn("가람")),
                activeMembers =
                    listOf(
                        member(garamId, "가람"),
                        member(naraeId, " \u1100\u1161람 "),
                    ),
            )
        }
    }

    @Test
    fun `deduplicates invalid labels in first seen order`() {
        assertInvalid(ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER, listOf("없는이름", "화자")) {
            validator.validate(
                turns = listOf(turn("없는이름", 1), turn("화자", 2), turn("없는이름", 3)),
                activeMembers = emptyList(),
            )
        }
    }

    @Test
    fun `preserves first seen order across ambiguous and absent labels`() {
        assertInvalid(ErrorCode.TRANSCRIPT_SPEAKER_AMBIGUOUS, listOf("가람", "없는이름")) {
            validator.validate(
                turns = listOf(turn("가람", 1), turn("없는이름", 2)),
                activeMembers = listOf(member(garamId, "가람"), member(naraeId, " \u1100\u1161람 ")),
            )
        }
    }

    private fun assertInvalid(
        expectedCode: ErrorCode,
        expectedLabels: List<String>,
        action: () -> Unit,
    ) {
        assertThatThrownBy(action)
            .isInstanceOfSatisfying(AiGenerationException.InvalidTranscriptSpeakers::class.java) { error ->
                assertThat(error.code).isEqualTo(expectedCode)
                assertThat(error.invalidSpeakerLabels).containsExactlyElementsOf(expectedLabels)
                expectedLabels.forEach { label -> assertThat(error.message).doesNotContain(label) }
            }
    }

    private fun member(
        id: UUID,
        name: String,
    ) = ActiveClubMember(id, name)

    private fun turn(
        speaker: String,
        ordinal: Int = 1,
    ) = ParsedTranscriptTurn(
        turnId = "t${ordinal.toString().padStart(6, '0')}",
        speakerName = speaker,
        startSeconds = ordinal,
        text = "공개 테스트 발언입니다.",
    )
}
