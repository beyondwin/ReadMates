package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.BffSecretRotationAuditPort
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.LocalDateTime
import java.time.ZoneOffset

@Component
class JdbcBffSecretRotationAuditAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : BffSecretRotationAuditPort {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun recordUsage(
        secretAlias: String,
        clientIpHash: String?,
        requestPath: String?,
    ) {
        try {
            jdbcTemplate.update(
                """
                insert into bff_secret_rotation_audit
                  (secret_alias, used_at, client_ip_hash, request_path)
                values (?, ?, ?, ?)
                """.trimIndent(),
                secretAlias,
                LocalDateTime.now(ZoneOffset.UTC),
                clientIpHash,
                requestPath?.take(255),
            )
        } catch (ex: Exception) {
            log.warn("Failed to record bff secret rotation audit: {}", ex.message)
        }
    }
}
