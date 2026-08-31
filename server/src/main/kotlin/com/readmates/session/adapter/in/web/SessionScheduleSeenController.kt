@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.MarkScheduleSeenCommand
import com.readmates.session.application.port.`in`.MarkCurrentScheduleSeenUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime

data class MarkScheduleSeenRequest(
    @field:Positive
    val scheduleRevision: Long,
)

data class ScheduleSeenResponse(
    val scheduleRevision: Long,
    val seenAt: OffsetDateTime,
)

@RestController
@RequestMapping("/api/sessions/current/schedule-seen")
class SessionScheduleSeenController(
    private val markCurrentScheduleSeenUseCase: MarkCurrentScheduleSeenUseCase,
) {
    @PutMapping
    fun markSeen(
        @Valid @RequestBody request: MarkScheduleSeenRequest,
        member: CurrentMember,
    ): ScheduleSeenResponse {
        val result =
            markCurrentScheduleSeenUseCase.markSeen(
                MarkScheduleSeenCommand(
                    member = member,
                    scheduleRevision = request.scheduleRevision,
                ),
            )
        return ScheduleSeenResponse(
            scheduleRevision = result.scheduleRevision,
            seenAt = result.seenAt,
        )
    }
}
