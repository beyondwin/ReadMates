package com.readmates.session.application.port.out

import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.model.HostPublicProjectionEffect
import com.readmates.session.application.model.UpsertPublicationCommand

interface HostSessionPublicationPort {
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationWriteResult
}

data class HostPublicationWriteResult(
    val response: HostPublicationResponse,
    val exposureChanged: Boolean,
    val publicationChanged: Boolean,
    val compatibilityChanged: Boolean = false,
    val publicProjectionEffect: HostPublicProjectionEffect? = null,
) {
    val changed: Boolean = exposureChanged || publicationChanged || compatibilityChanged
}
