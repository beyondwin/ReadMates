package com.readmates.sessionimport.application

import com.readmates.sessionimport.application.model.SessionImportIssue

class InvalidSessionImportException(
    val issues: List<SessionImportIssue>,
) : RuntimeException("Invalid session import")
