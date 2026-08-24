package com.readmates.shared.adminmutation.config

import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyReferenceState
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant

@Component
@DependsOnDatabaseInitialization
class AdminCommandDigestKeyStartupValidator(
    private val identityProperties: AdminCommandIdentityProperties,
    private val idempotencyProperties: AdminCommandIdempotencyProperties,
    private val port: AdminCommandIdempotencyPort,
    private val transactionTemplate: TransactionTemplate,
    private val clock: Clock,
) : SmartInitializingSingleton {
    override fun afterSingletonsInstantiated() {
        idempotencyProperties.validate()
        transactionTemplate.executeWithoutResult {
            validateLocked(port.lockDigestKeySnapshot())
        }
    }

    internal fun validateLocked(states: List<AdminCommandDigestKeyReferenceState>) {
        val now = clock.instant()
        val configuredVersions = configuredVersions()
        val statesByVersion = states.associateBy(AdminCommandDigestKeyReferenceState::digestKeyVersion)
        if (statesByVersion.size != states.size) {
            failClosed()
        }
        states.forEach { state -> validateState(state, configuredVersions, now) }
        validateDeclaredRemovedVersion(statesByVersion, configuredVersions)
    }

    private fun configuredVersions(): Set<Int> =
        buildSet {
            if (identityProperties.currentKey.isNotBlank()) {
                add(identityProperties.currentKeyVersion)
            }
            if (identityProperties.previousKey.isNotBlank()) {
                add(identityProperties.previousKeyVersion)
            }
        }

    private fun validateState(
        state: AdminCommandDigestKeyReferenceState,
        configuredVersions: Set<Int>,
        now: Instant,
    ) {
        val lastReferencedAt = state.lastReferencedAt
        when {
            state.referenceCount > 0 ->
                if (state.digestKeyVersion !in configuredVersions || lastReferencedAt == null) failClosed()
            state.digestKeyVersion in configuredVersions ->
                if (lastReferencedAt == null) failClosed()
            !hasRetirementEvidence(state, now) -> failClosed()
        }
    }

    private fun hasRetirementEvidence(
        state: AdminCommandDigestKeyReferenceState,
        now: Instant,
    ): Boolean {
        val lastReferencedAt = state.lastReferencedAt
        val unreferencedSince = state.unreferencedSince
        return lastReferencedAt != null &&
            unreferencedSince != null &&
            !unreferencedSince.isBefore(lastReferencedAt) &&
            !now.isBefore(unreferencedSince.plus(idempotencyProperties.previousKeyRolloutBuffer))
    }

    private fun validateDeclaredRemovedVersion(
        statesByVersion: Map<Int, AdminCommandDigestKeyReferenceState>,
        configuredVersions: Set<Int>,
    ) {
        val declaredRemovedVersion =
            identityProperties.previousKeyVersion.takeIf {
                identityProperties.previousKey.isBlank() && it > 0 && it !in configuredVersions
            }
        if (declaredRemovedVersion != null && statesByVersion[declaredRemovedVersion] == null) {
            failClosed()
        }
    }

    private fun failClosed(): Nothing =
        throw IllegalStateException(
            "Admin command digest keys cannot safely replay or retire persisted command references",
        )
}
