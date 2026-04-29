package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class SaveMemberArchiveLongReviewRequest(
    @field:NotBlank val body: String = "",
)

data class SaveMemberArchiveLongReviewResponse(
    val sessionId: UUID,
    val body: String,
)

@RestController
@RequestMapping("/api/archive/sessions/{sessionId}/my-long-review")
class MemberArchiveReviewController(
    private val saveMemberArchiveLongReviewUseCase: SaveMemberArchiveLongReviewUseCase,
) {
    @PutMapping
    fun save(
        currentMember: CurrentMember,
        @PathVariable sessionId: UUID,
        @Valid @RequestBody request: SaveMemberArchiveLongReviewRequest,
    ): SaveMemberArchiveLongReviewResponse {
        val result = saveMemberArchiveLongReviewUseCase.save(
            SaveMemberArchiveLongReviewCommand(
                member = currentMember,
                sessionId = sessionId,
                body = request.body,
            ),
        )
        return SaveMemberArchiveLongReviewResponse(
            sessionId = result.sessionId,
            body = result.body,
        )
    }
}
