package com.readmates.session.application.model

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.adapter.`in`.web.AttendanceVersionBody
import com.readmates.session.adapter.`in`.web.HostSessionRequest
import com.readmates.session.adapter.`in`.web.SessionVersionVectorBody
import com.readmates.session.adapter.`in`.web.toBody
import com.readmates.session.application.HostSessionAttendee
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.toAttendanceVersion
import com.readmates.session.application.toSessionVersionVector
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class HostSessionRevisionModelsTest {
    private val jsonMapper = JsonMapper.builder().findAndAddModules().build()
    private val resourceId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000052101")
    private val membershipId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000052102")

    @Test
    fun `session version vector json uses camelCase field names`() {
        val json = jsonMapper.writeValueAsString(sampleVector())
        val node = jsonMapper.readTree(json)

        assertThat(node.propertyNames().toSet()).containsExactlyInAnyOrder(
            "sessionRevision",
            "scheduleRevision",
            "exposureRevision",
            "participantSetRevision",
            "recordDraftRevision",
            "liveRecordRevision",
            "publicationRevision",
        )
        assertThat(node.get("sessionRevision").asLong()).isEqualTo(3)
        assertThat(node.get("scheduleRevision").asLong()).isEqualTo(1)
        assertThat(node.get("exposureRevision").asLong()).isEqualTo(1)
        assertThat(node.get("participantSetRevision").asLong()).isEqualTo(4)
        assertThat(node.get("recordDraftRevision").asLong()).isEqualTo(2)
        assertThat(node.get("liveRecordRevision").asLong()).isEqualTo(5)
        assertThat(node.get("publicationRevision").asLong()).isEqualTo(6)
        assertThat(node.get("snapshotId")).isNull()
    }

    @Test
    fun `attendance version json uses camelCase field names`() {
        val json =
            jsonMapper.writeValueAsString(
                AttendanceVersion(membershipId = membershipId, attendanceRevision = 7),
            )
        val node = jsonMapper.readTree(json)

        assertThat(node.propertyNames().toSet()).containsExactlyInAnyOrder(
            "membershipId",
            "attendanceRevision",
        )
        assertThat(node.get("membershipId").asString()).isEqualTo(membershipId.toString())
        assertThat(node.get("attendanceRevision").asLong()).isEqualTo(7)
    }

    @Test
    fun `web bodies round-trip the same json field names`() {
        val vectorBody = sampleVector().toBody()
        val attendanceBody = AttendanceVersion(membershipId, 8).toBody()

        val vectorNode = jsonMapper.readTree(jsonMapper.writeValueAsString(vectorBody))
        val attendanceNode = jsonMapper.readTree(jsonMapper.writeValueAsString(attendanceBody))

        assertThat(vectorNode.propertyNames().toSet()).containsExactlyInAnyOrder(
            "sessionRevision",
            "scheduleRevision",
            "exposureRevision",
            "participantSetRevision",
            "recordDraftRevision",
            "liveRecordRevision",
            "publicationRevision",
        )
        assertThat(attendanceNode.propertyNames().toSet()).containsExactlyInAnyOrder(
            "membershipId",
            "attendanceRevision",
        )
        assertThat(vectorBody.toModel()).isEqualTo(sampleVector())
        assertThat(attendanceBody.toModel()).isEqualTo(AttendanceVersion(membershipId, 8))
        assertThat(
            jsonMapper.readValue(
                jsonMapper.writeValueAsString(vectorBody),
                SessionVersionVectorBody::class.java,
            ),
        ).isEqualTo(vectorBody)
        assertThat(
            jsonMapper.readValue(
                jsonMapper.writeValueAsString(attendanceBody),
                AttendanceVersionBody::class.java,
            ),
        ).isEqualTo(attendanceBody)
    }

    @Test
    fun `projection snapshot identity is derived from resource uuid and version vector`() {
        val identity = sampleVector().snapshotIdentity(resourceId)
        val json = jsonMapper.readTree(jsonMapper.writeValueAsString(identity))

        assertThat(json.propertyNames().toSet()).containsExactly("snapshotId")
        assertThat(identity.snapshotId).isEqualTo(
            "$resourceId:3:1:1:4:2:5:6",
        )
        assertThat(ProjectionSnapshotIdentity.from(resourceId, sampleVector())).isEqualTo(identity)
        assertThat(sampleVector().snapshotIdentity(resourceId)).isEqualTo(identity)
        assertThat(sampleVector().copy(sessionRevision = 4).snapshotIdentity(resourceId).snapshotId)
            .isNotEqualTo(identity.snapshotId)
        assertThat(sampleVector().copy(scheduleRevision = 2).snapshotIdentity(resourceId).snapshotId)
            .isNotEqualTo(identity.snapshotId)
        assertThat(
            sampleVector()
                .snapshotIdentity(UUID.fromString("aaaaaaaa-0000-4000-8000-000000052199"))
                .snapshotId,
        ).isNotEqualTo(identity.snapshotId)
        assertThat(identity.snapshotId).doesNotContain("client")
    }

    @Test
    fun `null record revisions use a stable snapshot sentinel`() {
        val identity = SessionVersionVector.INITIAL.snapshotIdentity(resourceId)

        assertThat(identity.snapshotId).isEqualTo("$resourceId:0:1:0:0:-:-:0")
        assertThat(
            SessionVersionVector.INITIAL
                .copy(recordDraftRevision = 1)
                .snapshotIdentity(resourceId)
                .snapshotId,
        ).isNotEqualTo(identity.snapshotId)
    }

    @Test
    fun `correction preview snapshot identity binds exactly the five correction revisions`() {
        val vector = CorrectionPublicationVersionVector(3, 2, 5, 1, 6)

        assertThat(vector.snapshotIdentity(resourceId).snapshotId)
            .isEqualTo("$resourceId:3:2:5:1:6")
    }

    @Test
    fun `revision domains reject negative values`() {
        assertThrows<IllegalArgumentException> { sampleVector().copy(sessionRevision = -1) }
        assertThrows<IllegalArgumentException> { sampleVector().copy(exposureRevision = -1) }
        assertThrows<IllegalArgumentException> { sampleVector().copy(participantSetRevision = -1) }
        assertThrows<IllegalArgumentException> { sampleVector().copy(publicationRevision = -1) }
        assertThrows<IllegalArgumentException> { sampleVector().copy(recordDraftRevision = 0) }
        assertThrows<IllegalArgumentException> { sampleVector().copy(liveRecordRevision = 0) }
        assertThrows<IllegalArgumentException> {
            AttendanceVersion(membershipId, attendanceRevision = -1)
        }
    }

    @Test
    fun `list item and attendee map onto revision models without a client snapshot id`() {
        val listItem =
            HostSessionListItem(
                sessionId = resourceId.toString(),
                sessionNumber = 3,
                title = "3회차",
                bookTitle = "책",
                bookAuthor = "저자",
                bookImageUrl = null,
                date = "2026-08-22",
                startTime = "20:00",
                endTime = "22:00",
                locationLabel = "온라인",
                state = "OPEN",
                visibility = SessionRecordVisibility.HOST_ONLY,
                accessScope = SessionAccessScope.HOST_ONLY,
                siteVisibility = PublicSiteVisibility.HIDDEN,
                recordStatus = SessionRecordStatus.INCOMPLETE,
                needsAttention = false,
                hasDraft = true,
                liveRevision = 5,
                draftRevision = 2,
                lastModifiedAt = null,
            )
        val attendee =
            HostSessionAttendee(
                membershipId = membershipId.toString(),
                displayName = "멤버",
                accountName = "member",
                avatarKey = "mushroom-green-book",
                rsvpStatus = "GOING",
                attendanceStatus = "UNKNOWN",
                participationStatus = SessionParticipationStatus.ACTIVE,
            )

        assertThat(
            listItem.toSessionVersionVector(
                sessionRevision = 3,
                exposureRevision = 1,
                participantSetRevision = 4,
                publicationRevision = 6,
            ),
        ).isEqualTo(sampleVector())
        assertThat(attendee.toAttendanceVersion(7)).isEqualTo(AttendanceVersion(membershipId, 7))
        assertThat(hostCommand().createdVersionVector()).isEqualTo(SessionVersionVector.INITIAL)
        assertThat(createRequest().createdVersionVector()).isEqualTo(SessionVersionVector.INITIAL)
    }

    private fun sampleVector() =
        SessionVersionVector(
            sessionRevision = 3,
            exposureRevision = 1,
            participantSetRevision = 4,
            recordDraftRevision = 2,
            liveRecordRevision = 5,
            publicationRevision = 6,
        )

    private fun host() =
        CurrentMember(
            userId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000052103"),
            membershipId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000052104"),
            clubId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000052105"),
            clubSlug = "revision-fixture",
            email = "host@example.test",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private fun hostCommand() =
        HostSessionCommand(
            host = host(),
            title = "3회차",
            bookTitle = "책",
            bookAuthor = "저자",
            bookLink = null,
            bookImageUrl = null,
            date = "2026-08-22",
            startTime = "20:00",
            endTime = "22:00",
            questionDeadlineAt = null,
            locationLabel = "온라인",
            meetingUrl = null,
            meetingPasscode = null,
        )

    private fun createRequest() =
        HostSessionRequest(
            title = "3회차",
            bookTitle = "책",
            bookAuthor = "저자",
            date = "2026-08-22",
        )
}
