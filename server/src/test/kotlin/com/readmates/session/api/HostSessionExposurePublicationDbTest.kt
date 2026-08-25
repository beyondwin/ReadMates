package com.readmates.session.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
@Suppress("LargeClass")
class HostSessionExposurePublicationDbTest(
    @Autowired mockMvc: MockMvc,
    @Autowired jdbcTemplate: JdbcTemplate,
) : HostSessionAtomicityDbTestSupport(mockMvc, jdbcTemplate) {
    @Test
    fun `publication envelope requires expected revisions exactly for the supplied axes`() {
        val sessionId = createDraft("exact publication axes", "key-axis-create-01").first
        val initial = versions(sessionId)
        val epochBefore = recordEpoch()

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-axis-extra-exposure-01",
                        """{"publicationRevision":0,"exposureRevision":0}""",
                        """{"publicSummary":"axis summary","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isBadRequest() } }

        assertThat(versions(sessionId)).isEqualTo(initial)
        assertThat(publicContentCount(sessionId)).isZero()
        assertThat(recordEpoch()).isEqualTo(epochBefore)
        assertThat(operationReceiptCount(sessionId, "SESSION_PUBLICATION")).isZero()
    }

    @Test
    fun `publication idempotency distinguishes omitted placement from explicit hidden and legacy audience`() {
        val omittedSession = closedGuestReadableSession("canonical omitted placement")
        val omittedReplayFixture = "fixture-omitted-placement"
        mockMvc
            .put("/api/host/sessions/$omittedSession/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        omittedReplayFixture,
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"canonical summary","visibility":"MEMBER"}""",
                    )
            }.andExpect { status { isOk() } }
        val afterOmitted = atomicFingerprint(omittedSession)

        mockMvc
            .put("/api/host/sessions/$omittedSession/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        omittedReplayFixture,
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"canonical summary","siteVisibility":"HIDDEN","visibility":"MEMBER"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        assertThat(atomicFingerprint(omittedSession)).isEqualTo(afterOmitted)

        val legacySession = closedGuestReadableSession("canonical legacy audience")
        val legacyReplayFixture = "fixture-legacy-audience"
        mockMvc
            .put("/api/host/sessions/$legacySession/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        legacyReplayFixture,
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"legacy summary","visibility":"MEMBER"}""",
                    )
            }.andExpect { status { isOk() } }
        val afterMember = atomicFingerprint(legacySession)
        mockMvc
            .put("/api/host/sessions/$legacySession/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        legacyReplayFixture,
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"legacy summary","visibility":"PUBLIC"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        assertThat(atomicFingerprint(legacySession)).isEqualTo(afterMember)
    }

    @Test
    fun `publication envelope rejects unknown command fields before mutation`() {
        val sessionId = createDraft("publication unknown command", "key-command-create-01").first
        val before = atomicFingerprint(sessionId)

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-command-extra-01",
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"summary","visibility":"MEMBER","rawPayload":"forbidden"}""",
                    )
            }.andExpect { status { isBadRequest() } }

        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)
    }

    @Test
    fun `semantic publication no-op keeps revisions and epoch while exact replay keeps one new receipt`() {
        val sessionId = closedGuestReadableSession("semantic publication no-op")
        val initial = versions(sessionId)
        val epochBeforeFirst = recordEpoch()

        putPublication(
            sessionId = sessionId,
            key = "key-semantic-first-01",
            expectedExposure = initial.exposure,
            expectedPublication = initial.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "HIDDEN",
            summary = "semantic summary",
        )
        val first = versions(sessionId)
        val firstUpdatedAt = sessionUpdatedAt(sessionId)
        assertThat(first.exposure).isEqualTo(initial.exposure)
        assertThat(first.publication).isEqualTo(initial.publication + 1)
        assertThat(recordEpoch()).isEqualTo(epochBeforeFirst + 1)

        val epochBeforeNoop = recordEpoch()
        val receiptsBeforeNoop = operationReceiptCount(sessionId, "SESSION_PUBLICATION")
        putPublication(
            sessionId = sessionId,
            key = "key-semantic-noop-01",
            expectedExposure = first.exposure,
            expectedPublication = first.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "HIDDEN",
            summary = "semantic summary",
        )
        val afterNoop = versions(sessionId)
        assertThat(afterNoop).isEqualTo(first)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(firstUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(epochBeforeNoop)
        assertThat(operationReceiptCount(sessionId, "SESSION_PUBLICATION")).isEqualTo(receiptsBeforeNoop + 1)

        putPublication(
            sessionId = sessionId,
            key = "key-semantic-noop-01",
            expectedExposure = first.exposure,
            expectedPublication = first.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "HIDDEN",
            summary = "semantic summary",
        )
        assertThat(versions(sessionId)).isEqualTo(first)
        assertThat(recordEpoch()).isEqualTo(epochBeforeNoop)
        assertThat(operationReceiptCount(sessionId, "SESSION_PUBLICATION")).isEqualTo(receiptsBeforeNoop + 1)

        putPublication(
            sessionId = sessionId,
            key = "key-semantic-site-change-01",
            expectedExposure = first.exposure,
            expectedPublication = first.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "PUBLIC_RECORD",
            summary = "semantic summary",
        )
        val afterSiteChange = versions(sessionId)
        assertThat(afterSiteChange.exposure).isEqualTo(first.exposure)
        assertThat(afterSiteChange.publication).isEqualTo(first.publication + 1)
        assertThat(recordEpoch()).isEqualTo(epochBeforeNoop + 1)
    }

    @Test
    @Suppress("LongMethod")
    fun `legacy visibility classifies placement changes and compatibility repairs without counterfeit revisions`() {
        val closedSession = closedGuestReadableSession("legacy placement classification")
        placePublicRecord(closedSession, "legacy placement summary", "key-legacy-placement-setup-01")
        saveRecordDraft(closedSession, "legacy placement reviewed", "MEMBER")
        val beforeHide = versions(closedSession)
        val beforeHideUpdatedAt = sessionUpdatedAt(closedSession)
        val beforeHideEpoch = recordEpoch()
        val beforeHideAudit = changeAuditCount(closedSession)

        patchLegacyVisibility(closedSession, "MEMBER")

        val hidden = versions(closedSession)
        val hiddenUpdatedAt = sessionUpdatedAt(closedSession)
        assertThat(hidden.exposure).isEqualTo(beforeHide.exposure)
        assertThat(hidden.publication).isEqualTo(beforeHide.publication + 1)
        assertThat(hiddenUpdatedAt).isAfter(beforeHideUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(beforeHideEpoch + 1)
        assertThat(changeAuditCount(closedSession)).isEqualTo(beforeHideAudit)
        assertThat(recordEditorDraftStale(closedSession)).isTrue()
        assertExposure(closedSession, "GUEST_READABLE", "MEMBER", "HIDDEN", "MEMBER", false, "legacy placement summary")

        patchLegacyVisibility(closedSession, "MEMBER")

        assertThat(versions(closedSession)).isEqualTo(hidden)
        assertThat(sessionUpdatedAt(closedSession)).isEqualTo(hiddenUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(beforeHideEpoch + 1)
        assertThat(changeAuditCount(closedSession)).isEqualTo(beforeHideAudit)

        patchLegacyVisibility(closedSession, "PUBLIC")

        val publicAgain = versions(closedSession)
        assertThat(publicAgain.exposure).isEqualTo(hidden.exposure)
        assertThat(publicAgain.publication).isEqualTo(hidden.publication + 1)
        assertThat(sessionUpdatedAt(closedSession)).isAfter(hiddenUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(beforeHideEpoch + 2)
        assertExposure(
            closedSession,
            "GUEST_READABLE",
            "PUBLIC",
            "PUBLIC_RECORD",
            "PUBLIC",
            true,
            "legacy placement summary",
        )

        val publishedSession = publishedSessionWithInitialRecord()
        val publishedBefore = versions(publishedSession)
        val publishedUpdatedAt = sessionUpdatedAt(publishedSession)
        val publishedEpoch = recordEpoch()

        patchLegacyVisibility(publishedSession, "MEMBER")

        assertThat(versions(publishedSession).publication).isEqualTo(publishedBefore.publication + 1)
        assertThat(sessionUpdatedAt(publishedSession)).isAfter(publishedUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(publishedEpoch + 1)
    }

    @Test
    fun `legacy visibility compatibility repair signals once without domain revision bumps`() {
        val sessionId = closedGuestReadableSession("legacy compatibility repair")
        putPublication(
            sessionId = sessionId,
            key = "key-legacy-compat-setup-01",
            expectedExposure = exposureRevision(sessionId),
            expectedPublication = publicationRevision(sessionId),
            accessScope = "GUEST_READABLE",
            siteVisibility = "HIDDEN",
            summary = "legacy compatibility repair summary",
        )
        val canonical = versions(sessionId)
        jdbcTemplate.update("update sessions set visibility = 'PUBLIC' where id = ?", sessionId)
        jdbcTemplate.update(
            """
            update public_session_publications
            set visibility = 'PUBLIC', is_public = true, published_at = utc_timestamp(6)
            where session_id = ?
            """.trimIndent(),
            sessionId,
        )
        val beforeRepairAt = sessionUpdatedAt(sessionId)
        val beforeRepairEpoch = recordEpoch()
        val beforeRepairAudit = changeAuditCount(sessionId)

        patchLegacyVisibility(sessionId, "MEMBER")

        val repairedAt = sessionUpdatedAt(sessionId)
        assertThat(versions(sessionId)).isEqualTo(canonical)
        assertThat(repairedAt).isAfter(beforeRepairAt)
        assertThat(recordEpoch()).isEqualTo(beforeRepairEpoch + 1)
        assertThat(changeAuditCount(sessionId)).isEqualTo(beforeRepairAudit)
        assertExposure(
            sessionId,
            "GUEST_READABLE",
            "MEMBER",
            "HIDDEN",
            "MEMBER",
            false,
            "legacy compatibility repair summary",
        )

        patchLegacyVisibility(sessionId, "MEMBER")

        assertThat(versions(sessionId)).isEqualTo(canonical)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(repairedAt)
        assertThat(recordEpoch()).isEqualTo(beforeRepairEpoch + 1)
        assertThat(changeAuditCount(sessionId)).isEqualTo(beforeRepairAudit)
    }

    @Test
    @Suppress("LongMethod")
    fun `legacy flat access and publication detect semantic changes and true no-ops`() {
        val sessionId = closedGuestReadableSession("legacy semantic detector")
        val initial = versions(sessionId)
        val initialUpdatedAt = sessionUpdatedAt(sessionId)
        val initialEpoch = recordEpoch()

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"accessScope":"GUEST_READABLE"}"""
            }.andExpect { status { isOk() } }
        assertThat(versions(sessionId)).isEqualTo(initial)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(initialUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(initialEpoch)

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"accessScope":"HOST_ONLY"}"""
            }.andExpect { status { isOk() } }
        val afterAccess = versions(sessionId)
        val afterAccessUpdatedAt = sessionUpdatedAt(sessionId)
        assertThat(afterAccess.exposure).isEqualTo(initial.exposure + 1)
        assertThat(afterAccess.publication).isEqualTo(initial.publication)
        assertThat(recordEpoch()).isEqualTo(initialEpoch + 1)

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"accessScope":"HOST_ONLY"}"""
            }.andExpect { status { isOk() } }
        assertThat(versions(sessionId)).isEqualTo(afterAccess)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(afterAccessUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(initialEpoch + 1)

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {"publicSummary":"legacy detector summary","siteVisibility":"HIDDEN","visibility":"MEMBER"}
                    """.trimIndent()
            }.andExpect { status { isOk() } }
        val afterPublication = versions(sessionId)
        val afterPublicationUpdatedAt = sessionUpdatedAt(sessionId)
        assertThat(afterPublication.exposure).isEqualTo(afterAccess.exposure)
        assertThat(afterPublication.publication).isEqualTo(afterAccess.publication + 1)
        assertThat(recordEpoch()).isEqualTo(initialEpoch + 2)

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {"publicSummary":"legacy detector summary","siteVisibility":"HIDDEN","visibility":"MEMBER"}
                    """.trimIndent()
            }.andExpect { status { isOk() } }
        assertThat(versions(sessionId)).isEqualTo(afterPublication)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(afterPublicationUpdatedAt)
        assertThat(recordEpoch()).isEqualTo(initialEpoch + 2)
    }

    @Test
    fun `compatibility-only publication repair signals once without bumping domain revisions`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "compatibility repair", "HOST_ONLY")
        val correction = versions(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-compat-correction-01", correctionVector(correction), "{}")
            }.andExpect { status { isOk() } }
        val canonical = versions(sessionId)
        jdbcTemplate.update("update sessions set visibility = 'PUBLIC' where id = ?", sessionId)
        val epochBeforeRepair = recordEpoch()

        putPublication(
            sessionId = sessionId,
            key = "key-compat-repair-01",
            expectedExposure = canonical.exposure,
            expectedPublication = canonical.publication,
            accessScope = "HOST_ONLY",
            siteVisibility = "HIDDEN",
            summary = "compatibility repair summary",
        )

        assertThat(versions(sessionId)).isEqualTo(canonical)
        assertThat(recordEpoch()).isEqualTo(epochBeforeRepair + 1)
        assertExposure(sessionId, "HOST_ONLY", "MEMBER", "HIDDEN", "MEMBER", false, "compatibility repair summary")

        val repairedAt = sessionUpdatedAt(sessionId)
        putPublication(
            sessionId = sessionId,
            key = "key-compat-repair-noop-01",
            expectedExposure = canonical.exposure,
            expectedPublication = canonical.publication,
            accessScope = "HOST_ONLY",
            siteVisibility = "HIDDEN",
            summary = "compatibility repair summary",
        )
        assertThat(versions(sessionId)).isEqualTo(canonical)
        assertThat(recordEpoch()).isEqualTo(epochBeforeRepair + 1)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(repairedAt)
    }

    @Test
    @Suppress("LongMethod")
    fun `unauthenticated and non-host exposure publication and correction commit nothing`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "authorization", "PUBLIC")
        val current = versions(sessionId)
        val before = atomicFingerprint(sessionId)

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-unauth-access-01",
                        """{"exposureRevision":${current.exposure}}""",
                        """{"accessScope":"HOST_ONLY"}""",
                    )
            }.andExpect { status { isUnauthorized() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-unauth-publication-01",
                        """{"publicationRevision":${current.publication}}""",
                        """{"publicSummary":"unauthorized","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isUnauthorized() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-unauth-correction-01", correctionVector(current), "{}")
            }.andExpect { status { isUnauthorized() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                with(user("member1@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-member-access-01",
                        """{"exposureRevision":${current.exposure}}""",
                        """{"accessScope":"HOST_ONLY"}""",
                    )
            }.andExpect { status { isForbidden() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(user("member1@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-member-publication-01",
                        """{"publicationRevision":${current.publication}}""",
                        """{"publicSummary":"unauthorized","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isForbidden() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                with(user("member1@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-member-correction-01", correctionVector(current), "{}")
            }.andExpect { status { isForbidden() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)
    }

    @Test
    fun `host exposure publication and correction fail closed for another club session`() {
        createOutsideClubSession()
        val sessionId = OUTSIDE_SESSION_ID
        val before = atomicFingerprint(sessionId)

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-cross-access-01",
                        """{"exposureRevision":0}""",
                        """{"accessScope":"HOST_ONLY"}""",
                    )
            }.andExpect { status { isNotFound() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-cross-publication-01",
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"cross club","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isNotFound() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)

        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-cross-correction-01",
                        """
                        {"sessionRevision":0,"recordDraftRevision":1,"liveRecordRevision":1,
                         "exposureRevision":0,"publicationRevision":0}
                        """.trimIndent(),
                        "{}",
                    )
            }.andExpect { status { isNotFound() } }
        assertThat(atomicFingerprint(sessionId)).isEqualTo(before)
        assertThat(recordEpoch()).isEqualTo(before.recordEpoch)
    }

    @Test
    fun `dual access and placement validates both revisions and stale command commits nothing`() {
        val sessionId = createDraft("dual exposure", "key-dual-create-01").first
        val epochBefore = recordEpoch()

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-dual-write-01",
                        """{"exposureRevision":0,"publicationRevision":0}""",
                        """{"publicSummary":"dual summary","accessScope":"GUEST_READABLE","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isOk() } }

        assertThat(exposureRevision(sessionId)).isEqualTo(1)
        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertExposure(sessionId, "GUEST_READABLE", "MEMBER", "HIDDEN", "MEMBER", false, "dual summary")

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-dual-write-01",
                        """{"exposureRevision":1,"publicationRevision":1}""",
                        """{"publicSummary":"dual summary","accessScope":"HOST_ONLY","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-dual-stale-01",
                        """{"exposureRevision":0,"publicationRevision":0}""",
                        """{"publicSummary":"must not commit","accessScope":"HOST_ONLY","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }

        assertThat(exposureRevision(sessionId)).isEqualTo(1)
        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertExposure(sessionId, "GUEST_READABLE", "MEMBER", "HIDDEN", "MEMBER", false, "dual summary")
    }

    @Test
    fun `concurrent first public placement from revision zero has one winner and one conflict`() {
        val sessionId = closedGuestReadableSession("first placement")
        assertThat(publicationRevision(sessionId)).isZero()
        assertThat(publicContentCount(sessionId)).isZero()
        val epochBefore = recordEpoch()
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val responses =
                listOf("alpha", "beta").map { suffix ->
                    executor.submit<Int> {
                        ready.countDown()
                        start.await()
                        mockMvc
                            .put("/api/host/sessions/$sessionId/publication") {
                                with(user("host@example.com"))
                                with(csrf())
                                contentType = MediaType.APPLICATION_JSON
                                content =
                                    envelope(
                                        "key-first-$suffix-01",
                                        """{"publicationRevision":0}""",
                                        """{"publicSummary":"winner $suffix","siteVisibility":"PUBLIC_RECORD"}""",
                                    )
                            }.andReturn()
                            .response.status
                    }
                }
            ready.await()
            start.countDown()

            assertThat(responses.map { it.get() }.sorted()).containsExactly(200, 409)
        } finally {
            executor.shutdownNow()
        }

        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        assertThat(publicContentCount(sessionId)).isEqualTo(1)
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertThat(publicSummary(sessionId)).isIn("winner alpha", "winner beta")
    }

    @Test
    @Suppress("LongMethod")
    fun `stale publish and correction preserve old live while correction commits every origin projection once`() {
        val sessionId = publishedSessionWithInitialRecord()
        val oldRevisionId = latestRevisionId(sessionId)
        val oldSnapshot = revisionSnapshot(oldRevisionId)

        saveRecordDraft(sessionId, "corrected", "PUBLIC")
        val current = versions(sessionId)
        assertCorrectionPreview(sessionId, current, "GUEST_READABLE", "PUBLIC_RECORD", "PUBLIC")
        val epochBeforeStale = recordEpoch()
        val initialOriginTexts = originTexts(sessionId)
        val initialRevisionCount = revisionCount(sessionId)
        val initialApplyReceiptCount = applyReceiptCount(sessionId)
        val initialPublishReceiptCount = operationReceiptCount(sessionId, "SESSION_PUBLISH")
        val initialCorrectionReceiptCount = operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH")
        val initialPublicGeneration = publicProjectionGeneration(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-publish-stale-live-01",
                        publishVector(current.copy(live = current.live + 1)),
                        "{}",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-correction-stale-01",
                        correctionVector(current.copy(live = current.live + 1)),
                        "{}",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }

        assertThat(liveRecordRevision(sessionId)).isEqualTo(1)
        assertThat(publicSummary(sessionId)).isEqualTo("initial summary")
        assertThat(originTexts(sessionId)).isEqualTo(initialOriginTexts)
        assertThat(revisionSnapshot(oldRevisionId)).isEqualTo(oldSnapshot)
        assertThat(revisionCount(sessionId)).isEqualTo(initialRevisionCount)
        assertThat(recordDraftRevision(sessionId)).isEqualTo(1)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(initialApplyReceiptCount)
        assertThat(operationReceiptCount(sessionId, "SESSION_PUBLISH")).isEqualTo(initialPublishReceiptCount)
        assertThat(operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH"))
            .isEqualTo(initialCorrectionReceiptCount)
        assertThat(recordEpoch()).isEqualTo(epochBeforeStale)
        assertThat(publicProjectionGeneration(sessionId)).isEqualTo(initialPublicGeneration)

        val epochBefore = recordEpoch()
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-correction-green-01", correctionVector(current), "{}")
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
            }

        assertThat(liveRecordRevision(sessionId)).isEqualTo(2)
        assertThat(recordDraftRevision(sessionId)).isNull()
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertThat(revisionCount(sessionId)).isEqualTo(2)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(2)
        assertThat(operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH")).isEqualTo(1)
        assertThat(revisionSnapshot(oldRevisionId)).isEqualTo(oldSnapshot)
        assertThat(publicSummary(sessionId)).isEqualTo("corrected summary")
        assertThat(originTexts(sessionId)).containsExactly("corrected highlight", "corrected one line")
        assertThat(publicProjectionGeneration(sessionId)).isEqualTo(initialPublicGeneration + 1)
        assertThat(publicConvergenceLinks(sessionId, initialPublicGeneration + 1)).isEqualTo(1)

        assertCorrectedAudienceProjections(sessionId)
    }

    private fun assertCorrectedAudienceProjections(sessionId: String) {
        mockMvc
            .get("/api/archive/sessions/$sessionId") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("corrected summary") }
                jsonPath("$.publicHighlights[0].text") { value("corrected highlight") }
                jsonPath("$.publicOneLiners[0].text") { value("corrected one line") }
            }
        mockMvc
            .get("/api/public/clubs/reading-sai/browse/archive/$sessionId")
            .andExpect {
                status { isOk() }
                jsonPath("$.summary") { value("corrected summary") }
                jsonPath("$.highlights[0].text") { value("corrected highlight") }
                jsonPath("$.oneLiners[0].text") { value("corrected one line") }
            }
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$sessionId")
            .andExpect {
                status { isOk() }
                jsonPath("$.summary") { value("corrected summary") }
                jsonPath("$.highlights[0].text") { value("corrected highlight") }
                jsonPath("$.oneLiners[0].text") { value("corrected one line") }
            }
    }

    private fun publicProjectionGeneration(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select generation from public_projection_current where session_id = ?",
            Long::class.java,
            sessionId,
        ) ?: 0

    private fun publicConvergenceLinks(
        sessionId: String,
        generation: Long,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from public_mutation_convergence_links
            where session_id_snapshot = ? and committed_generation = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
            generation,
        ) ?: 0

    private fun assertCorrectionPreview(
        sessionId: String,
        versions: Versions,
        accessScope: String,
        siteVisibility: String,
        visibility: String,
    ) {
        mockMvc
            .get("/api/host/sessions/$sessionId/correction-publish-preview") {
                withHost()
            }.andExpect {
                status { isOk() }
                jsonPath("$.snapshotId") { isNotEmpty() }
                jsonPath("$.versions.sessionRevision") { value(versions.session) }
                jsonPath("$.versions.recordDraftRevision") { value(versions.draft) }
                jsonPath("$.versions.liveRecordRevision") { value(versions.live) }
                jsonPath("$.versions.exposureRevision") { value(versions.exposure) }
                jsonPath("$.versions.publicationRevision") { value(versions.publication) }
                jsonPath("$.versions.participantSetRevision") { doesNotExist() }
                jsonPath("$.accessScope") { value(accessScope) }
                jsonPath("$.siteVisibility") { value(siteVisibility) }
                jsonPath("$.visibility") { value(visibility) }
            }
    }

    private fun publishedSessionWithInitialRecord(): String {
        val sessionId = closedGuestReadableSession("correction publish")
        saveRecordDraft(sessionId, "initial", "MEMBER")
        val applyRequestId = UUID.randomUUID().toString()
        applyRecord(sessionId, applyRequestId, "key-initial-apply-$applyRequestId")
        placePublicRecord(sessionId, "initial summary", "key-initial-placement-${UUID.randomUUID()}")
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-initial-publish-${UUID.randomUUID()}", publishVectorJson(sessionId), "{}")
            }.andExpect { status { isOk() } }
        return sessionId
    }

    private fun closedGuestReadableSession(title: String): String {
        val sessionId = createDraft(title, "key-create-${UUID.randomUUID()}").first
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-access-${UUID.randomUUID()}",
                        """{"exposureRevision":0}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect { status { isOk() } }
        open(sessionId, sessionRevision(sessionId), "key-open-${UUID.randomUUID()}")
        close(
            sessionId,
            sessionRevision(sessionId),
            participantSetRevision(sessionId),
            attendanceSnapshotId(sessionId),
            "key-close-${UUID.randomUUID()}",
        )
        return sessionId
    }

    private fun saveRecordDraft(
        sessionId: String,
        label: String,
        visibility: String,
    ) {
        val displayName = hostDisplayName()
        val snapshot =
            jsonMapper.createObjectNode().apply {
                put("visibility", visibility)
                put("publicationSummary", "$label summary")
                putArray("highlights").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", displayName)
                    put("text", "$label highlight")
                }
                putArray("oneLineReviews").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", displayName)
                    put("text", "$label one line")
                }
                putObject("feedbackDocument").apply {
                    put("fileName", "$label-feedback.md")
                    put("title", "$label feedback")
                    put("markdown", feedbackMarkdown(label))
                }
            }
        val body =
            jsonMapper.createObjectNode().apply {
                putNull("expectedDraftRevision")
                set("snapshot", snapshot)
            }
        mockMvc
            .patch("/api/host/sessions/$sessionId/record-draft") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = body.toString()
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(1) }
            }
    }

    private fun applyRecord(
        sessionId: String,
        applyRequestId: String,
        key: String,
    ) {
        val hash =
            mockMvc
                .post("/api/host/sessions/$sessionId/record-apply-preview") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedDraftRevision":1,"expectedLiveRevision":0}"""
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let(jsonMapper::readTree)
                .get("expectedDraftHash")
                .asString()
        mockMvc
            .post("/api/host/sessions/$sessionId/record-apply") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        key,
                        """{"draftRevision":1,"liveRevision":0}""",
                        """{"applyRequestId":"$applyRequestId","expectedDraftHash":"$hash"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun placePublicRecord(
        sessionId: String,
        summary: String,
        key: String,
    ) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        key,
                        """{"publicationRevision":${publicationRevision(sessionId)}}""",
                        """{"publicSummary":"$summary","siteVisibility":"PUBLIC_RECORD"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun putPublication(
        sessionId: String,
        key: String,
        expectedExposure: Long,
        expectedPublication: Long,
        accessScope: String,
        siteVisibility: String,
        summary: String,
    ) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        key,
                        """{"publicationRevision":$expectedPublication,"exposureRevision":$expectedExposure}""",
                        """
                        {"publicSummary":"$summary","accessScope":"$accessScope",
                         "siteVisibility":"$siteVisibility"}
                        """.trimIndent(),
                    )
            }.andExpect { status { isOk() } }
    }

    private fun patchLegacyVisibility(
        sessionId: String,
        visibility: String,
    ) {
        mockMvc
            .patch("/api/host/sessions/$sessionId/visibility") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"$visibility"}"""
            }.andExpect { status { isOk() } }
    }

    private fun recordEditorDraftStale(sessionId: String): Boolean =
        mockMvc
            .get("/api/host/sessions/$sessionId/record-editor") {
                withHost()
            }.andExpect { status { isOk() } }
            .andReturn()
            .response.contentAsString
            .let(jsonMapper::readTree)
            .get("draftLiveBaseStale")
            .asBoolean()

    private fun publishVector(versions: Versions): String =
        """
        {"sessionRevision":${versions.session},"liveRecordRevision":${versions.live},
        "exposureRevision":${versions.exposure},"publicationRevision":${versions.publication}}
        """.trimIndent().replace("\n", "")

    private fun correctionVector(versions: Versions): String {
        val draft = requireNotNull(versions.draft)
        return """
            {"sessionRevision":${versions.session},"recordDraftRevision":$draft,
            "liveRecordRevision":${versions.live},"exposureRevision":${versions.exposure},
            "publicationRevision":${versions.publication}}
            """.trimIndent().replace("\n", "")
    }

    private fun assertExposure(
        sessionId: String,
        accessScope: String,
        sessionVisibility: String,
        siteVisibility: String,
        publicationVisibility: String,
        isPublic: Boolean,
        summary: String,
    ) {
        val row =
            jdbcTemplate.queryForMap(
                """
                select s.access_scope, s.visibility as session_visibility,
                       p.site_visibility, p.visibility as publication_visibility,
                       p.is_public, p.public_summary
                from sessions s
                join public_session_publications p on p.session_id = s.id and p.club_id = s.club_id
                where s.id = ?
                """.trimIndent(),
                sessionId,
            )
        assertThat(row["access_scope"]).isEqualTo(accessScope)
        assertThat(row["session_visibility"]).isEqualTo(sessionVisibility)
        assertThat(row["site_visibility"]).isEqualTo(siteVisibility)
        assertThat(row["publication_visibility"]).isEqualTo(publicationVisibility)
        assertThat(row["is_public"]).isEqualTo(isPublic)
        assertThat(row["public_summary"]).isEqualTo(summary)
    }

    private fun recordEpoch(): Long =
        jdbcTemplate.queryForObject(
            "select record_epoch from club_host_list_epochs where club_id = ?",
            Long::class.java,
            CLUB_ID,
        ) ?: error("missing record epoch")

    private fun publicSummary(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select public_summary from public_session_publications where session_id = ?",
            String::class.java,
            sessionId,
        ) ?: error("missing publication")

    private fun sessionUpdatedAt(sessionId: String): java.time.LocalDateTime =
        jdbcTemplate.queryForObject(
            "select updated_at from sessions where id = ?",
            java.time.LocalDateTime::class.java,
            sessionId,
        ) ?: error("missing session updated_at")

    private fun changeAuditCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_change_audit where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun hostDisplayName(): String =
        jdbcTemplate.queryForObject(
            """
            select users.name from memberships
            join users on users.id = memberships.user_id
            where memberships.id = ?
            """.trimIndent(),
            String::class.java,
            HOST_MEMBERSHIP_ID,
        ) ?: error("missing host")

    private fun latestRevisionId(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select id from session_record_revisions where session_id = ? order by version desc limit 1",
            String::class.java,
            sessionId,
        ) ?: error("missing revision")

    private fun revisionSnapshot(revisionId: String): String =
        jdbcTemplate.queryForObject(
            "select snapshot_json from session_record_revisions where id = ?",
            String::class.java,
            revisionId,
        ) ?: error("missing snapshot")

    private fun revisionCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_record_revisions where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    @Suppress("LongMethod")
    private fun atomicFingerprint(sessionId: String): AtomicFingerprint =
        AtomicFingerprint(
            session =
                jdbcTemplate.queryForMap(
                    """
                    select state, visibility, access_scope, session_revision, exposure_revision,
                           participant_set_revision, updated_at
                    from sessions where id = ?
                    """.trimIndent(),
                    sessionId,
                ),
            publication =
                jdbcTemplate.queryForList(
                    """
                    select p.public_summary, p.visibility, p.site_visibility, p.is_public,
                           p.published_at, p.updated_at, v.publication_revision
                    from public_session_publications p
                    left join session_publication_versions v on v.session_id = p.session_id
                    where p.session_id = ?
                    """.trimIndent(),
                    sessionId,
                ),
            origins =
                listOf("highlights", "one_line_reviews", "questions", "session_feedback_documents")
                    .associateWith { table ->
                        jdbcTemplate.queryForList("select * from $table where session_id = ? order by id", sessionId)
                    },
            history =
                jdbcTemplate.queryForList(
                    """
                    select id, version, source, restored_from_revision_id, snapshot_json,
                           snapshot_sha256, applied_by_membership_id, applied_at
                    from session_record_revisions where session_id = ? order by version
                    """.trimIndent(),
                    sessionId,
                ),
            drafts =
                jdbcTemplate.queryForList(
                    """
                    select base_live_revision, base_session_revision, base_exposure_revision,
                           base_publication_revision, base_vector_known,
                           draft_revision, source, restored_from_revision_id,
                           snapshot_json, snapshot_sha256, updated_by_membership_id, created_at, updated_at
                    from session_record_drafts where session_id = ?
                    """.trimIndent(),
                    sessionId,
                ),
            audits =
                mapOf(
                    "change" to
                        jdbcTemplate.queryForList(
                            "select * from host_session_change_audit where session_id = ? order by id",
                            sessionId,
                        ),
                    "lifecycle" to
                        jdbcTemplate.queryForList(
                            "select * from host_session_lifecycle_audit where session_id = ? order by id",
                            sessionId,
                        ),
                    "participant" to
                        jdbcTemplate.queryForList(
                            "select * from session_participant_change_audit where session_id = ? order by id",
                            sessionId,
                        ),
                ),
            featureReceipts =
                jdbcTemplate.queryForList(
                    """
                    select id, apply_request_id, club_id, session_id, host_membership_id,
                           expected_draft_revision, expected_live_revision, draft_sha256,
                           composer_event_type, revision_id, created_at
                    from session_record_apply_receipts where session_id = ? order by id
                    """.trimIndent(),
                    sessionId,
                ),
            hostReceipts =
                jdbcTemplate.queryForList(
                    "select * from host_session_mutation_receipts where resource_id = ? order by id",
                    sessionId,
                ),
            idempotencyRows =
                jdbcTemplate.queryForList(
                    """
                    select club_id, actor_membership_id, operation, resource_slot, idempotency_key,
                           canonical_schema_version, digest_key_version, hex(request_hmac) request_hmac_hex,
                           status, receipt_id, created_at, updated_at, expires_at
                    from mutation_idempotency_keys where resource_slot = ? order by operation, idempotency_key
                    """.trimIndent(),
                    sessionId,
                ),
            epochs =
                jdbcTemplate.queryForList(
                    """
                    select club_id, meeting_epoch, record_epoch
                    from club_host_list_epochs
                    where club_id in (?, ?)
                    order by club_id
                    """.trimIndent(),
                    CLUB_ID,
                    OUTSIDE_CLUB_ID,
                ),
            outbox =
                mapOf(
                    "event" to
                        jdbcTemplate.queryForList(
                            """
                            select id, club_id, event_type, aggregate_id, status, dedupe_key
                            from notification_event_outbox where aggregate_id = ? order by id
                            """.trimIndent(),
                            sessionId,
                        ),
                    "legacy" to
                        jdbcTemplate.queryForList(
                            """
                            select id, club_id, event_type, aggregate_id, status, dedupe_key
                            from notification_outbox where aggregate_id = ? order by id
                            """.trimIndent(),
                            sessionId,
                        ),
                ),
            liveRevision = liveRecordRevision(sessionId),
            revisionCount = revisionCount(sessionId),
            draftRevision = recordDraftRevision(sessionId),
            applyReceiptCount = applyReceiptCount(sessionId),
            hostReceiptCount =
                operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH") +
                    operationReceiptCount(sessionId, "SESSION_PUBLICATION"),
            recordEpoch = recordEpoch(),
        )

    @Suppress("LongMethod")
    private fun createOutsideClubSession() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'a7-outside-club', 'A7 outside', 'outside', 'outside authorization fixture')
            """.trimIndent(),
            OUTSIDE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name)
            values (?, 'a7-outside-subject', 'a7-outside@example.test', 'A7 outside host', 'outside')
            """.trimIndent(),
            OUTSIDE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'outside', 'mushroom-green-book')
            """.trimIndent(),
            OUTSIDE_MEMBERSHIP_ID,
            OUTSIDE_CLUB_ID,
            OUTSIDE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at,
              state, visibility, access_scope
            ) values (?, ?, 1, 'Outside session', 'Outside book', 'Outside author', '2026-09-04',
                      '20:00:00', '22:00:00', '온라인', '2026-09-03 14:59:00',
                      'PUBLISHED', 'MEMBER', 'GUEST_READABLE')
            """.trimIndent(),
            OUTSIDE_SESSION_ID,
            OUTSIDE_CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into session_publication_versions (session_id, publication_revision) values (?, 0)",
            OUTSIDE_SESSION_ID,
        )
        jdbcTemplate.update(
            "insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch) values (?, 0, 0)",
            OUTSIDE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, site_visibility
            ) values (?, ?, ?, 'outside summary', false, 'MEMBER', 'HIDDEN')
            """.trimIndent(),
            OUTSIDE_PUBLICATION_ID,
            OUTSIDE_CLUB_ID,
            OUTSIDE_SESSION_ID,
        )
        val snapshot =
            jsonMapper
                .createObjectNode()
                .apply {
                    put("schema", "readmates-session-record:v1")
                    put("visibility", "MEMBER")
                    put("publicationSummary", "outside correction")
                    putArray("highlights")
                    putArray("oneLineReviews")
                    putObject("feedbackDocument").apply {
                        put("fileName", "outside.md")
                        put("title", "outside")
                        put("markdown", "")
                    }
                }.toString()
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, snapshot_json, snapshot_sha256,
              applied_by_membership_id
            ) values (?, ?, ?, 1, 'MANUAL', ?, ?, ?)
            """.trimIndent(),
            OUTSIDE_REVISION_ID,
            OUTSIDE_SESSION_ID,
            OUTSIDE_CLUB_ID,
            snapshot,
            "a".repeat(64),
            OUTSIDE_MEMBERSHIP_ID,
        )
        jdbcTemplate.update(
            """
            insert into session_record_drafts (
              session_id, club_id, base_live_revision, base_session_revision,
              base_exposure_revision, base_publication_revision, base_vector_known, base_session_updated_at,
              draft_revision, source, snapshot_json, snapshot_sha256, updated_by_membership_id
            )
            select id, club_id, 1, session_revision, exposure_revision, 0, true, updated_at,
                   1, 'MANUAL', ?, ?, ?
            from sessions where id = ? and club_id = ?
            """.trimIndent(),
            snapshot,
            "b".repeat(64),
            OUTSIDE_MEMBERSHIP_ID,
            OUTSIDE_SESSION_ID,
            OUTSIDE_CLUB_ID,
        )
    }

    private fun applyReceiptCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_record_apply_receipts where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun operationReceiptCount(
        sessionId: String,
        operation: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_mutation_receipts where resource_id = ? and operation = ?",
            Int::class.java,
            sessionId,
            operation,
        ) ?: 0

    private fun originTexts(sessionId: String): List<String> =
        listOf(
            jdbcTemplate.queryForObject(
                "select text from highlights where session_id = ? order by sort_order limit 1",
                String::class.java,
                sessionId,
            ) ?: error("missing highlight"),
            jdbcTemplate.queryForObject(
                "select text from one_line_reviews where session_id = ? order by created_at limit 1",
                String::class.java,
                sessionId,
            ) ?: error("missing one line"),
        )

    private fun feedbackMarkdown(label: String) =
        """
        <!-- readmates-feedback:v1 -->

        # 독서모임 1차 피드백

        Book · 2026.09.04

        ## 메타

        - 책: Book

        ## 관찰자 노트

        $label note.

        ## 참여자별 피드백

        ### 01. Member

        역할: 참여자

        #### 참여 스타일

        Steady.

        #### 실질 기여

        - Shared a perspective.

        #### 문제점과 자기모순

        ##### 1. Scope

        - 핵심: Broad.
        - 근거: Several examples.
        - 해석: Narrow it.

        #### 실천 과제

        1. Lead with the conclusion.

        #### 드러난 한 문장

        > Keep it focused.

        맥락: Test

        주석: Test fixture.
        """.trimIndent()

    private data class AtomicFingerprint(
        val session: Map<String, Any?>,
        val publication: List<Map<String, Any?>>,
        val origins: Map<String, List<Map<String, Any?>>>,
        val history: List<Map<String, Any?>>,
        val drafts: List<Map<String, Any?>>,
        val audits: Map<String, List<Map<String, Any?>>>,
        val featureReceipts: List<Map<String, Any?>>,
        val hostReceipts: List<Map<String, Any?>>,
        val idempotencyRows: List<Map<String, Any?>>,
        val epochs: List<Map<String, Any?>>,
        val outbox: Map<String, List<Map<String, Any?>>>,
        val liveRevision: Long,
        val revisionCount: Int,
        val draftRevision: Long?,
        val applyReceiptCount: Int,
        val hostReceiptCount: Int,
        val recordEpoch: Long,
    )

    private companion object {
        const val OUTSIDE_CLUB_ID = "00000000-0000-0000-0000-000000079001"
        const val OUTSIDE_USER_ID = "00000000-0000-0000-0000-000000079101"
        const val OUTSIDE_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000079201"
        const val OUTSIDE_SESSION_ID = "00000000-0000-0000-0000-000000079777"
        const val OUTSIDE_PUBLICATION_ID = "00000000-0000-0000-0000-000000079778"
        const val OUTSIDE_REVISION_ID = "00000000-0000-0000-0000-000000079779"
    }
}

internal const val CLEANUP_EXPOSURE_PUBLICATION_SQL = """
    delete from mutation_idempotency_keys where club_id = '00000000-0000-0000-0000-000000079001';
    delete from host_session_mutation_receipts where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_record_apply_receipts where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_record_drafts where club_id = '00000000-0000-0000-0000-000000079001';
    delete from host_session_change_audit where club_id = '00000000-0000-0000-0000-000000079001';
    delete from host_session_lifecycle_audit where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_participant_change_audit where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_feedback_documents where club_id = '00000000-0000-0000-0000-000000079001';
    delete from highlights where club_id = '00000000-0000-0000-0000-000000079001';
    delete from one_line_reviews where club_id = '00000000-0000-0000-0000-000000079001';
    delete from questions where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_record_revisions where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_participants where club_id = '00000000-0000-0000-0000-000000079001';
    delete from public_session_publications where club_id = '00000000-0000-0000-0000-000000079001';
    delete from session_publication_versions where session_id = '00000000-0000-0000-0000-000000079777';
    delete from notification_event_outbox where club_id = '00000000-0000-0000-0000-000000079001';
    delete from notification_outbox where club_id = '00000000-0000-0000-0000-000000079001';
    delete from sessions where id = '00000000-0000-0000-0000-000000079777';
    delete from club_host_list_epochs where club_id = '00000000-0000-0000-0000-000000079001';
    delete from memberships where club_id = '00000000-0000-0000-0000-000000079001';
    delete from users where id = '00000000-0000-0000-0000-000000079101';
    delete from clubs where id = '00000000-0000-0000-0000-000000079001' or slug = 'a7-outside-club';
    delete from session_record_apply_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_record_drafts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from mutation_idempotency_keys
    where club_id = '00000000-0000-0000-0000-000000000001'
      and actor_membership_id = '00000000-0000-0000-0000-000000000201';
    delete from host_session_mutation_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and resource_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from host_session_change_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_feedback_documents
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from highlights
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from one_line_reviews
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from questions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_record_revisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_participants
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_publication_versions
    where session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from public_session_publications
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
