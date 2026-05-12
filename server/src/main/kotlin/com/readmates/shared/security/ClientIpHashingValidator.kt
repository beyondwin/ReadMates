package com.readmates.shared.security

import jakarta.annotation.PostConstruct
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component

@Component
class ClientIpHashingValidator(
    private val properties: ClientIpHashingProperties,
    private val environment: Environment,
) {
    @PostConstruct
    fun validate() {
        properties.validate(environment)
    }
}
