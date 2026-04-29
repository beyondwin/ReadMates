package com.readmates.notification.application.model

private const val REDACTED_EMAIL = "[redacted-email]"
private const val REDACTED_SECRET = "[redacted-secret]"

private val ERROR_EMAIL_LIKE_PATTERN = Regex("""[^\s@]+@[^\s@]+\.[^\s@]+""")
private val ERROR_PRIVATE_KEY_BLOCK_PATTERN =
    Regex("""(?is)-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY|RSA PRIVATE KEY)[\s\S]*?(?:-----END [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY|RSA PRIVATE KEY)-----|$)""")
private val ERROR_AUTHORIZATION_VALUE_PATTERN =
    Regex("""(?i)\b(?:authorization|proxy-authorization|auth)\s*[:=]\s*(?:(?:Bearer|Basic)\s+)?[^\s,;]+""")
private val ERROR_SCHEME_CREDENTIAL_PATTERN =
    Regex("""(?i)\b(?:Bearer|Basic)\s+[^\s,;]+""")
private val ERROR_SECRET_ASSIGNMENT_PATTERN =
    Regex("""(?i)\b(?:password|passwd|pwd|passcode|secret|api[-_ ]?key|access[-_ ]?key|secret[-_ ]?key|client[-_ ]?secret|private[-_ ]?key|token|credential)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)""")
private val ERROR_SECRET_KEYWORD_VALUE_PATTERN =
    Regex("""(?i)\b(?:password|passwd|pwd|passcode|secret|api[-_ ]?key|access[-_ ]?key|secret[-_ ]?key|client[-_ ]?secret|private[-_ ]?key|token|credential)\s+(?:is\s+|was\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)""")
private val ERROR_JWT_PATTERN =
    Regex("""\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b""")
private val ERROR_AWS_ACCESS_KEY_PATTERN =
    Regex("""\b(?:AKIA|ASIA)[A-Z0-9]{16}\b""")

fun sanitizeNotificationError(
    value: String?,
    maxLength: Int,
): String? {
    val trimmed = value
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: return null

    return trimmed
        .replace(ERROR_PRIVATE_KEY_BLOCK_PATTERN, REDACTED_SECRET)
        .replace(ERROR_AUTHORIZATION_VALUE_PATTERN, REDACTED_SECRET)
        .replace(ERROR_SCHEME_CREDENTIAL_PATTERN, REDACTED_SECRET)
        .replace(ERROR_SECRET_ASSIGNMENT_PATTERN, REDACTED_SECRET)
        .replace(ERROR_SECRET_KEYWORD_VALUE_PATTERN, REDACTED_SECRET)
        .replace(ERROR_JWT_PATTERN, REDACTED_SECRET)
        .replace(ERROR_AWS_ACCESS_KEY_PATTERN, REDACTED_SECRET)
        .replace(ERROR_EMAIL_LIKE_PATTERN, REDACTED_EMAIL)
        .take(maxLength)
}
