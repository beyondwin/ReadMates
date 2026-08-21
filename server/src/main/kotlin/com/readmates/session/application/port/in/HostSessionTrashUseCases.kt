package com.readmates.session.application.port.`in`

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionTrashPage
import com.readmates.session.application.model.HostSessionTrashResponse
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember

data class ListHostSessionTrashCommand(
    val host: CurrentMember,
    val pageRequest: PageRequest,
)

interface ListHostSessionTrashUseCase {
    fun list(command: ListHostSessionTrashCommand): HostSessionTrashPage
}

interface GetHostSessionTrashUseCase {
    fun trash(command: HostSessionIdCommand): HostSessionTrashResponse
}

interface RestoreTrashedHostSessionUseCase {
    fun restore(command: HostSessionIdCommand): HostSessionDetailResponse
}

fun interface PurgeExpiredHostSessionTrashUseCase {
    fun purgeExpired(limit: Int): Int
}
