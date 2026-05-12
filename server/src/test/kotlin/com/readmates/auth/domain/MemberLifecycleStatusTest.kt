package com.readmates.auth.domain

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class MemberLifecycleStatusTest {
    @Test
    fun `ACTIVE allows SUSPENDED LEFT INACTIVE`() {
        assertThat(MemberLifecycleStatus.ACTIVE.allowsTransitionTo(MemberLifecycleStatus.SUSPENDED)).isTrue
        assertThat(MemberLifecycleStatus.ACTIVE.allowsTransitionTo(MemberLifecycleStatus.LEFT)).isTrue
        assertThat(MemberLifecycleStatus.ACTIVE.allowsTransitionTo(MemberLifecycleStatus.INACTIVE)).isTrue
    }

    @Test
    fun `SUSPENDED allows ACTIVE LEFT INACTIVE only`() {
        assertThat(MemberLifecycleStatus.SUSPENDED.allowsTransitionTo(MemberLifecycleStatus.ACTIVE)).isTrue
        assertThat(MemberLifecycleStatus.SUSPENDED.allowsTransitionTo(MemberLifecycleStatus.LEFT)).isTrue
        assertThat(MemberLifecycleStatus.SUSPENDED.allowsTransitionTo(MemberLifecycleStatus.INACTIVE)).isTrue
    }

    @Test
    fun `LEFT is terminal`() {
        MemberLifecycleStatus.values()
            .filter { it != MemberLifecycleStatus.LEFT }
            .forEach { target ->
                assertThat(MemberLifecycleStatus.LEFT.allowsTransitionTo(target)).isFalse
            }
    }

    @Test
    fun `fromStorage round-trips known values`() {
        MemberLifecycleStatus.values().forEach { value ->
            assertThat(MemberLifecycleStatus.fromStorage(value.storageValue)).isEqualTo(value)
        }
    }
}
