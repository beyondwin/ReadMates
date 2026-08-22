package com.readmates.shared.paging

import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component

@Configuration
@EnableConfigurationProperties(HostListCursorSigningProperties::class)
class HostListCursorSigningConfiguration

@Component
class HostListCursorSigningValidator(
    private val properties: HostListCursorSigningProperties,
    private val environment: Environment,
) {
    @PostConstruct
    fun validate() {
        properties.validate(environment)
    }
}
