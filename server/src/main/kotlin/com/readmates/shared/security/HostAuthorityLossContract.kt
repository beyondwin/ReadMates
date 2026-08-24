package com.readmates.shared.security

enum class HostAuthorityLossCode(
    val detail: String,
) {
    HOST_AUTHORITY_REVOKED("이 모임의 호스트 권한이 해제되었습니다."),
    MEMBERSHIP_SUSPENDED("이 모임의 멤버십이 중지되었습니다."),
    CROSS_CLUB_SCOPE("요청한 모임 범위가 현재 호스트 범위와 일치하지 않습니다."),
}

object HostAuthorityLossContract {
    const val REQUEST_ATTRIBUTE = "com.readmates.hostAuthorityLossCode"
}
