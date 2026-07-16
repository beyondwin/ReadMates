package com.readmates.aigen.application.model

enum class ProviderCallMode {
    PRIMARY,
    FALLBACK,
    SCHEMA_CORRECTION,
    SECTION_REPAIR,
    REGENERATE_SECTION,
}

enum class CostBasis {
    NONE,
    ACTUAL,
    ESTIMATED_UNKNOWN,
}
