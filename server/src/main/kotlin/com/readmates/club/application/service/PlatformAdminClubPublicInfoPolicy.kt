package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.shared.security.PlatformActor

internal object PlatformAdminClubPublicInfoPolicy {
    fun validate(
        name: String,
        tagline: String,
        about: String,
    ) {
        if (name.isBlank() || tagline.isBlank() || about.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Club public info is required")
        }
    }
}

internal fun PlatformActor.capabilitySnapshots(): List<String> = capabilities.map { it.name }.sorted()

internal fun ByteArray.fingerprintPrefix(): String {
    val prefix = take(FINGERPRINT_PREFIX_BYTES)
    return prefix.joinToString("") { byte -> "%02x".format(byte) }
}

private const val FINGERPRINT_PREFIX_BYTES = 6
