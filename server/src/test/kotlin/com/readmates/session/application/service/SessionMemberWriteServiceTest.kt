package com.readmates.session.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.out.SessionParticipationWritePort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class SessionMemberWriteServiceTest {
    private val member = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        email = "member@example.com",
        displayName = "멤버",
        shortName = "멤버",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `delegates rsvp update to write port`() {
        val port = RecordingSessionParticipationWritePort()
        val service = SessionMemberWriteService(port)

        val result = service.updateRsvp(UpdateRsvpCommand(member, "GOING"))

        assertEquals("GOING", result.status)
        assertEquals("updateRsvp:GOING", port.calls.single())
    }

    @Test
    fun `delegates checkin save to write port`() {
        val port = RecordingSessionParticipationWritePort()
        val service = SessionMemberWriteService(port)

        val result = service.saveCheckin(SaveCheckinCommand(member, 80, "메모"))

        assertEquals(80, result.readingProgress)
        assertEquals("메모", result.note)
        assertEquals("saveCheckin:80:메모", port.calls.single())
    }

    @Test
    fun `delegates question replacement to write port`() {
        val port = RecordingSessionParticipationWritePort()
        val service = SessionMemberWriteService(port)

        val result = service.replaceQuestions(
            ReplaceQuestionsCommand(member, listOf("첫 질문", "둘째 질문")),
        )

        assertEquals(listOf("첫 질문", "둘째 질문"), result.questions.map { it.text })
        assertEquals("replaceQuestions:첫 질문|둘째 질문", port.calls.single())
    }

    private class RecordingSessionParticipationWritePort : SessionParticipationWritePort {
        val calls = mutableListOf<String>()

        override fun updateRsvp(command: UpdateRsvpCommand) =
            com.readmates.session.application.model.RsvpResult(command.status)
                .also { calls += "updateRsvp:${command.status}" }

        override fun saveCheckin(command: SaveCheckinCommand) =
            com.readmates.session.application.model.CheckinResult(command.readingProgress, command.note)
                .also { calls += "saveCheckin:${command.readingProgress}:${command.note}" }

        override fun saveQuestion(command: SaveQuestionCommand) =
            com.readmates.session.application.model.QuestionResult(command.priority, command.text, command.draftThought)
                .also { calls += "saveQuestion:${command.priority}:${command.text}" }

        override fun replaceQuestions(command: ReplaceQuestionsCommand) =
            ReplaceQuestionsResult(command.texts.mapIndexed { index, text ->
                com.readmates.session.application.model.QuestionResult(index + 1, text, null)
            }).also { calls += "replaceQuestions:${command.texts.joinToString("|")}" }

        override fun saveOneLineReview(command: com.readmates.session.application.model.SaveOneLineReviewCommand) =
            com.readmates.session.application.model.OneLineReviewResult(command.text)

        override fun saveLongReview(command: com.readmates.session.application.model.SaveLongReviewCommand) =
            com.readmates.session.application.model.LongReviewResult(command.body)
    }
}
