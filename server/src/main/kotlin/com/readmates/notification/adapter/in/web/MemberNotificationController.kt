package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.port.`in`.ManageMemberNotificationsUseCase
import com.readmates.notification.application.port.`in`.ManageNotificationPreferencesUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/me/notifications")
class MemberNotificationController(
    private val manageMemberNotificationsUseCase: ManageMemberNotificationsUseCase,
) {
    @GetMapping
    fun list(
        member: CurrentMember,
        @RequestParam(defaultValue = "50") limit: Int,
    ): MemberNotificationListResponse =
        manageMemberNotificationsUseCase.list(member, limit).toResponse()

    @GetMapping("/unread-count")
    fun unreadCount(member: CurrentMember): Map<String, Int> =
        mapOf("unreadCount" to manageMemberNotificationsUseCase.unreadCount(member))

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun markRead(
        member: CurrentMember,
        @PathVariable id: UUID,
    ) {
        manageMemberNotificationsUseCase.markRead(member, id)
    }

    @PostMapping("/read-all")
    fun markAllRead(member: CurrentMember): Map<String, Int> =
        mapOf("updatedCount" to manageMemberNotificationsUseCase.markAllRead(member))
}

@RestController
@RequestMapping("/api/me/notifications/preferences")
class MemberNotificationPreferenceController(
    private val manageNotificationPreferencesUseCase: ManageNotificationPreferencesUseCase,
) {
    @GetMapping
    fun getPreferences(member: CurrentMember): NotificationPreferencesResponse =
        manageNotificationPreferencesUseCase.getPreferences(member).toResponse()

    @PutMapping
    fun savePreferences(
        member: CurrentMember,
        @RequestBody request: NotificationPreferencesRequest,
    ): NotificationPreferencesResponse =
        manageNotificationPreferencesUseCase.savePreferences(member, request.toModel()).toResponse()
}
