package com.readmates.admin.audit.application.port.`in`

import com.readmates.admin.audit.application.model.AdminAuditLedgerPage
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.shared.security.CurrentPlatformAdmin

interface ListAdminAuditLedgerUseCase {
    fun listLedger(
        admin: CurrentPlatformAdmin,
        query: AdminAuditListQuery,
    ): AdminAuditLedgerPage
}
