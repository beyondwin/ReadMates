package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CLUB_DOMAIN_CREATE_COMMAND_TYPE
import com.readmates.club.application.model.CLUB_DOMAIN_CREATE_SCHEMA_VERSION
import com.readmates.club.application.model.CLUB_DOMAIN_RECHECK_COMMAND_TYPE
import com.readmates.club.application.model.CLUB_DOMAIN_RECHECK_SCHEMA_VERSION
import com.readmates.club.application.model.NormalizedClubDomainHostname
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.security.PlatformActor
import java.util.Locale
import java.util.UUID

internal object PlatformAdminDomainCommandPolicy {
    fun validatedHostname(
        raw: String,
        isPrimary: Boolean,
    ): NormalizedClubDomainHostname {
        val hostname = raw.trim().removeSuffix(".").lowercase(Locale.ROOT)
        if (isPrimary || isForbidden(hostname) || invalidLabels(hostname)) {
            fail(PlatformAdminError.INVALID_DOMAIN)
        }
        return NormalizedClubDomainHostname(hostname)
    }

    fun createIdentity(
        admin: PlatformActor,
        clubId: UUID,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(
        admin.adminId,
        CLUB_DOMAIN_CREATE_COMMAND_TYPE,
        CLUB_TARGET_TYPE,
        clubId.toString(),
        idempotencyKey,
    )

    fun recheckIdentity(
        admin: PlatformActor,
        domainId: UUID,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(
        admin.adminId,
        CLUB_DOMAIN_RECHECK_COMMAND_TYPE,
        DOMAIN_TARGET_TYPE,
        domainId.toString(),
        idempotencyKey,
    )

    fun createRequest(
        previewId: UUID,
        clubId: UUID,
        expectedRevision: Long,
        hostname: NormalizedClubDomainHostname,
        kind: String,
    ): CanonicalAdminCommandRequest =
        canonicalRequest(
            CLUB_DOMAIN_CREATE_SCHEMA_VERSION,
            listOf(
                "clubId" to clubId.toString(),
                "confirmed" to "true",
                "expectedAdminRevision" to expectedRevision.toString(),
                "hostname" to hostname.value,
                "isPrimary" to "false",
                "kind" to kind,
                "previewId" to previewId.toString(),
            ),
        )

    fun recheckRequest(
        domainId: UUID,
        expectedStatus: ClubDomainStatus,
    ): CanonicalAdminCommandRequest =
        canonicalRequest(
            CLUB_DOMAIN_RECHECK_SCHEMA_VERSION,
            listOf("domainId" to domainId.toString(), "expectedStatus" to expectedStatus.name),
        )

    private fun canonicalRequest(
        schemaVersion: String,
        fields: List<Pair<String, String>>,
    ): CanonicalAdminCommandRequest =
        object : CanonicalAdminCommandRequest {
            override val schemaVersion: String = schemaVersion

            override fun canonicalFields(): List<Pair<String, String>> = fields
        }

    private fun isForbidden(hostname: String): Boolean =
        hostname.isBlank() ||
            hostname == PAGES_DEV_FALLBACK_HOSTNAME ||
            hostname.contains("//") ||
            hostname.contains('/') ||
            hostname.contains(':') ||
            hostname.contains('*') ||
            hostname.any(Char::isWhitespace) ||
            hostname == "localhost" ||
            hostname.length > MAX_HOSTNAME_LENGTH ||
            IPV4_LITERAL.matches(hostname)

    private fun invalidLabels(hostname: String): Boolean {
        val labels = hostname.split('.')
        return labels.size < MIN_HOSTNAME_LABELS ||
            labels.any { it.isBlank() || it.length > MAX_LABEL_LENGTH || !HOSTNAME_LABEL.matches(it) }
    }

    private fun fail(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)

    const val CLUB_TARGET_TYPE = "club"
    const val DOMAIN_TARGET_TYPE = "club-domain"
    private const val PAGES_DEV_FALLBACK_HOSTNAME = "readmates.pages.dev"
    private const val MAX_HOSTNAME_LENGTH = 253
    private const val MAX_LABEL_LENGTH = 63
    private const val MIN_HOSTNAME_LABELS = 2
    private val HOSTNAME_LABEL = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
    private val IPV4_LITERAL = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}$")
}
