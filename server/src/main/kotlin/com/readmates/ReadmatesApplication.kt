package com.readmates

import com.readmates.shared.security.ClientIpHashingProperties
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableAsync
@EnableScheduling
@EnableConfigurationProperties(ClientIpHashingProperties::class)
class ReadmatesApplication

fun main(args: Array<String>) {
    runApplication<ReadmatesApplication>(*args)
}
