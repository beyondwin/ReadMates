package com.readmates.auth.adapter.out.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class JdbcMemberAccountAdapterDevSeedAllowListTest {
    @Test
    fun `dev seed allowlist contains the three admin accounts`() {
        val allowed = JdbcMemberAccountAdapter.DEV_SEED_EMAILS
        assertThat(allowed).contains(
            "admin-owner@example.com",
            "admin-operator@example.com",
            "admin-support@example.com",
        )
    }

    @Test
    fun `dev seed allowlist still contains the existing host and member accounts`() {
        val allowed = JdbcMemberAccountAdapter.DEV_SEED_EMAILS
        assertThat(allowed).contains(
            "host@example.com",
            "member1@example.com",
            "member5@example.com",
        )
    }
}
