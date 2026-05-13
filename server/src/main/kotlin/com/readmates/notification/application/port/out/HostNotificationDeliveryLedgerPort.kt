package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.util.UUID

interface HostNotificationDeliveryLedgerPort {
    fun hostSummary(clubId: UUID): HostNotificationSummary
    fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery, pageRequest: PageRequest): HostNotificationItemList
    fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail?
    fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationDelivery>
}
