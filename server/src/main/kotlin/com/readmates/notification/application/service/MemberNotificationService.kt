package com.readmates.notification.application.service

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.port.`in`.ManageMemberNotificationsUseCase
import com.readmates.notification.application.port.out.MemberNotificationPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class MemberNotificationService(
    private val memberNotificationPort: MemberNotificationPort,
) : ManageMemberNotificationsUseCase {
    override fun list(member: CurrentMember, pageRequest: PageRequest): MemberNotificationList {
        val clampedRequest = pageRequest.copy(limit = pageRequest.limit.coerceIn(MIN_LIMIT, MAX_LIMIT))
        val page = memberNotificationPort.listForMembership(member.clubId, member.membershipId, clampedRequest)
        return MemberNotificationList(
            items = page.items,
            unreadCount = memberNotificationPort.unreadCount(member.clubId, member.membershipId),
            nextCursor = page.nextCursor,
        )
    }

    override fun unreadCount(member: CurrentMember): Int =
        memberNotificationPort.unreadCount(member.clubId, member.membershipId)

    override fun markRead(member: CurrentMember, id: UUID) {
        if (!memberNotificationPort.markRead(member.clubId, member.membershipId, id)) {
            throw NotificationApplicationException(
                NotificationApplicationError.NOTIFICATION_NOT_FOUND,
                "Notification not found",
            )
        }
    }

    override fun markAllRead(member: CurrentMember): Int =
        memberNotificationPort.markAllRead(member.clubId, member.membershipId)
}

private const val MIN_LIMIT = 1
private const val MAX_LIMIT = 100
