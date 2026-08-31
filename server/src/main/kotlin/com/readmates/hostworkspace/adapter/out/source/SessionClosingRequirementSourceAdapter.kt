package com.readmates.hostworkspace.adapter.out.source

import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirement
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirementResult
import com.readmates.hostworkspace.application.port.out.HostOperatingRoomClosingRequirementSourcePort
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class SessionClosingRequirementSourceAdapter(
    private val closingStatus: GetHostSessionClosingStatusUseCase,
) : HostOperatingRoomClosingRequirementSourcePort {
    override fun loadClosingRequirement(
        actor: HostOperatingRoomActor,
        sessionId: UUID,
    ): HostOperatingRoomClosingRequirementResult =
        runCatching { closingStatus.getHostSessionClosingStatus(actor.toCurrentMember(), sessionId) }
            .fold(
                onSuccess = { status ->
                    HostOperatingRoomClosingRequirementResult.Available(
                        when {
                            status.overall.state == ClosingOverallState.PUBLISHED ->
                                HostOperatingRoomClosingRequirement.PUBLISHED
                            status.overall.primaryAction == ClosingPrimaryAction.NONE ->
                                HostOperatingRoomClosingRequirement.RESOLVED
                            else -> HostOperatingRoomClosingRequirement.REQUIRED
                        },
                    )
                },
                onFailure = { HostOperatingRoomClosingRequirementResult.Unavailable },
            )
}
