package com.readmates.shared.observability

import io.micrometer.common.KeyValues
import org.springframework.http.server.observation.DefaultServerRequestObservationConvention
import org.springframework.http.server.observation.ServerRequestObservationContext
import org.springframework.stereotype.Component

/**
 * Keeps route templates and other bounded HTTP dimensions while excluding the raw request URL.
 * ReadMates routes contain session, club, and invitation identifiers that must never become span tags.
 */
@Component
internal class ContentSafeServerRequestObservationConvention : DefaultServerRequestObservationConvention() {
    override fun getHighCardinalityKeyValues(context: ServerRequestObservationContext): KeyValues = KeyValues.empty()
}
