package com.readmates.shared.adminmutation.adapter.out.observability

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirementOutcome
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AdminCommandMetricsTest {
    @Test
    fun `metrics expose only bounded command claim and outcome tags`() {
        val registry = SimpleMeterRegistry()
        val metrics = AdminCommandMetrics(registry)

        metrics.claim("club.create", AdminCommandClaimResult.InProgress)
        metrics.claim("unregistered.command", AdminCommandClaimResult.Conflict)
        metrics.complete(completed = false)
        metrics.purge(3)
        metrics.retirement(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)

        assertThat(registry.meters.map { it.id.name }.toSet())
            .containsExactlyInAnyOrder(
                "admin.command.claim",
                "admin.command.complete",
                "admin.command.purge",
                "admin.command.digest-key-retirement",
            )
        assertThat(
            registry.meters
                .flatMap { meter -> meter.id.tags }
                .map { tag -> tag.key }
                .toSet(),
        ).containsExactlyInAnyOrder("commandType", "claimResult", "outcome")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags }.map { tag -> tag.value })
            .contains("club.create", "other", "in_progress", "conflict", "stale_token", "purged", "buffer_pending")
            .doesNotContain("unregistered.command")
            .doesNotContain("actor", "target", "digest", "receipt", "error")
    }
}
