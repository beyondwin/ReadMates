package com.readmates.session.application.port.out

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember

interface HostSessionQueryPort {
    fun list(
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): HostSessionListPage

    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse

    fun dashboard(host: CurrentMember): HostDashboardResult

    fun upcoming(member: CurrentMember): List<UpcomingSessionItem>
}
