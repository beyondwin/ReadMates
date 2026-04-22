package com.readmates.shared.db

import java.sql.ResultSet
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

fun ResultSet.uuid(column: String): UUID = UUID.fromString(getString(column))

fun ResultSet.uuidOrNull(column: String): UUID? =
    getString(column)?.let(UUID::fromString)

fun ResultSet.utcOffsetDateTime(column: String): OffsetDateTime =
    getObject(column, LocalDateTime::class.java).toUtcOffsetDateTime()

fun ResultSet.utcOffsetDateTimeOrNull(column: String): OffsetDateTime? =
    getObject(column, LocalDateTime::class.java)?.toUtcOffsetDateTime()

fun UUID.dbString(): String = toString()

fun OffsetDateTime.toUtcLocalDateTime(): LocalDateTime =
    withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime()

fun LocalDateTime.toUtcOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)
