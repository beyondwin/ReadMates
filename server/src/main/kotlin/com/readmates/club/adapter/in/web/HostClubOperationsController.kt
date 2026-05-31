@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.HostClubOperationsSnapshot
import com.readmates.club.application.port.`in`.GetHostClubOperationsUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/club-operations")
class HostClubOperationsController(
    private val getHostClubOperationsUseCase: GetHostClubOperationsUseCase,
) {
    @GetMapping
    fun operations(host: CurrentMember): HostClubOperationsSnapshotResponse =
        HostClubOperationsSnapshotResponse.from(getHostClubOperationsUseCase.hostOperationsSnapshot(host))
}

data class HostClubOperationsSnapshotResponse(
    val schema: String,
    val generatedAt: String,
    val club: Any,
    val readiness: Any,
    val sessionProgress: Any,
    val aiUsage: Any,
) {
    companion object {
        fun from(snapshot: HostClubOperationsSnapshot): HostClubOperationsSnapshotResponse =
            HostClubOperationsSnapshotResponse(
                schema = snapshot.schema,
                generatedAt = snapshot.generatedAt.toString(),
                club = snapshot.club,
                readiness = snapshot.readiness,
                sessionProgress = snapshot.sessionProgress,
                aiUsage = snapshot.aiUsage,
            )
    }
}
