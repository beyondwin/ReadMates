package com.readmates.support

import org.springframework.test.context.DynamicPropertyRegistry
import org.testcontainers.mysql.MySQLContainer
import org.testcontainers.utility.DockerImageName

object MySqlTestContainer {
    private val container =
        ReadmatesMySQLContainer().apply {
            withDatabaseName("readmates")
            withUsername("readmates")
            withPassword("readmates")
            // Keep MySQL 8.4 startup deterministic in constrained local/CI Docker VMs.
            withCommand(
                "--log-bin-trust-function-creators=1",
                "--innodb-buffer-pool-size=32M",
                "--performance-schema=OFF",
                "--key-buffer-size=8M",
                "--max-connections=100",
            )
            start()
        }

    fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
        registry.add("spring.datasource.url", container::getJdbcUrl)
        registry.add("spring.datasource.username", container::getUsername)
        registry.add("spring.datasource.password", container::getPassword)
        registry.add("spring.datasource.hikari.connection-init-sql") { "set time_zone = '+00:00'" }
        registry.add("spring.datasource.hikari.maximum-pool-size") { "2" }
        registry.add("spring.datasource.hikari.minimum-idle") { "0" }
    }

    private class ReadmatesMySQLContainer :
        MySQLContainer(
            DockerImageName.parse("mysql:8.4"),
        )
}
