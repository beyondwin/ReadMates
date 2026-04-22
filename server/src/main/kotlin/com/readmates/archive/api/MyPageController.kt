package com.readmates.archive.api

import com.readmates.archive.application.ArchiveRepository
import com.readmates.auth.application.MemberAccountRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class MyPageResponse(
    val displayName: String,
    val shortName: String,
    val email: String,
    val role: String,
    val membershipStatus: String,
    val clubName: String?,
    val joinedAt: String,
    val sessionCount: Int,
    val totalSessionCount: Int,
    val recentAttendances: List<MyRecentAttendanceItem>,
)

data class MyRecentAttendanceItem(
    val sessionNumber: Int,
    val attended: Boolean,
)

@RestController
@RequestMapping("/api/app/me")
class MyPageController(
    private val memberAccountRepository: MemberAccountRepository,
    private val archiveRepository: ArchiveRepository,
) {
    @GetMapping
    fun me(authentication: Authentication?): MyPageResponse =
        archiveRepository.findMyPage(currentMember(authentication))

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
