package com.readmates.session.application.port.out

import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import java.util.UUID

interface HostSessionLifecycleAuditPort {
    fun record(entry: HostSessionLifecycleAuditEntry): UUID?
}
