package com.readmates.session.domain

import org.junit.jupiter.api.Assertions.assertEquals
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
}
