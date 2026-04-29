package com.readmates.club.api

import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(
    statements = [DELETE_CLUB_CONTEXT_TEST_DOMAINS_SQL, INSERT_CLUB_CONTEXT_TEST_DOMAINS_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [DELETE_CLUB_CONTEXT_TEST_DOMAINS_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class ClubContextResolverTest(
    @param:Autowired private val resolver: ResolveClubContextUseCase,
) {
    @Test
    fun `resolves active club by slug`() {
        val context = resolver.resolveBySlug("reading-sai")

        assertThat(context).isNotNull()
        assertThat(context?.clubId.toString()).isEqualTo("00000000-0000-0000-0000-000000000001")
        assertThat(context?.slug).isEqualTo("reading-sai")
        assertThat(context?.status).isEqualTo("ACTIVE")
    }

    @Test
    fun `resolves active club by registered hostname`() {
        val context = resolver.resolveByHost("READMATES.EXAMPLE.TEST.")

        assertThat(context).isNotNull()
        assertThat(context?.clubId.toString()).isEqualTo("00000000-0000-0000-0000-000000000001")
        assertThat(context?.slug).isEqualTo("reading-sai")
        assertThat(context?.hostname).isEqualTo("readmates.example.test")
    }

    @Test
    fun `does not resolve disabled hostname`() {
        val context = resolver.resolveByHost("disabled.example.test")

        assertThat(context).isNull()
    }

    @Test
    fun `does not resolve invalid slug`() {
        val context = resolver.resolveBySlug("Admin")

        assertThat(context).isNull()
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

private const val CLUB_CONTEXT_ACTIVE_DOMAIN_ID = "00000000-0000-0000-0000-000000010001"
private const val CLUB_CONTEXT_DISABLED_DOMAIN_ID = "00000000-0000-0000-0000-000000010002"
private const val DELETE_CLUB_CONTEXT_TEST_DOMAINS_SQL = """
    delete from club_domains
    where hostname in ('readmates.example.test', 'disabled.example.test');
"""
private const val INSERT_CLUB_CONTEXT_TEST_DOMAINS_SQL = """
    insert into club_domains (id, club_id, hostname, kind, status, is_primary)
    values
      ('$CLUB_CONTEXT_ACTIVE_DOMAIN_ID', '00000000-0000-0000-0000-000000000001', 'readmates.example.test', 'SUBDOMAIN', 'ACTIVE', true),
      ('$CLUB_CONTEXT_DISABLED_DOMAIN_ID', '00000000-0000-0000-0000-000000000001', 'disabled.example.test', 'SUBDOMAIN', 'DISABLED', false);
"""
