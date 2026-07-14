package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ParsedTranscriptTurn
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.ActiveClubMember
import org.springframework.stereotype.Component
import java.text.Normalizer

@Component
class TranscriptMembershipValidator {
    fun validate(
        turns: List<ParsedTranscriptTurn>,
        activeMembers: List<ActiveClubMember>,
    ): List<ValidatedTranscriptTurn> {
        val membersByName = activeMembers.groupBy { normalize(it.displayName) }
        val failures = LinkedHashMap<String, SpeakerFailure>()

        turns.forEach { turn ->
            val key = normalize(turn.speakerName)
            val submittedLabel = turn.speakerName.trim()
            when {
                key.isEmpty() || GENERIC_SPEAKER.matches(key) ->
                    failures.putIfAbsent(key, SpeakerFailure(submittedLabel, FailureKind.NOT_MEMBER))
                membersByName[key].isNullOrEmpty() ->
                    failures.putIfAbsent(key, SpeakerFailure(submittedLabel, FailureKind.NOT_MEMBER))
                membersByName.getValue(key).size != 1 ->
                    failures.putIfAbsent(key, SpeakerFailure(submittedLabel, FailureKind.AMBIGUOUS))
            }
        }
        if (failures.isNotEmpty()) {
            val code =
                if (failures.values.any { it.kind == FailureKind.AMBIGUOUS }) {
                    ErrorCode.TRANSCRIPT_SPEAKER_AMBIGUOUS
                } else {
                    ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER
                }
            val labels = failures.values.map { it.label }
            throw AiGenerationException.InvalidTranscriptSpeakers(code, labels)
        }

        return turns.map { turn ->
            val member = membersByName.getValue(normalize(turn.speakerName)).single()
            ValidatedTranscriptTurn(
                turnId = turn.turnId,
                speakerName = normalize(member.displayName),
                speakerMembershipId = member.membershipId,
                startSeconds = turn.startSeconds,
                text = turn.text,
            )
        }
    }

    private fun normalize(value: String): String = Normalizer.normalize(value.trim(), Normalizer.Form.NFC)

    private companion object {
        val GENERIC_SPEAKER = Regex("^(화자|참석자|speaker|unknown)(\\s*\\d+)?$", RegexOption.IGNORE_CASE)
    }

    private enum class FailureKind { NOT_MEMBER, AMBIGUOUS }

    private data class SpeakerFailure(
        val label: String,
        val kind: FailureKind,
    )
}
