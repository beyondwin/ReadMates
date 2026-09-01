package com.readmates.hostworkspace.application.port.out

import com.readmates.hostworkspace.application.model.HostPersonDetailProjection
import com.readmates.hostworkspace.application.model.HostPersonDetailQuery

interface HostPersonDetailQueryPort {
    fun load(query: HostPersonDetailQuery): HostPersonDetailProjection?
}
