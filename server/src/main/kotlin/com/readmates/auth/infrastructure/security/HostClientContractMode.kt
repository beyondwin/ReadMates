package com.readmates.auth.infrastructure.security

enum class HostClientContractMode {
    DISABLED,
    V2_ONLY,
    SUPPORT_V2_V3,
    ENFORCE_V3,
    ;

    fun residueModeTag(): String? =
        when (this) {
            SUPPORT_V2_V3 -> "support"
            ENFORCE_V3 -> "enforce"
            DISABLED, V2_ONLY -> null
        }

    fun accepts(generation: ObservedHostClientGeneration): Boolean =
        when (this) {
            DISABLED -> true
            V2_ONLY -> generation == ObservedHostClientGeneration.V2
            SUPPORT_V2_V3 ->
                generation == ObservedHostClientGeneration.V2 ||
                    generation == ObservedHostClientGeneration.V3
            ENFORCE_V3 -> generation == ObservedHostClientGeneration.V3
        }

    internal fun rejectionFor(generation: ObservedHostClientGeneration): HostClientContractRejection? {
        if (accepts(generation)) {
            return null
        }
        return when (this) {
            DISABLED -> null
            ENFORCE_V3 -> HostClientContractRejection.UPDATE_REQUIRED
            V2_ONLY, SUPPORT_V2_V3 -> HostClientContractRejection.UPGRADE_REQUIRED
        }
    }
}

private const val HTTP_CONFLICT = 409
private const val HTTP_PRECONDITION_REQUIRED = 428

internal enum class HostClientContractRejection(
    val status: Int,
    val title: String,
    val code: String,
) {
    UPGRADE_REQUIRED(HTTP_CONFLICT, "Conflict", "HOST_CLIENT_UPGRADE_REQUIRED"),
    UPDATE_REQUIRED(
        HTTP_PRECONDITION_REQUIRED,
        "Precondition Required",
        "CLIENT_UPDATE_REQUIRED",
    ),
}

enum class ObservedHostClientGeneration {
    V2,
    V3,
    MISSING,
    UNKNOWN,
    ;

    val metricTag: String
        get() =
            when (this) {
                V2 -> "v2"
                V3 -> "v3"
                MISSING -> "missing"
                UNKNOWN -> "unknown"
            }

    companion object {
        fun fromHeader(value: String?): ObservedHostClientGeneration {
            if (value.isNullOrBlank()) {
                return MISSING
            }
            return when (value) {
                "v2" -> V2
                "v3" -> V3
                else -> UNKNOWN
            }
        }
    }
}
