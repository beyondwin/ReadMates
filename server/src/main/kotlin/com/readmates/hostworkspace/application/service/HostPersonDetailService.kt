package com.readmates.hostworkspace.application.service

import com.readmates.hostworkspace.application.model.HOST_PERSON_MAX_PAGE_SIZE
import com.readmates.hostworkspace.application.model.HostPersonAttendanceHistoryPage
import com.readmates.hostworkspace.application.model.HostPersonDetail
import com.readmates.hostworkspace.application.model.HostPersonDetailAccessDeniedException
import com.readmates.hostworkspace.application.model.HostPersonDetailNotFoundException
import com.readmates.hostworkspace.application.model.HostPersonDetailQuery
import com.readmates.hostworkspace.application.model.HostPersonDetailRequest
import com.readmates.hostworkspace.application.model.HostPersonInvalidRequestException
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.hostworkspace.application.port.`in`.GetHostPersonDetailUseCase
import com.readmates.hostworkspace.application.port.out.HostPersonDetailQueryPort
import org.springframework.stereotype.Service
import java.time.temporal.ChronoUnit

@Service
class HostPersonDetailService(
    private val queryPort: HostPersonDetailQueryPort,
) : GetHostPersonDetailUseCase {
    override fun get(request: HostPersonDetailRequest): HostPersonDetail {
        validate(request)
        val projection = loadProjection(request)
        val visibleItems = projection.attendanceItems.take(request.limit)
        val terminal = projection.status in setOf(HostPersonMembershipStatus.LEFT, HostPersonMembershipStatus.INACTIVE)
        return HostPersonDetail(
            membershipId = projection.membershipId,
            displayName = if (terminal) "탈퇴한 멤버" else projection.displayName,
            avatarKey = if (terminal) "cloud-green-book" else projection.avatarKey,
            status = projection.status,
            role = projection.role,
            lastClubAccessAt = projection.lastClubAccessAt?.truncatedTo(ChronoUnit.HOURS).takeUnless { terminal },
            currentSchedule = projection.currentSchedule.takeUnless { terminal },
            currentRsvp = projection.currentRsvp.takeUnless { terminal },
            attendanceHistory =
                HostPersonAttendanceHistoryPage(
                    items = visibleItems,
                    next = visibleItems.lastOrNull()?.tuple.takeIf { projection.attendanceItems.size > request.limit },
                    historyFingerprint = projection.attendanceHistoryFingerprint,
                ),
        )
    }

    private fun validate(request: HostPersonDetailRequest) {
        if (!request.actor.activeHost) throw HostPersonDetailAccessDeniedException()
        if (request.limit !in 1..HOST_PERSON_MAX_PAGE_SIZE) throw HostPersonInvalidRequestException()
    }

    private fun loadProjection(request: HostPersonDetailRequest) =
        queryPort.load(
            HostPersonDetailQuery(
                clubId = request.actor.clubId,
                targetMembershipId = request.targetMembershipId,
                evaluatedAt = request.cursor.evaluatedAt,
                after = request.cursor.last,
                fetchLimit = request.limit + 1,
                expectedHistoryFingerprint = request.cursor.historyFingerprint,
            ),
        ) ?: throw HostPersonDetailNotFoundException()
}
