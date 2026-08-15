package com.readmates.support

import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.CoreErrorCode
import org.flywaydb.core.api.exception.FlywayValidateException
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.testcontainers.mysql.MySQLContainer
import org.testcontainers.utility.DockerImageName
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager

@Tag("integration")
class FlywayChecksumImmutabilityTest {
    @Test
    fun `mutating an applied migration fails with bounded checksum evidence`(
        @TempDir migrationDirectory: Path,
    ) {
        withFlywayDatabase(migrationDirectory) { fixture ->
            fixture.writeMigration("V1__create_checksum_probe.sql", INITIAL_V1_SQL)
            assertThat(fixture.flyway().migrate().migrationsExecuted).isEqualTo(1)

            fixture.writeMigration("V1__create_checksum_probe.sql", MUTATED_V1_SQL)

            val validation = fixture.flyway().validateWithResult()
            assertThat(validation.validationSuccessful).isFalse()
            assertThat(validation.invalidMigrations).hasSize(1)
            val mismatch = validation.invalidMigrations.single()
            assertThat(mismatch.version).isEqualTo("1")
            assertThat(mismatch.errorDetails.errorCode).isEqualTo(CoreErrorCode.CHECKSUM_MISMATCH)
            assertThrows(FlywayValidateException::class.java) {
                fixture.flyway().migrate()
            }
        }
    }

    @Test
    fun `unchanged migration accepts a forward only successor with exact history`(
        @TempDir migrationDirectory: Path,
    ) {
        withFlywayDatabase(migrationDirectory) { fixture ->
            fixture.writeMigration("V1__create_checksum_probe.sql", INITIAL_V1_SQL)
            assertThat(fixture.flyway().migrate().migrationsExecuted).isEqualTo(1)

            fixture.writeMigration("V2__add_checksum_probe_label.sql", FORWARD_V2_SQL)

            assertThat(fixture.flyway().migrate().migrationsExecuted).isEqualTo(1)
            assertThat(fixture.historyRows()).containsExactly(
                "1:SQL:true",
                "2:SQL:true",
            )
        }
    }

    private fun withFlywayDatabase(
        migrationDirectory: Path,
        test: (FlywayDatabaseFixture) -> Unit,
    ) {
        FlywayChecksumMySqlContainer().use { database ->
            database.start()
            test(FlywayDatabaseFixture(database, migrationDirectory))
        }
    }

    private companion object {
        const val INITIAL_V1_SQL =
            """
            create table checksum_probe (
              id bigint not null primary key
            );
            """
        const val MUTATED_V1_SQL =
            """
            create table checksum_probe (
              id bigint not null primary key,
              changed_value varchar(32) null
            );
            """
        const val FORWARD_V2_SQL =
            """
            alter table checksum_probe
              add column label varchar(64) not null default 'sample';
            """
    }
}

private class FlywayDatabaseFixture(
    private val database: MySQLContainer,
    private val migrationDirectory: Path,
) {
    fun writeMigration(
        fileName: String,
        sql: String,
    ) {
        Files.writeString(migrationDirectory.resolve(fileName), sql)
    }

    fun flyway(): Flyway =
        Flyway
            .configure()
            .dataSource(database.jdbcUrl, database.username, database.password)
            .locations("filesystem:${migrationDirectory.toAbsolutePath()}")
            .load()

    fun historyRows(): List<String> =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection
                .prepareStatement(
                    """
                    select concat(version, ':', type, ':', case when success then 'true' else 'false' end)
                    from flyway_schema_history
                    order by installed_rank
                    """.trimIndent(),
                ).use { statement ->
                    statement.executeQuery().use { rows ->
                        buildList {
                            while (rows.next()) {
                                add(rows.getString(1))
                            }
                        }
                    }
                }
        }
}

private class FlywayChecksumMySqlContainer :
    MySQLContainer(
        DockerImageName.parse("mysql:8.4"),
    ) {
    init {
        withDatabaseName("flyway_checksum")
        withUsername("flyway_checksum")
        withPassword("flyway_checksum")
        withCommand(
            "--innodb-buffer-pool-size=32M",
            "--performance-schema=OFF",
            "--key-buffer-size=8M",
            "--max-connections=20",
        )
    }
}
