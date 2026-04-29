package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.MemberNotificationItem
import java.util.UUID

interface MemberNotificationPort {
    fun listForMembership(clubId: UUID, membershipId: UUID, limit: Int): List<MemberNotificationItem>
    fun unreadCount(clubId: UUID, membershipId: UUID): Int
    fun markRead(clubId: UUID, membershipId: UUID, notificationId: UUID): Boolean
    fun markAllRead(clubId: UUID, membershipId: UUID): Int
}
