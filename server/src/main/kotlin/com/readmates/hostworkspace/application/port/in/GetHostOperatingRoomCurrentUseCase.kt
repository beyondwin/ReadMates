@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.application.port.`in`

import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomCurrent

interface GetHostOperatingRoomCurrentUseCase {
    fun current(actor: HostOperatingRoomActor): HostOperatingRoomCurrent
}
