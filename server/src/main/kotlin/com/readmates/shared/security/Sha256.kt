package com.readmates.shared.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.HexFormat

object Sha256 {
    private val HEX = HexFormat.of()

    fun hex(value: String): String = hex(value.toByteArray(StandardCharsets.UTF_8))

    fun hex(bytes: ByteArray): String =
        HEX.formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
