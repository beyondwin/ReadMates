@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.HostNotificationPolicy
import com.readmates.notification.application.model.UpdateNotificationPolicyCommand
import com.readmates.shared.security.CurrentMember

interface GetHostNotificationPolicyUseCase {
    fun get(host: CurrentMember): HostNotificationPolicy
}

interface UpdateHostNotificationPolicyUseCase {
    fun update(
        host: CurrentMember,
        command: UpdateNotificationPolicyCommand,
    ): HostNotificationPolicy
}
