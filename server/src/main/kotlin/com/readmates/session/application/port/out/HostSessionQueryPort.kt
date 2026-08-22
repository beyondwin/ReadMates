package com.readmates.session.application.port.out

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionListSummary
import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.CanonicalHostSessionListQuery
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostMeetingListTuple
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import java.time.Instant

interface HostSessionQueryPort {
    fun list(
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): HostSessionListPage

    fun listMode(
        host: CurrentMember,
        limit: Int,
        query: CanonicalHostSessionListQuery,
        evaluatedAt: Instant,
        cursor: HostMeetingListTuple?,
    ): HostMeetingListPageRead = error("listMode is not implemented")

    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse

    fun dashboard(host: CurrentMember): HostDashboardResult

    fun upcoming(member: CurrentMember): List<UpcomingSessionItem>

    fun scheduleDefaults(host: CurrentMember): HostSessionScheduleDefaults
}

data class HostMeetingListPageRead(
    val items: List<HostSessionListItem>,
    val last: HostMeetingListTuple?,
    val hasMore: Boolean,
    val summary: HostSessionListSummary,
)
