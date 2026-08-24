package com.readmates.auth.infrastructure.security

import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties(prefix = "readmates.security.host-write-client-contract")
data class HostClientContractProperties(
    val required: Boolean = false,
    val mode: String? = null,
) {
    fun effectiveMode(): HostClientContractMode {
        val configured = mode?.trim().orEmpty()
        if (configured.isEmpty()) {
            return if (required) HostClientContractMode.V2_ONLY else HostClientContractMode.DISABLED
        }
        return HostClientContractMode.entries.find { candidate ->
            candidate.name.equals(configured, ignoreCase = true)
        } ?: throw IllegalStateException(
            "readmates.security.host-write-client-contract.mode must be one of " +
                HostClientContractMode.entries.joinToString(),
        )
    }

    @PostConstruct
    fun validate() {
        effectiveMode()
    }
}

@Configuration
@EnableConfigurationProperties(HostClientContractProperties::class)
class HostClientContractConfiguration
