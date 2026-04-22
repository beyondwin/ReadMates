package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.application.port.out.LoadCurrentMemberPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class ResolveCurrentMemberService(
    private val loadCurrentMemberPort: LoadCurrentMemberPort,
) : ResolveCurrentMemberUseCase {
    override fun resolveByEmail(email: String): CurrentMember? =
        loadCurrentMemberPort.loadActiveMemberByEmail(email)
}
