package com.readmates.sessionrecord.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties(prefix = "readmates.host-action-confirmation")
data class HostActionConfirmationProperties(
    val required: Boolean = false,
)

@Configuration
@EnableConfigurationProperties(HostActionConfirmationProperties::class)
class HostActionConfirmationConfiguration
