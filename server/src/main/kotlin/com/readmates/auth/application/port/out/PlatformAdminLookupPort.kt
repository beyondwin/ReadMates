package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface PlatformAdminLookupPort {
    fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin?
}
