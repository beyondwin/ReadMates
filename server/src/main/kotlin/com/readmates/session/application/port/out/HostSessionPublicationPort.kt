package com.readmates.session.application.port.out

import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.model.UpsertPublicationCommand

interface HostSessionPublicationPort {
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse
}
