package com.readmates.sessionrecord.application.port.out

import com.readmates.sessionrecord.application.model.HostSessionHistoryCursor
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface HostSessionHistoryPort {
    fun loadAuditHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem>

    fun loadRevisionHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem>

    fun loadNotificationHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem>
}
