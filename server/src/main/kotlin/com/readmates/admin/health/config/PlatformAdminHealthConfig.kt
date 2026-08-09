package com.readmates.admin.health.config

import com.readmates.admin.health.adapter.out.persistence.JsonlDeployLedgerAdapter
import com.readmates.admin.health.adapter.out.prometheus.HttpPrometheusQueryAdapter
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.apache.hc.client5.http.config.ConnectionConfig
import org.apache.hc.client5.http.config.RequestConfig
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient
import org.apache.hc.client5.http.impl.classic.HttpClients
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder
import org.apache.hc.core5.util.Timeout
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory
import org.springframework.web.client.RestClient
import tools.jackson.databind.ObjectMapper
import java.nio.file.Paths
import java.time.Clock
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory

private const val HEALTH_EXECUTOR_THREADS = 4

@Configuration
@EnableConfigurationProperties(PlatformAdminHealthProperties::class)
class PlatformAdminHealthConfig {
    @Bean
    fun platformAdminHealthClock(): Clock = Clock.systemUTC()

    @Bean(destroyMethod = "shutdown")
    fun platformAdminHealthExecutor(): ExecutorService =
        Executors.newFixedThreadPool(
            HEALTH_EXECUTOR_THREADS,
            ThreadFactory { runnable ->
                Thread(runnable, "platform-admin-health").apply { isDaemon = true }
            },
        )

    @Bean(destroyMethod = "close")
    @Qualifier("platformAdminHealthHttpClient")
    fun platformAdminHealthHttpClient(properties: PlatformAdminHealthProperties): CloseableHttpClient {
        val prometheus = properties.prometheus
        val connectionConfig =
            ConnectionConfig
                .custom()
                .setConnectTimeout(Timeout.of(prometheus.connectTimeout))
                .setSocketTimeout(Timeout.of(prometheus.readTimeout))
                .build()
        val connectionManager =
            PoolingHttpClientConnectionManagerBuilder
                .create()
                .setDefaultConnectionConfig(connectionConfig)
                .build()
        val requestConfig =
            RequestConfig
                .custom()
                .setConnectionRequestTimeout(Timeout.of(prometheus.connectionRequestTimeout))
                .setResponseTimeout(Timeout.of(prometheus.readTimeout))
                .build()
        return HttpClients
            .custom()
            .setConnectionManager(connectionManager)
            .setDefaultRequestConfig(requestConfig)
            .build()
    }

    @Bean
    fun prometheusQueryPort(
        properties: PlatformAdminHealthProperties,
        @Qualifier("platformAdminHealthHttpClient") httpClient: CloseableHttpClient,
    ): PrometheusQueryPort {
        val prometheus = properties.prometheus
        val requestFactory =
            HttpComponentsClientHttpRequestFactory(httpClient).apply {
                setConnectionRequestTimeout(prometheus.connectionRequestTimeout)
                setReadTimeout(prometheus.readTimeout)
            }
        val restClient =
            RestClient
                .builder()
                .baseUrl(ensureTrailingSlash(prometheus.baseUrl.toString()))
                .requestFactory(requestFactory)
                .build()
        return HttpPrometheusQueryAdapter(restClient)
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
