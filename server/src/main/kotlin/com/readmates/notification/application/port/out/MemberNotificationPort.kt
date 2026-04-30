package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.util.UUID

interface MemberNotificationPort {
    fun listForMembership(clubId: UUID, membershipId: UUID, pageRequest: PageRequest): CursorPage<MemberNotificationItem>
    fun listForMembership(clubId: UUID, membershipId: UUID, limit: Int): List<MemberNotificationItem> =
        listForMembership(clubId, membershipId, PageRequest.cursor(limit, null, defaultLimit = limit, maxLimit = 100)).items
    fun unreadCount(clubId: UUID, membershipId: UUID): Int
    fun markRead(clubId: UUID, membershipId: UUID, notificationId: UUID): Boolean
    fun markAllRead(clubId: UUID, membershipId: UUID): Int
}
