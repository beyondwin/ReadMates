package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.port.`in`.GetArchiveSessionDetailUseCase
import com.readmates.archive.application.port.`in`.ListArchiveSessionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveQuestionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveReviewsUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/archive")
class ArchiveController(
    private val listArchiveSessionsUseCase: ListArchiveSessionsUseCase,
    private val getArchiveSessionDetailUseCase: GetArchiveSessionDetailUseCase,
    private val listMyArchiveQuestionsUseCase: ListMyArchiveQuestionsUseCase,
    private val listMyArchiveReviewsUseCase: ListMyArchiveReviewsUseCase,
) {
    @GetMapping("/sessions")
    fun sessions(currentMember: CurrentMember): List<ArchiveSessionItem> =
        listArchiveSessionsUseCase.listArchiveSessions(currentMember)
            .map { it.toWebDto() }

    @GetMapping("/sessions/{sessionId}")
    fun sessionDetail(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
    ): MemberArchiveSessionDetailResponse =
        getArchiveSessionDetailUseCase.getArchiveSessionDetail(currentMember, parseSessionId(sessionId))
            ?.toWebDto()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/me/questions")
    fun myQuestions(currentMember: CurrentMember): List<MyArchiveQuestionItem> =
        listMyArchiveQuestionsUseCase.listMyQuestions(currentMember)
            .map { it.toWebDto() }

    @GetMapping("/me/reviews")
    fun myReviews(currentMember: CurrentMember): List<MyArchiveReviewItem> =
        listMyArchiveReviewsUseCase.listMyReviews(currentMember)
            .map { it.toWebDto() }

    private fun parseSessionId(sessionId: String): UUID =
        runCatching { UUID.fromString(sessionId) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
}
