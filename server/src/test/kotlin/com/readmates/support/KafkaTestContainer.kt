package com.readmates.support

import org.testcontainers.kafka.KafkaContainer
import org.testcontainers.utility.DockerImageName

object KafkaTestContainer {
    val container: KafkaContainer by lazy {
        KafkaContainer(DockerImageName.parse("apache/kafka-native:3.9.1"))
            .also { it.start() }
    }
}
