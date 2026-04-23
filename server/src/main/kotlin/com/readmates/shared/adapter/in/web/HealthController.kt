package com.readmates.shared.adapter.`in`.web

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/internal/health")
class HealthController {
    @GetMapping
    fun health() = mapOf(
        "service" to "readmates-server",
        "status" to "UP",
    )
}
