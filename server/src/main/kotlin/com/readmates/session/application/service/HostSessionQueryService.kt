package com.readmates.session.application.service

import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.session.application.port.`in`.HostSessionQueryUseCase
import com.readmates.session.application.port.`in`.ListUpcomingSessionsUseCase
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class HostSessionQueryService(
    private val queryPort: HostSessionQueryPort,
) : HostSessionQueryUseCase,
    ListUpcomingSessionsUseCase,
    GetHostDashboardUseCase {
    override fun list(
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ) = queryPort.list(host, pageRequest, query)

    override fun detail(command: HostSessionIdCommand) = queryPort.detail(command)

    override fun dashboard(host: CurrentMember) = queryPort.dashboard(host)

    override fun upcoming(member: CurrentMember) = queryPort.upcoming(member)
}
