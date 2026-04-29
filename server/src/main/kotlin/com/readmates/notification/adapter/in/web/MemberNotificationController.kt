package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.port.`in`.ManageNotificationPreferencesUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/me/notifications/preferences")
class MemberNotificationController(
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
