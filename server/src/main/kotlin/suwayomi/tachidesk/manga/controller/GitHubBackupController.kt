package suwayomi.tachidesk.manga.controller

/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import io.github.oshai.kotlinlogging.KotlinLogging
import io.javalin.http.HttpStatus
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import suwayomi.tachidesk.manga.impl.backup.github.GitHubBackupService
import suwayomi.tachidesk.server.JavalinSetup.Attribute
import suwayomi.tachidesk.server.JavalinSetup.future
import suwayomi.tachidesk.server.JavalinSetup.getAttribute
import suwayomi.tachidesk.server.user.requireUser
import suwayomi.tachidesk.server.util.handler
import suwayomi.tachidesk.server.util.withOperation

@Serializable
data class GitHubLinkRequest(val token: String)

@Serializable
data class GitHubSettingsRequest(val intervalHours: Int, val autoBackupEnabled: Boolean)

@Serializable
data class GitHubActionResponse(val success: Boolean, val message: String, val actionTaken: String? = null)

object GitHubBackupController {
    private val logger = KotlinLogging.logger {}
    private val json = Json { ignoreUnknownKeys = true }

    val status =
        handler(
            documentWith = {
                withOperation {
                    summary("Get GitHub backup link status")
                    description("Returns GitHub backup link status and settings for the authenticated user")
                }
            },
            behaviorOf = { ctx ->
                val userId = ctx.getAttribute(Attribute.TachideskUser).requireUser()
                val status = GitHubBackupService.getStatus(userId)
                ctx.json(status)
            },
            withResults = {
                httpCode(HttpStatus.OK)
            },
        )

    val link =
        handler(
            documentWith = {
                withOperation {
                    summary("Link GitHub account for backup")
                    description("Links a GitHub personal access token and initializes backup repository")
                }
            },
            behaviorOf = { ctx ->
                val userId = ctx.getAttribute(Attribute.TachideskUser).requireUser()
                val req = json.decodeFromString<GitHubLinkRequest>(ctx.body())
                ctx.future {
                    future {
                        try {
                            val result = GitHubBackupService.linkAccount(userId, req.token)
                            ctx.json(result)
                        } catch (e: Exception) {
                            logger.error(e) { "Failed to link GitHub account" }
                            ctx.status(HttpStatus.BAD_REQUEST).json(mapOf("error" to (e.message ?: "Failed to link GitHub")))
                        }
                    }
                }
            },
            withResults = {
                httpCode(HttpStatus.OK)
            },
        )

    val unlink =
        handler(
            documentWith = {
                withOperation {
                    summary("Unlink GitHub account")
                    description("Removes GitHub backup link for the authenticated user")
                }
            },
            behaviorOf = { ctx ->
                val userId = ctx.getAttribute(Attribute.TachideskUser).requireUser()
                GitHubBackupService.unlink(userId)
                ctx.json(mapOf("success" to true))
            },
            withResults = {
                httpCode(HttpStatus.OK)
            },
        )

    val updateSettings =
        handler(
            documentWith = {
                withOperation {
                    summary("Update GitHub backup settings")
                    description("Updates backup rate and auto-backup toggle")
                }
            },
            behaviorOf = { ctx ->
                val userId = ctx.getAttribute(Attribute.TachideskUser).requireUser()
                val req = json.decodeFromString<GitHubSettingsRequest>(ctx.body())
                GitHubBackupService.updateSettings(userId, req.intervalHours, req.autoBackupEnabled)
                ctx.json(GitHubBackupService.getStatus(userId))
            },
            withResults = {
                httpCode(HttpStatus.OK)
            },
        )

    val backupNow =
        handler(
            documentWith = {
                withOperation {
                    summary("Trigger GitHub backup now")
                    description("Immediately creates and pushes backup to GitHub repository")
                }
            },
            behaviorOf = { ctx ->
                val userId = ctx.getAttribute(Attribute.TachideskUser).requireUser()
                ctx.future {
                    future {
                        val (success, message) = GitHubBackupService.performBackup(userId)
                        if (success) {
                            ctx.json(GitHubActionResponse(success = true, message = message))
                        } else {
                            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR).json(GitHubActionResponse(success = false, message = message))
                        }
                    }
                }
            },
            withResults = {
                httpCode(HttpStatus.OK)
            },
        )

    val checkSync =
        handler(
            documentWith = {
                withOperation {
                    summary("Check GitHub backup sync")
                    description("Compares GitHub Current backup against local database and restores if newer")
                }
            },
            behaviorOf = { ctx ->
                val userId = ctx.getAttribute(Attribute.TachideskUser).requireUser()
                ctx.future {
                    future {
                        val result = GitHubBackupService.checkSync(userId)
                        ctx.json(GitHubActionResponse(
                            success = result.success,
                            message = result.message,
                            actionTaken = result.actionTaken,
                        ))
                    }
                }
            },
            withResults = {
                httpCode(HttpStatus.OK)
            },
        )
}
