package com.readmates.browse.adapter.out.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import java.lang.reflect.Proxy
import java.sql.ResultSet

class JdbcGuestSessionBrowseAdapterTest {
    @Test
    fun `current guest projection queries never join account data`() {
        val jdbcTemplate = RecordingGuestBrowseJdbcTemplate()
        val adapter = JdbcGuestSessionBrowseAdapter(jdbcTemplate)

        val result = adapter.loadCurrentSession("guest-test")

        assertThat(result).isNotNull()
        assertThat(jdbcTemplate.queries).hasSize(4)
        assertThat(jdbcTemplate.queries)
            .allSatisfy { sql ->
                assertThat(sql.lowercase()).doesNotContain("join users")
                assertThat(sql.lowercase()).doesNotContain("users.name")
            }
    }
}

private class RecordingGuestBrowseJdbcTemplate : JdbcTemplate() {
    val queries = mutableListOf<String>()

    override fun <T : Any?> query(
        sql: String,
        rowMapper: RowMapper<T>,
        vararg args: Any?,
    ): MutableList<T> {
        queries += sql
        if (!sql.contains("from sessions")) return mutableListOf()
        return mutableListOf(rowMapper.mapRow(sessionResultSet(), 0))
    }

    private fun sessionResultSet(): ResultSet {
        val values =
            mapOf(
                "session_id" to "00000000-0000-0000-0000-000000007430",
                "session_number" to 41,
                "title" to "현재 공개 세션",
                "book_title" to "현재 공개 세션 책",
                "book_author" to "테스트 저자",
                "book_link" to "https://example.test/books/guest-safe",
                "book_image_url" to "https://example.test/images/guest-safe.jpg",
                "date" to "2026-08-20",
                "start_time" to "19:30:00",
                "end_time" to "21:30:00",
                "question_deadline_at" to "2026-08-19T18:00:00",
            )
        return Proxy.newProxyInstance(
            ResultSet::class.java.classLoader,
            arrayOf(ResultSet::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "getString" -> values[arguments?.first()]?.toString()
                "getInt" -> values[arguments?.first()] as Int
                "wasNull" -> false
                "toString" -> "GuestBrowseSessionResultSet"
                else -> primitiveDefault(method.returnType)
            }
        } as ResultSet
    }
}

private fun primitiveDefault(type: Class<*>): Any? =
    when (type) {
        Boolean::class.javaPrimitiveType -> false
        Byte::class.javaPrimitiveType -> 0.toByte()
        Short::class.javaPrimitiveType -> 0.toShort()
        Int::class.javaPrimitiveType -> 0
        Long::class.javaPrimitiveType -> 0L
        Float::class.javaPrimitiveType -> 0F
        Double::class.javaPrimitiveType -> 0.0
        Char::class.javaPrimitiveType -> '\u0000'
        else -> null
    }
