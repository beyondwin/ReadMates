package com.readmates.admin.health.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.admin.health.adapter.out.persistence.JsonlDeployLedgerAdapter
import com.readmates.admin.health.adapter.out.prometheus.HttpPrometheusQueryAdapter
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient
import java.nio.file.Paths
import java.time.Clock
import java.time.Duration

@Configuration
class PlatformAdminHealthConfig {
    @Bean
    fun platformAdminHealthClock(): Clock = Clock.systemUTC()

    @Bean
    fun prometheusQueryPort(
        @Value("\${readmates.admin.health.prometheus.base-url:http://prometheus:9090}") baseUrl: String,
        @Value("\${readmates.admin.health.prometheus.timeout-ms:5000}") timeoutMs: Long,
    ): PrometheusQueryPort {
        val restClient = RestClient.builder().baseUrl(ensureTrailingSlash(baseUrl)).build()
        return HttpPrometheusQueryAdapter(restClient, Duration.ofMillis(timeoutMs))
    }

    @Bean
    fun deployLedgerPort(
        @Value("\${readmates.admin.health.deploy-ledger-path:/var/log/readmates/deploy-attempts.jsonl}")
        ledgerPath: String,
        objectMapper: ObjectMapper,
    ): DeployLedgerPort =
        JsonlDeployLedgerAdapter(
            ledgerPathSupplier = { Paths.get(ledgerPath) },
            objectMapper = objectMapper,
        )

    private fun ensureTrailingSlash(s: String): String = if (s.endsWith("/")) s else "$s/"
}
