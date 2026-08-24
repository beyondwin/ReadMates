package com.readmates.architecture

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

@Tag("architecture")
class AdminCommandPersistenceArchitectureTest {
    @Test
    fun `persistence boundary contains only stripped hmac claim data`() {
        val boundary =
            listOf(
                "application/port/out/AdminCommandIdempotencyPort.kt",
                "adapter/out/persistence/AdminCommandIdempotencyRows.kt",
                "adapter/out/persistence/JdbcAdminCommandIdempotencyAdapter.kt",
            )
        val forbiddenRawIdentity =
            Regex("""\b(PlatformAdminCommandIdentity|CanonicalAdminCommandRequest|idempotencyKey|canonicalFields)\b""")

        boundary.forEach { relative ->
            val source = Files.readString(adminMutationRoot().resolve(relative))
            assertThat(forbiddenRawIdentity.find(source))
                .describedAs("raw admin command identity in %s", relative)
                .isNull()
            assertThat(source).doesNotContain("@Transactional")
        }
        val rows = readAdminMutationSource("adapter/out/persistence/AdminCommandIdempotencyRows.kt")
        assertThat(rows).contains(
            "RequestIdentityHmac.equal(idempotencyKeyHmac, digest.idempotencyKeyHmac)",
            "RequestIdentityHmac.equal(requestHmac, digest.requestHmac)",
            "return idempotencyKeyMatches and requestMatches",
        )
    }

    @Test
    fun `claim reservations lock digest state before claims and aliases`() {
        val adapter = readAdminMutationSource("adapter/out/persistence/JdbcAdminCommandIdempotencyAdapter.kt")
        assertThat(adapter).contains(
            "select claim_id, digest_key_version, idempotency_key_hmac, request_hmac",
            "lockDigestKeyStateSlots(digests.lookupCandidates, attempt.claimedAt)",
        )
        val absentReservation =
            adapter
                .substringAfter("private fun reserveAbsent(")
                .substringBefore("private fun reconcileExisting(")
        assertThat(absentReservation.indexOf("prepareFreshReservationKeyStates(digests, attempt.claimedAt)"))
            .isLessThan(absentReservation.indexOf("insertClaim(scope, attempt)"))
        assertThat(absentReservation.indexOf("lockDigestKeyStateSlots(digests.lookupCandidates, attempt.claimedAt)"))
            .isLessThan(absentReservation.indexOf("findAliases(scope, digests.lookupCandidates, lock = true)"))
        val existingClaimReconciliation = adapter.substringAfter("private fun reconcileExisting(")
        val stateLock =
            existingClaimReconciliation.indexOf(
                "lockDigestKeyStateSlots(digests.lookupCandidates, attempt.claimedAt)",
            )
        assertThat(stateLock).isLessThan(
            existingClaimReconciliation.indexOf("findAliases(scope, digests.lookupCandidates, lock = true)"),
        )
    }

    @Test
    fun `services own transactions and startup validation remains post flyway`() {
        val service = readAdminMutationSource("application/service/AdminCommandIdempotencyService.kt")
        assertThat(service)
            .contains(
                "PlatformAdminCommandIdentity",
                "CanonicalAdminCommandRequest",
                "identityService.resolve(identity, request)",
                "scope = envelope.scope",
            ).doesNotContain("@Transactional", "import com.readmates.shared.adminmutation.adapter")

        val maintenance = readAdminMutationSource("application/service/AdminCommandIdempotencyMaintenanceService.kt")
        val retirement = readAdminMutationSource("application/service/AdminCommandDigestKeyRetirementService.kt")
        assertThat(maintenance)
            .contains(
                "@Transactional",
                "port.lockDigestKeyStatesForMaintenance()",
                "port.purgeExpiredCompleted(clock.instant(), bounded)",
                "retirementService.invalidateDuringOverlap(identityProperties.previousKeyVersion)",
                "retirementService.assess(identityProperties.previousKeyVersion)",
            ).doesNotContain("import com.readmates.shared.adminmutation.adapter")
        assertThat(maintenance.indexOf("port.lockDigestKeyStatesForMaintenance()"))
            .isLessThan(maintenance.indexOf("port.purgeExpiredCompleted(clock.instant(), bounded)"))
        assertThat(retirement)
            .contains("@Transactional", "lockDigestKeyForRetirement")
            .doesNotContain("import com.readmates.shared.adminmutation.adapter")

        val scheduler = readAdminMutationSource("adapter/in/scheduling/AdminCommandIdempotencyPurgeScheduler.kt")
        assertThat(scheduler)
            .contains("application.port.`in`.PurgeExpiredAdminCommandClaimsUseCase")
            .doesNotContain("application.service")
        val startup = readAdminMutationSource("config/AdminCommandDigestKeyStartupValidator.kt")
        assertThat(startup).contains(
            "@DependsOnDatabaseInitialization",
            "SmartInitializingSingleton",
            "transactionTemplate.executeWithoutResult",
            "port.lockDigestKeySnapshot()",
            "identityProperties.currentKey.isNotBlank()",
        )
    }

    private fun readAdminMutationSource(relative: String): String {
        val source = adminMutationRoot().resolve(relative)
        return Files.readString(source)
    }

    private fun adminMutationRoot(): Path =
        projectRoot()
            .resolve("server/src/main/kotlin")
            .resolve("com/readmates/shared/adminmutation")

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }
}
