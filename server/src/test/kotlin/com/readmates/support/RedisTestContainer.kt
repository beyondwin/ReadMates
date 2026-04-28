package com.readmates.support

import org.springframework.test.context.DynamicPropertyRegistry
import org.testcontainers.containers.GenericContainer
import org.testcontainers.utility.DockerImageName

object RedisTestContainer {
    private val container = GenericContainer(DockerImageName.parse("redis:7.4-alpine")).apply {
        withExposedPorts(6379)
        start()
    }

    fun registerRedisProperties(registry: DynamicPropertyRegistry) {
        registry.add("readmates.redis.enabled") { "true" }
        registry.add("spring.data.redis.url") {
            "redis://${container.host}:${container.getMappedPort(6379)}"
        }
        registry.add("management.health.redis.enabled") { "true" }
    }
}
