package com.readmates.aigen.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcAiGenerationClubDefaultRepositoryTest(
    @param:Autowired private val adapter: JdbcAiGenerationClubDefaultRepository,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `upsert non existing club default then load returns the row`() {
        val clubId = UUID.randomUUID()
        val updatedBy = UUID.randomUUID()
        insertClub(clubId, slug = "default-load-${clubId.toString().take(8)}")

        adapter.upsert(clubId, defaultModel = "claude-sonnet-4-5", updatedBy = updatedBy)

        val loaded = adapter.load(clubId)
        assertThat(loaded).isNotNull
        assertThat(loaded!!.clubId).isEqualTo(clubId)
        assertThat(loaded.defaultModel).isEqualTo("claude-sonnet-4-5")
        assertThat(loaded.updatedBy).isEqualTo(updatedBy)
        assertThat(loaded.updatedAt).isNotNull
    }

    @Test
    fun `upsert existing club updates default model updated by and updated at`() {
        val clubId = UUID.randomUUID()
        val firstUpdatedBy = UUID.randomUUID()
        val secondUpdatedBy = UUID.randomUUID()
        insertClub(clubId, slug = "default-update-${clubId.toString().take(8)}")

        adapter.upsert(clubId, defaultModel = "claude-sonnet-4-5", updatedBy = firstUpdatedBy)
        val firstLoad = adapter.load(clubId) ?: error("First load missing")
        Thread.sleep(5)
        adapter.upsert(clubId, defaultModel = "gpt-5", updatedBy = secondUpdatedBy)

        val secondLoad = adapter.load(clubId) ?: error("Second load missing")
        assertThat(secondLoad.defaultModel).isEqualTo("gpt-5")
        assertThat(secondLoad.updatedBy).isEqualTo(secondUpdatedBy)
        assertThat(secondLoad.updatedAt).isAfterOrEqualTo(firstLoad.updatedAt)
    }

    @Test
    fun `load returns null when no club default has been written`() {
        val clubId = UUID.randomUUID()
        insertClub(clubId, slug = "default-missing-${clubId.toString().take(8)}")

        val loaded = adapter.load(clubId)
        assertThat(loaded).isNull()
    }

    @Test
    fun `upsert with non existing club id raises foreign key violation`() {
        val unknownClubId = UUID.randomUUID()

        assertThrows<DataIntegrityViolationException> {
            adapter.upsert(unknownClubId, defaultModel = "claude-sonnet-4-5", updatedBy = UUID.randomUUID())
        }
    }

    private fun insertClub(
        clubId: UUID,
        slug: String,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
            """.trimIndent(),
            clubId.toString(),
            slug,
        )
    }
}
