package com.readmates.auth.infrastructure.security

enum class BffSecretAuditMode {
    ROTATION_ONLY,
    ALL,
    OFF;

    fun shouldRecord(alias: String): Boolean =
        when (this) {
            ROTATION_ONLY -> alias != "primary"
            ALL -> true
            OFF -> false
        }

    companion object {
        fun from(raw: String): BffSecretAuditMode =
            when (raw.trim().lowercase()) {
                "", "rotation-only", "rotation_only" -> ROTATION_ONLY
                "all" -> ALL
                "off" -> OFF
                else -> throw IllegalArgumentException(
                    "readmates.security.bff.audit-mode must be one of rotation-only, all, off",
                )
            }
    }
}
