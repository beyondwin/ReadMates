package com.readmates.admin.audit.application.port.out

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.shared.paging.PageRequest

interface AdminAuditLedgerReadPort {
    fun listPlatformEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>

    fun listClubEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>

    fun listAiGenerationEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>

    fun listNotificationReplayPreviews(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>
}
