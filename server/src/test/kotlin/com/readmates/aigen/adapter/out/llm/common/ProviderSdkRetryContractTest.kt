package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.adapter.out.llm.claude.ClaudeApiClient
import com.readmates.aigen.adapter.out.llm.openai.OpenAiApiClient
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ProviderSdkRetryContractTest {
    @Test
    fun `provider SDK retries stay disabled so application call caps remain authoritative`() {
        assertThat(OpenAiApiClient.SDK_MAX_RETRIES).isZero()
        assertThat(ClaudeApiClient.SDK_MAX_RETRIES).isZero()
    }
}
