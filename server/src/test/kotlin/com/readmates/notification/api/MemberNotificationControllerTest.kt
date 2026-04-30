package com.readmates.notification.api

import com.readmates.auth.adapter.`in`.security.CurrentMemberArgumentResolver
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.notification.adapter.`in`.web.MemberNotificationController
import com.readmates.notification.adapter.`in`.web.MemberNotificationPreferenceController
import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.port.`in`.ManageMemberNotificationsUseCase
import com.readmates.notification.application.port.`in`.ManageNotificationPreferencesUseCase
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.OffsetDateTime
import java.util.UUID

class MemberNotificationControllerTest {
    private val mockMvc: MockMvc = MockMvcBuilders
        .standaloneSetup(
            MemberNotificationController(memberNotificationsUseCase),
            MemberNotificationPreferenceController(notificationPreferencesUseCase),
        )
        .setCustomArgumentResolvers(CurrentMemberArgumentResolver(resolveCurrentMemberUseCase, resolveClubContextUseCase))
        .build()

    @Test
    fun `list current member notifications`() {
        mockMvc.get("/api/me/notifications") {
            with(memberUser())
        }.andExpect {
            status { isOk() }
            jsonPath("$.unreadCount") { value(1) }
            jsonPath("$.items[0].id") { value("00000000-0000-0000-0000-000000009101") }
            jsonPath("$.nextCursor") { value("next-member-notifications") }
            jsonPath("$.items[0].eventType") { value("NEXT_BOOK_PUBLISHED") }
            jsonPath("$.items[0].title") { value("다음 책이 공개되었습니다") }
            jsonPath("$.items[0].body") { value("새로운 책을 확인해 주세요.") }
            jsonPath("$.items[0].deepLinkPath") { value("/app/sessions/current") }
            jsonPath("$.items[0].readAt") { value(null) }
            jsonPath("$.items[0].createdAt") { value("2026-04-29T09:30Z") }
        }
    }

    @Test
    fun `read current member unread notification count`() {
        mockMvc.get("/api/me/notifications/unread-count") {
            with(memberUser())
        }.andExpect {
            status { isOk() }
            jsonPath("$.unreadCount") { value(1) }
        }
    }

    @Test
    fun `mark current member notification read`() {
        mockMvc.post("/api/me/notifications/00000000-0000-0000-0000-000000009101/read") {
            with(memberUser())
        }.andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `mark all current member notifications read`() {
        mockMvc.post("/api/me/notifications/read-all") {
            with(memberUser())
        }.andExpect {
            status { isOk() }
            jsonPath("$.updatedCount") { value(3) }
        }
    }
}

private val resolveCurrentMemberUseCase = object : ResolveCurrentMemberUseCase {
    override fun resolveByEmail(email: String): CurrentMember? = currentMember
    override fun findUserIdByEmail(email: String): UUID? = currentMember.userId
    override fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember? = currentMember
    override fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember? = currentMember
    override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()
    override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = null
}

private val resolveClubContextUseCase = object : ResolveClubContextUseCase {
    override fun resolveBySlug(slug: String): ResolvedClubContext? = null
    override fun resolveByHost(host: String?): ResolvedClubContext? = null
}

private val memberNotificationsUseCase = object : ManageMemberNotificationsUseCase {
    override fun list(member: CurrentMember, pageRequest: PageRequest): MemberNotificationList =
        MemberNotificationList(
            items = listOf(notification),
            unreadCount = 1,
            nextCursor = "next-member-notifications",
        )

    override fun unreadCount(member: CurrentMember): Int = 1

    override fun markRead(member: CurrentMember, id: UUID) = Unit

    override fun markAllRead(member: CurrentMember): Int = 3
}

private val notificationPreferencesUseCase = object : ManageNotificationPreferencesUseCase {
    override fun getPreferences(member: CurrentMember): NotificationPreferences =
        NotificationPreferences.defaults()

    override fun savePreferences(
        member: CurrentMember,
        preferences: NotificationPreferences,
    ): NotificationPreferences = preferences
}

private fun memberUser(email: String = "member@example.com"): RequestPostProcessor =
    RequestPostProcessor { request ->
        request.userPrincipal = UsernamePasswordAuthenticationToken(email, "password", emptyList())
        request
    }

private val currentMember = CurrentMember(
    userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
    membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
    clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
    clubSlug = "reading-sai",
    email = "member@example.com",
    displayName = "멤버",
    accountName = "김멤버",
    role = MembershipRole.MEMBER,
    membershipStatus = MembershipStatus.ACTIVE,
)

private val notification = MemberNotificationItem(
    id = UUID.fromString("00000000-0000-0000-0000-000000009101"),
    eventId = UUID.fromString("00000000-0000-0000-0000-000000008101"),
    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
    title = "다음 책이 공개되었습니다",
    body = "새로운 책을 확인해 주세요.",
    deepLinkPath = "/app/sessions/current",
    readAt = null,
    createdAt = OffsetDateTime.parse("2026-04-29T09:30:00Z"),
)
