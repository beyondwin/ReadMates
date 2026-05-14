package com.readmates.support

import org.springframework.test.context.DynamicPropertyRegistry
import org.testcontainers.containers.GenericContainer
import org.testcontainers.utility.DockerImageName

object RedisTestContainer {
    private val container =
        GenericContainer(DockerImageName.parse("redis:7.4-alpine")).apply {
            withExposedPorts(6379)
            start()
        }

    fun registerRedisProperties(registry: DynamicPropertyRegistry) {
        registry.add("readmates.redis.enabled") { "true" }
        registry.add("spring.data.redis.url") {
            "redis://${redisHost()}:${container.getMappedPort(6379)}"
        }
        registry.add("management.health.redis.enabled") { "true" }
    }

    private fun redisHost(): String = if (container.host == "localhost") "127.0.0.1" else container.host
}
