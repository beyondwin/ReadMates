package com.readmates.shared.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

object SecretComparator {
    fun firstMatchingIndex(provided: ByteArray, candidates: List<ByteArray>): Int {
        // Intentionally iterates ALL candidates without early-exit to preserve
        // timing uniformity — early return would leak position information via timing.
        var matched = -1
        candidates.forEachIndexed { idx, candidate ->
            if (MessageDigest.isEqual(provided, candidate)) {
                matched = idx
            }
        }
        return matched
    }

    fun matches(provided: ByteArray, candidates: List<ByteArray>): Boolean =
        firstMatchingIndex(provided, candidates) >= 0

    fun firstMatchingIndex(provided: String, candidates: List<String>): Int =
        firstMatchingIndex(
            provided.toByteArray(StandardCharsets.UTF_8),
            candidates.map { it.toByteArray(StandardCharsets.UTF_8) },
        )

    fun matches(provided: String, candidates: List<String>): Boolean =
        firstMatchingIndex(provided, candidates) >= 0
}
