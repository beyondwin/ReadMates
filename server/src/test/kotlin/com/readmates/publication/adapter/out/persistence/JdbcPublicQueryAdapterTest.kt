package com.readmates.publication.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.spy
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcPublicQueryAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `publicStats issues exactly one consolidated queryForObject call`() {
        val spy = spy(jdbcTemplate)
        val adapter = JdbcPublicQueryAdapter(spy)

        val result = adapter.loadClub("reading-sai")

        // behavioural correctness — seed data has 6 published PUBLIC sessions (6 distinct books)
        assertThat(result).isNotNull()
        assertThat(result!!.stats.sessions).isEqualTo(6)
        assertThat(result.stats.books).isEqualTo(6)
        assertThat(result.stats.members).isGreaterThan(0)

        // structural: publicStats must use exactly one queryForObject(sql, RowMapper, ...) call
        // The overload queryForObject(String, RowMapper<T>, vararg Any) is the consolidated path.
        // Old implementation used the queryForObject(String, Class<T>, vararg Any) overload 3 times.
        val allQueryForObjectCalls =
            mockingDetails(spy)
                .invocations
                .filter { inv -> inv.method.name == "queryForObject" }
        val classOverloadCalls = allQueryForObjectCalls.filter { inv -> inv.arguments.getOrNull(1) is Class<*> }
        val rowMapperOverloadCalls = allQueryForObjectCalls.filter { inv -> inv.arguments.getOrNull(1) is RowMapper<*> }

        assertThat(classOverloadCalls)
            .withFailMessage(
                "publicStats must not use the queryForObject(sql, Class<T>, ...) overload — " +
                    "old impl used it 3 times; after consolidation it must be 0. Found: ${classOverloadCalls.size}",
            ).isEmpty()
        assertThat(rowMapperOverloadCalls)
            .withFailMessage(
                "publicStats must use exactly 1 consolidated queryForObject(sql, RowMapper, ...) call. " +
                    "Found: ${rowMapperOverloadCalls.size}",
            ).hasSize(1)
    }
}
