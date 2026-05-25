package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.Provider

interface SessionContentGenerator {
    val provider: Provider

    fun generateFull(input: GenerationInput): GenerationOutput
}
