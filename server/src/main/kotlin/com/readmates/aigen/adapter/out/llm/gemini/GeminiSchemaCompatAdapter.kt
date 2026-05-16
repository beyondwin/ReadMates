package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import org.springframework.stereotype.Component

/**
 * Converts the canonical [SessionImportSchemaResource] (a JSON Schema Draft 2020-12 document)
 * into the subset of OpenAPI 3.0 Schema that the Gemini `responseSchema` field accepts.
 *
 * Gemini's structured-output mode REJECTS arbitrary JSON Schema features. Concretely we must:
 *  - strip Draft-2020-12 metadata (`$schema`, `$id`)
 *  - strip reference machinery (`$ref`, `$defs`, `definitions`) — defensive; not used today
 *  - strip `additionalProperties` everywhere (Gemini emits `additionalProperties=false`
 *    implicitly in structured-output mode and rejects the explicit keyword on some versions)
 *  - replace Draft-2020-12 `const: X` with OpenAPI 3.0's single-element `enum: [X]`
 *  - keep only Gemini's recognized `format` vocabulary (date, date-time, int32, int64,
 *    float, double, byte, enum). Unknown `format` values (uuid, email, etc.) are stripped.
 *
 * All other supported keywords (type, properties, items, required, enum, pattern,
 * minimum/maximum, minLength/maxLength, minItems/maxItems, description, nullable,
 * oneOf/anyOf/allOf) are passed through unchanged.
 *
 * The conversion is a pure function over the JSON tree, never mutates the source,
 * and is idempotent: `convert(convert(x))` equals `convert(x)`.
 */
@Component
class GeminiSchemaCompatAdapter(
    private val source: SessionImportSchemaResource,
) {
    /** Returns a deep-copied Gemini-compatible schema (OpenAPI 3.0 subset). */
    fun geminiResponseSchema(): ObjectNode = convert(source.schema())

    /**
     * Pure conversion entry point. Always returns a deep copy — the input is not mutated.
     * Exposed for unit tests and for callers that already hold an [ObjectNode].
     */
    fun convert(node: ObjectNode): ObjectNode {
        val copy = node.deepCopy()
        transformInPlace(copy)
        return copy
    }

    private fun transformInPlace(node: JsonNode) {
        when (node) {
            is ObjectNode -> transformObject(node)
            is ArrayNode -> node.forEach { transformInPlace(it) }
            else -> Unit
        }
    }

    private fun transformObject(node: ObjectNode) {
        // 1. Strip JSON-Schema metadata + reference machinery.
        for (key in STRIPPED_KEYS) {
            node.remove(key)
        }

        // 2. Strip additionalProperties at every level (Gemini OpenAPI 3.0 subset
        //    does not accept it; structured-output mode is implicitly closed anyway).
        node.remove("additionalProperties")

        // 3. const → enum (single-element). JSON Schema Draft 2020-12 → OpenAPI 3.0.
        val constNode = node.remove("const")
        if (constNode != null && !node.has("enum")) {
            val enumArray = node.arrayNode()
            enumArray.add(constNode)
            node.set<JsonNode>("enum", enumArray)
        }

        // 4. Filter format vocabulary to Gemini's recognized set.
        val formatNode = node.get("format")
        if (formatNode != null && formatNode.isTextual) {
            if (formatNode.asText() !in RECOGNIZED_FORMATS) {
                node.remove("format")
            }
        }

        // 5. Recurse into children.
        for (entry in node.properties()) {
            transformInPlace(entry.value)
        }
    }

    companion object {
        /**
         * Keys removed unconditionally because Gemini's responseSchema rejects them
         * (or, in the case of `$ref`/`$defs`, would require us to inline references
         * that Gemini cannot resolve).
         */
        private val STRIPPED_KEYS =
            listOf(
                "\$schema",
                "\$id",
                "\$ref",
                "\$defs",
                "definitions",
            )

        /**
         * Format strings recognized by Gemini's OpenAPI 3.0 subset.
         * Unknown formats (uuid, email, ipv4, etc.) are dropped silently.
         */
        private val RECOGNIZED_FORMATS =
            setOf(
                "date",
                "date-time",
                "int32",
                "int64",
                "float",
                "double",
                "byte",
                "enum",
            )
    }
}
