package com.readmates.shared.security

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment

class ClientIpHashingPropertiesTest {

    @Test
    fun `production profile with blank secret throws with env var hint`() {
        val env = MockEnvironment().apply {
            setActiveProfiles("production")
        }
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = false)

        val ex = assertThrows(IllegalStateException::class.java) {
            props.validate(env)
        }
        assertTrue(
            ex.message?.contains("READMATES_IP_HASH_BASE_SECRET") == true,
            "Expected message to contain READMATES_IP_HASH_BASE_SECRET but was: ${ex.message}",
        )
    }

    @Test
    fun `unset profile (production-like) with blank secret throws`() {
        val env = MockEnvironment() // no active profiles set → production-like
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = false)

        val ex = assertThrows(IllegalStateException::class.java) {
            props.validate(env)
        }
        assertTrue(
            ex.message?.contains("READMATES_IP_HASH_BASE_SECRET") == true,
            "Expected message to contain READMATES_IP_HASH_BASE_SECRET but was: ${ex.message}",
        )
    }

    @Test
    fun `test profile with allowEmptySecret=true and blank secret does not throw`() {
        val env = MockEnvironment().apply {
            setActiveProfiles("test")
        }
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = true)

        assertDoesNotThrow {
            props.validate(env)
        }
    }

    @Test
    fun `non-blank secret with production profile does not throw`() {
        val env = MockEnvironment().apply {
            setActiveProfiles("production")
        }
        val props = ClientIpHashingProperties(baseSecret = "real-secret-value", allowEmptySecret = false)

        assertDoesNotThrow {
            props.validate(env)
        }
    }
}
