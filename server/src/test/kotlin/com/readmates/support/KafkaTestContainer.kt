package com.readmates.support

import org.testcontainers.kafka.KafkaContainer
import org.testcontainers.utility.DockerImageName

object KafkaTestContainer {
    val container: KafkaContainer by lazy {
        KafkaContainer(DockerImageName.parse("apache/kafka-native:3.9.1"))
            // Local-only opt-in via ~/.testcontainers.properties.
            // Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.5
            .withReuse(true)
            .also { it.start() }
    }
}
