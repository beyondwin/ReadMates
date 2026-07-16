package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.StructuredOutputJson
import org.springframework.ai.converter.StructuredOutputConverter

class GroundedStructuredOutputConverter(
    private val schemaJson: String,
    private val objectMapper: ObjectMapper,
) : StructuredOutputConverter<ObjectNode> {
    override fun getFormat(): String = ""

    override fun getJsonSchema(): String = schemaJson

    override fun convert(source: String): ObjectNode = StructuredOutputJson.parseObject(source, objectMapper)
}
