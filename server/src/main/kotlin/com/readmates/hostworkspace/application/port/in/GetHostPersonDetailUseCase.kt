@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.application.port.`in`

import com.readmates.hostworkspace.application.model.HostPersonDetail
import com.readmates.hostworkspace.application.model.HostPersonDetailRequest

interface GetHostPersonDetailUseCase {
    fun get(request: HostPersonDetailRequest): HostPersonDetail
}
