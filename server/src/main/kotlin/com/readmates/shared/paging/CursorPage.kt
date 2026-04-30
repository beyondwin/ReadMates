package com.readmates.shared.paging

data class CursorPage<T>(
    val items: List<T>,
    val nextCursor: String?,
)

data class PageRequest(
    val limit: Int,
    val cursor: Map<String, String>,
) {
    companion object {
        fun cursor(
            requestedLimit: Int?,
            rawCursor: String?,
            defaultLimit: Int,
            maxLimit: Int,
        ): PageRequest {
            val upperLimit = maxLimit.coerceAtLeast(1)
            val limit = (requestedLimit ?: defaultLimit).coerceIn(1, upperLimit)
            return PageRequest(
                limit = limit,
                cursor = CursorCodec.decode(rawCursor).orEmpty(),
            )
        }
    }
}
