package com.readmates.session.application.service

import com.readmates.session.application.CurrentSessionPayload
import com.readmates.session.application.port.`in`.GetCurrentSessionUseCase
import com.readmates.session.application.port.out.LoadCurrentSessionPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class CurrentSessionQueryService(
    private val port: LoadCurrentSessionPort,
) : GetCurrentSessionUseCase {
    override fun currentSession(member: CurrentMember): CurrentSessionPayload {
        val payload = port.loadCurrentSession(member)
        val session = payload.currentSession ?: return payload
        if (!member.isViewer) {
            return payload
        }
        return payload.copy(
            currentSession =
                session.copy(
                    meetingUrl = null,
                    meetingPasscode = null,
                ),
        )
    }
}
