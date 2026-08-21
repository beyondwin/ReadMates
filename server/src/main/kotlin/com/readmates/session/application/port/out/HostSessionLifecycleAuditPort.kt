package com.readmates.session.application.port.out

import com.readmates.session.application.model.HostSessionLifecycleAuditEntry

interface HostSessionLifecycleAuditPort {
    fun record(entry: HostSessionLifecycleAuditEntry)
}
