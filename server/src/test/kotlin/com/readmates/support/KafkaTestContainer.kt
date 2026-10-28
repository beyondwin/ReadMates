package com.readmates.support

import org.testcontainers.kafka.KafkaContainer
import org.testcontainers.utility.DockerImageName

object KafkaTestContainer {
    val container: KafkaContainer by lazy {
        KafkaContainer(DockerImageName.parse("apache/kafka-native:3.9.1"))
            // Local-only opt-in via ~/.testcontainers.properties.
            // Local container reuse setup: docs/development/test-guide.md.
            .withReuse(true)
            .also { it.start() }
    }
}
