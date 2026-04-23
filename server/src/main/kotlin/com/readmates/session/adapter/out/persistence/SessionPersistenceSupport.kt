package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CurrentSessionNotOpenException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate

internal fun jdbcTemplateOrThrow(jdbcTemplateProvider: ObjectProvider<JdbcTemplate>): JdbcTemplate =
    jdbcTemplateProvider.ifAvailable ?: throw CurrentSessionNotOpenException()
