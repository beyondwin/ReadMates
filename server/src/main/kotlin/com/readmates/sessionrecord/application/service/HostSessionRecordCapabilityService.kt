package com.readmates.sessionrecord.application.service

import com.readmates.sessionrecord.application.model.HostSessionRecordCapabilities
import com.readmates.sessionrecord.application.port.`in`.GetHostSessionRecordCapabilitiesUseCase
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class HostSessionRecordCapabilityService(
    private val properties: HostActionConfirmationProperties,
) : GetHostSessionRecordCapabilitiesUseCase {
    override fun capabilities(host: CurrentMember): HostSessionRecordCapabilities {
        if (!host.isHost) throw AccessDeniedException("Host role required")
        return HostSessionRecordCapabilities(
            hostActionNotificationConfirmationRequired = properties.required,
        )
    }
}
