package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId

fun interface ModelCapabilityCatalog {
    fun find(model: ModelId): ModelCapability?
}
