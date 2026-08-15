package com.readmates.aigen.config

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(AiGenerationProperties::class, AiGenerationKafkaProperties::class)
class AiGenerationConfig
