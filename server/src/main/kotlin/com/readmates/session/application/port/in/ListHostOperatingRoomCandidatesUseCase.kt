@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.application.port.`in`

import com.readmates.session.application.model.HostOperatingRoomCandidate
import com.readmates.shared.security.CurrentMember

interface ListHostOperatingRoomCandidatesUseCase {
    fun listHostOperatingRoomCandidates(host: CurrentMember): List<HostOperatingRoomCandidate>
}
