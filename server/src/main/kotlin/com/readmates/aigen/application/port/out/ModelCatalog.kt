package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing

interface ModelCatalog {
    fun allowlisted(): List<ModelId>
    fun pricing(id: ModelId): ModelPricing
    fun resolveAlias(alias: String): ModelId?
    fun isEnabled(id: ModelId): Boolean
}
