package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.LoadAiGenerationClubMembersPort
import org.springframework.stereotype.Service
import java.util.UUID

data class GroundedTranscriptPreflight(
    val normalizedTranscript: String,
    val validatedTurns: List<ValidatedTranscriptTurn>,
)

@Service
class GroundedTranscriptPreflightService(
    private val transcriptParser: TranscriptParser,
    private val memberDirectory: LoadAiGenerationClubMembersPort,
    private val membershipValidator: TranscriptMembershipValidator,
) {
    fun preflight(
        clubId: UUID,
        transcript: String,
    ): GroundedTranscriptPreflight {
        val parsed = transcriptParser.parse(transcript)
        val activeMembers = memberDirectory.loadActiveMembers(clubId)
        val validatedTurns = membershipValidator.validate(parsed.turns, activeMembers)
        return GroundedTranscriptPreflight(parsed.normalizedTranscript, validatedTurns)
    }
}
