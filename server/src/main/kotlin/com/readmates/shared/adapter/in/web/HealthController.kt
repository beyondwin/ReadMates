package com.readmates.shared.adapter.`in`.web

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/internal/health")
class HealthController {
    /**
     * Liveness probe. process가 살아 있고 servlet container가 응답하는지만 확인한다.
     *
     * - 8080 `/internal/health`: liveness. DB/Redis/Kafka 의존성을 검사하지 않는다.
     * - 8081 `/actuator/health`: readiness. Spring Boot Actuator가 DB/Redis/Kafka
     *   health indicator를 종합한다(`management.endpoint.health.probes.enabled=true`).
     *
     * 운영 health check는 readiness(8081)를 사용하고, infra-level은 liveness(8080)
     * 사용. 자세한 계약은 `docs/deploy/oci-backend.md` "Health check contract" 참고.
     */
    @GetMapping
    fun health(): Map<String, String> = mapOf("status" to "UP", "kind" to "liveness")
}
