package com.readmates.session.domain

import com.readmates.sessionrecord.application.model.SessionRecordAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordAudienceProjection
import com.readmates.sessionrecord.application.model.SessionRecordSiteVisibility
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.toAudienceProjection
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
        assertEquals(
            CompatibilityExposure("MEMBER", "MEMBER", false),
            SessionExposure(
                SessionAccessScope.HOST_ONLY,
                PublicSiteVisibility.HIDDEN,
            ).toCompatibility("PUBLISHED"),
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

    @Test
    fun `ordinary public record apply keeps placement hidden until the session is closed`() {
        val hidden =
            SessionRecordAudienceProjection(
                accessScope = SessionRecordAccessScope.GUEST_READABLE,
                siteVisibility = SessionRecordSiteVisibility.HIDDEN,
                visibility = SessionRecordVisibility.PUBLIC,
                sessionCompatibilityVisibility = SessionRecordVisibility.MEMBER,
                publicationVisibility = SessionRecordVisibility.MEMBER,
                isPublic = false,
            )
        val public =
            SessionRecordAudienceProjection(
                accessScope = SessionRecordAccessScope.GUEST_READABLE,
                siteVisibility = SessionRecordSiteVisibility.PUBLIC_RECORD,
                visibility = SessionRecordVisibility.PUBLIC,
                sessionCompatibilityVisibility = SessionRecordVisibility.PUBLIC,
                publicationVisibility = SessionRecordVisibility.PUBLIC,
                isPublic = true,
            )

        assertEquals(hidden, SessionRecordVisibility.PUBLIC.toAudienceProjection("DRAFT"))
        assertEquals(hidden, SessionRecordVisibility.PUBLIC.toAudienceProjection("OPEN"))
        assertEquals(public, SessionRecordVisibility.PUBLIC.toAudienceProjection("CLOSED"))
        assertEquals(public, SessionRecordVisibility.PUBLIC.toAudienceProjection("PUBLISHED"))
    }
}
