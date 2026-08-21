package com.readmates.session.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@ConfigurationProperties(prefix = "readmates.session.lifecycle")
data class HostSessionLifecycleProperties(
    val requireReverseReason: Boolean = false,
)

@Configuration
@EnableConfigurationProperties(HostSessionLifecycleProperties::class)
class HostSessionLifecycleConfiguration
