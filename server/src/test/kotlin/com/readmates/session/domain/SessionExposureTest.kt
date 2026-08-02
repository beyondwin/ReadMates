package com.readmates.session.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class SessionExposureTest {
    @Test
    fun `compatibility values map to independent guest and public-site axes`() {
        assertEquals(
            SessionExposure(SessionAccessScope.HOST_ONLY, PublicSiteVisibility.HIDDEN),
            SessionExposure.fromCompatibility("DRAFT", "HOST_ONLY", null, false),
        )
        assertEquals(
            SessionExposure(SessionAccessScope.GUEST_READABLE, PublicSiteVisibility.HIDDEN),
            SessionExposure.fromCompatibility("DRAFT", "MEMBER", null, false),
        )
        assertEquals(
            SessionExposure(SessionAccessScope.GUEST_READABLE, PublicSiteVisibility.PUBLIC_RECORD),
            SessionExposure.fromCompatibility("PUBLISHED", "PUBLIC", "PUBLIC", true),
        )
        assertEquals(
            SessionExposure(SessionAccessScope.GUEST_READABLE, PublicSiteVisibility.HIDDEN),
            SessionExposure.fromCompatibility("OPEN", "PUBLIC", "PUBLIC", true),
        )
    }

    @Test
    fun `canonical exposure maps to one-release compatibility columns`() {
        assertEquals(
            CompatibilityExposure("HOST_ONLY", "MEMBER", false),
            SessionExposure(
                SessionAccessScope.HOST_ONLY,
                PublicSiteVisibility.HIDDEN,
            ).toCompatibility("DRAFT"),
        )
        assertEquals(
            CompatibilityExposure("MEMBER", "MEMBER", false),
            SessionExposure(
                SessionAccessScope.GUEST_READABLE,
                PublicSiteVisibility.HIDDEN,
            ).toCompatibility("OPEN"),
        )
        assertEquals(
            CompatibilityExposure("PUBLIC", "PUBLIC", true),
            SessionExposure(
                SessionAccessScope.GUEST_READABLE,
                PublicSiteVisibility.PUBLIC_RECORD,
            ).toCompatibility("CLOSED"),
        )
    }

    @Test
    fun `host-only public-record exposure is invalid`() {
        assertThrows(IllegalArgumentException::class.java) {
            SessionExposure(
                SessionAccessScope.HOST_ONLY,
                PublicSiteVisibility.PUBLIC_RECORD,
            ).toCompatibility("CLOSED")
        }
    }
}
