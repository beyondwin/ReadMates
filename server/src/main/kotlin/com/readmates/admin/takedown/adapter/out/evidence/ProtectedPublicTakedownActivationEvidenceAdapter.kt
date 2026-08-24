package com.readmates.admin.takedown.adapter.out.evidence

import com.readmates.admin.takedown.application.port.out.PublicTakedownActivationEvidencePort
import org.springframework.stereotype.Component

@Component
class ProtectedPublicTakedownActivationEvidenceAdapter : PublicTakedownActivationEvidencePort {
    override fun confirmEnabled(): Boolean = false
}
