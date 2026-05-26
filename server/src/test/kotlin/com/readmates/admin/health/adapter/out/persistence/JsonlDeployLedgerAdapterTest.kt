package com.readmates.admin.health.adapter.out.persistence

import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.nio.file.Files
import java.nio.file.Path

class JsonlDeployLedgerAdapterTest {
    private val mapper: ObjectMapper = JsonMapper.builder().findAndAddModules().build()

    @Test
    fun `groups events into attempts and returns latest first`(
        @TempDir tmp: Path,
    ) {
        val ledger = tmp.resolve("deploy-attempts.jsonl")
        Files.writeString(
            ledger,
            listOf(
                """{"ts":"2026-05-26T10:00:00Z","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v1","attemptId":"a","durationSeconds":0}""",
                """{"ts":"2026-05-26T10:00:30Z","stage":"post-deploy-watch","event":"WATCH_OK","status":"SUCCEEDED","detail":"","attemptId":"a","durationSeconds":30}""",
                """{"ts":"2026-05-26T11:00:00Z","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v2","attemptId":"b","durationSeconds":0}""",
                """{"ts":"2026-05-26T11:00:20Z","stage":"post-deploy-watch","event":"WATCH_FAILED","status":"FAILED","detail":"","attemptId":"b","durationSeconds":20}""",
            ).joinToString("\n"),
        )

        val attempts = JsonlDeployLedgerAdapter({ ledger }, mapper).tailLatestAttempts(5)

        assertThat(attempts).hasSize(2)
        assertThat(attempts[0].attemptId).isEqualTo("b")
        assertThat(attempts[0].finalStatus).isEqualTo(DeployAttemptFinalStatus.FAILED)
        assertThat(attempts[0].imageTag).isEqualTo("v2")
        assertThat(attempts[1].attemptId).isEqualTo("a")
        assertThat(attempts[1].finalStatus).isEqualTo(DeployAttemptFinalStatus.SUCCEEDED)
        assertThat(attempts[1].imageTag).isEqualTo("v1")
    }

    @Test
    fun `returns empty list when file missing`(
        @TempDir tmp: Path,
    ) {
        val absent = tmp.resolve("does-not-exist.jsonl")
        assertThat(JsonlDeployLedgerAdapter({ absent }, mapper).tailLatestAttempts(5)).isEmpty()
    }

    @Test
    fun `final status is RUNNING when no terminal event seen`(
        @TempDir tmp: Path,
    ) {
        val ledger = tmp.resolve("ledger.jsonl")
        Files.writeString(
            ledger,
            """{"ts":"2026-05-26T12:00:00Z","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v3","attemptId":"c","durationSeconds":0}""",
        )
        val attempts = JsonlDeployLedgerAdapter({ ledger }, mapper).tailLatestAttempts(5)
        assertThat(attempts).hasSize(1)
        assertThat(attempts[0].finalStatus).isEqualTo(DeployAttemptFinalStatus.RUNNING)
    }
}
