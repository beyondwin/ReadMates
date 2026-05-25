package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.RegenerationOutput

interface SessionContentRegenerator {
    val provider: Provider

    fun regenerateItem(input: RegenerationInput): RegenerationOutput
}
