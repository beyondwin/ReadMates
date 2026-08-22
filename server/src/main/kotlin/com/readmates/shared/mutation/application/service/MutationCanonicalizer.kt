package com.readmates.shared.mutation.application.service

import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.text.Normalizer

object MutationCanonicalizer {
    fun bytes(payload: CanonicalMutationPayload): ByteArray {
        val writer = CanonicalWriter()
        writer.writeHeader(payload.operation.name, payload.schemaVersion)
        when (payload) {
            is CanonicalMutationPayload.SessionFields -> {
                writer.writeString(payload.title)
                writer.writeString(payload.bookTitle)
                writer.writeString(payload.bookAuthor)
                writer.writeNullableString(payload.bookLink)
                writer.writeNullableString(payload.bookImageUrl)
                writer.writeString(payload.date)
                writer.writeString(payload.startTime)
                writer.writeString(payload.endTime)
                writer.writeNullableString(payload.questionDeadlineAt)
                writer.writeNullableString(payload.locationLabel)
                writer.writeNullableString(payload.meetingUrl)
                writer.writeNullableString(payload.meetingPasscode)
                writer.writeString(payload.accessScope)
            }
            is CanonicalMutationPayload.Attendance -> {
                val rows =
                    payload.rows.sortedWith(
                        compareBy({ row -> row.membershipId.toString() }, { row -> row.status }),
                    )
                writer.writeInt(rows.size)
                rows.forEach { row ->
                    writer.writeString(row.membershipId.toString())
                    writer.writeString(row.status)
                    writer.writeLong(row.expectedAttendanceRevision)
                }
                writer.writeNullableLong(payload.expectedParticipantSetRevision)
            }
            is CanonicalMutationPayload.ResourceOnly -> Unit
            is CanonicalMutationPayload.Reverse -> {
                writer.writeNullableString(payload.reasonCode)
                writer.writeNullableString(payload.reasonNote)
            }
            is CanonicalMutationPayload.Exposure -> writer.writeString(payload.accessScope)
            is CanonicalMutationPayload.Publication -> {
                writer.writeString(payload.publicSummary)
                writer.writeString(payload.siteVisibility)
            }
            is CanonicalMutationPayload.RecordApply -> writer.writeOrderedStrings(payload.entryKeys)
        }
        return writer.toByteArray()
    }
}

internal class CanonicalWriter {
    private val buffer = ByteArrayOutputStream()

    fun writeHeader(
        operation: String,
        schemaVersion: Int,
    ) {
        writeRaw(MAGIC)
        writeString(operation)
        writeInt(schemaVersion)
    }

    fun writeString(value: String) {
        val bytes = Normalizer.normalize(value, Normalizer.Form.NFC).toByteArray(StandardCharsets.UTF_8)
        writeByte(TYPE_STRING)
        writeInt(bytes.size)
        writeRaw(bytes)
    }

    fun writeNullableString(value: String?) {
        if (value == null) {
            writeByte(TYPE_NULL)
        } else {
            writeString(value)
        }
    }

    fun writeInt(value: Int) {
        writeByte(TYPE_INT)
        writeRaw(
            ByteBuffer
                .allocate(Int.SIZE_BYTES)
                .order(ByteOrder.BIG_ENDIAN)
                .putInt(value)
                .array(),
        )
    }

    fun writeLong(value: Long) {
        writeByte(TYPE_LONG)
        writeRaw(
            ByteBuffer
                .allocate(Long.SIZE_BYTES)
                .order(ByteOrder.BIG_ENDIAN)
                .putLong(value)
                .array(),
        )
    }

    fun writeNullableLong(value: Long?) {
        if (value == null) {
            writeByte(TYPE_NULL)
        } else {
            writeLong(value)
        }
    }

    fun writeOrderedStrings(values: List<String>) {
        writeByte(TYPE_ORDERED)
        writeInt(values.size)
        values.forEach(::writeString)
    }

    fun toByteArray(): ByteArray = buffer.toByteArray()

    private fun writeByte(value: Int) {
        buffer.write(value)
    }

    private fun writeRaw(bytes: ByteArray) {
        buffer.write(bytes)
    }

    private companion object {
        val MAGIC = "RM1".toByteArray(StandardCharsets.UTF_8)
        const val TYPE_NULL = 0
        const val TYPE_STRING = 1
        const val TYPE_INT = 2
        const val TYPE_LONG = 3
        const val TYPE_ORDERED = 4
    }
}
