package com.readmates.admin.audit.application.port.out

import com.readmates.admin.audit.application.model.AdminAuditSourceQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceType

interface AdminAuditLedgerReadPort {
    fun listSource(
        source: AdminAuditSourceType,
        query: AdminAuditSourceQuery,
    ): List<AdminAuditSourceRow>
}
