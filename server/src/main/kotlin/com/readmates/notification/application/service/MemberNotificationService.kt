package com.readmates.notification.application.service

import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.port.`in`.ManageMemberNotificationsUseCase
import com.readmates.notification.application.port.out.MemberNotificationPort
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class MemberNotificationService(
    private val memberNotificationPort: MemberNotificationPort,
) : ManageMemberNotificationsUseCase {
    override fun list(member: CurrentMember, limit: Int): MemberNotificationList {
        val clampedLimit = limit.coerceIn(MIN_LIMIT, MAX_LIMIT)
        return MemberNotificationList(
            items = memberNotificationPort.listForMembership(member.clubId, member.membershipId, clampedLimit),
            unreadCount = memberNotificationPort.unreadCount(member.clubId, member.membershipId),
        )
    }

    override fun unreadCount(member: CurrentMember): Int =
        memberNotificationPort.unreadCount(member.clubId, member.membershipId)

    override fun markRead(member: CurrentMember, id: UUID) {
        if (!memberNotificationPort.markRead(member.clubId, member.membershipId, id)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found")
        }
    }

    override fun markAllRead(member: CurrentMember): Int =
        memberNotificationPort.markAllRead(member.clubId, member.membershipId)
}

private const val MIN_LIMIT = 1
private const val MAX_LIMIT = 100
