package com.readmates.observability.application.port.`in`

import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendObservabilityResult

interface RecordFrontendObservabilityUseCase {
    fun record(events: List<FrontendObservabilityEvent>): FrontendObservabilityResult
}
