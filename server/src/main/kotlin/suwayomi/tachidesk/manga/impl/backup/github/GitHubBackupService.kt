package suwayomi.tachidesk.manga.impl.backup.github

/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import suwayomi.tachidesk.manga.impl.backup.BackupFlags
import suwayomi.tachidesk.manga.impl.backup.proto.ProtoBackupExport
import suwayomi.tachidesk.manga.impl.backup.proto.ProtoBackupImport
import suwayomi.tachidesk.manga.model.table.UserGitHubBackupDataClass
import suwayomi.tachidesk.manga.model.table.UserGitHubBackupTable
import suwayomi.tachidesk.server.user.UserManager
import java.io.ByteArrayInputStream
import java.text.SimpleDateFormat
import java.util.Base64
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.time.Duration.Companion.minutes

data class GitHubLinkStatus(
    val isLinked: Boolean,
    val githubUsername: String? = null,
    val repoName: String? = null,
    val repoUrl: String? = null,
    val backupIntervalHours: Int = 24,
    val lastBackupAt: Long = 0,
    val autoBackupEnabled: Boolean = true,
)

data class GitHubSyncResult(
    val success: Boolean,
    val message: String,
    val actionTaken: String, // "RESTORED", "UP_TO_DATE", "FAILED"
)

object GitHubBackupService {
    private val logger = KotlinLogging.logger {}
    private val json = Json { ignoreUnknownKeys = true }
    private val httpClient =
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        startScheduler()
    }

    private fun startScheduler() {
        scope.launch {
            while (isActive) {
                try {
                    delay(10.minutes)
                    val accounts = UserGitHubBackupTable.getAllWithAutoBackup()
                    val now = System.currentTimeMillis()
                    for (acc in accounts) {
                        val intervalMs = acc.backupIntervalHours * 3600 * 1000L
                        if (now - acc.lastBackupAt >= intervalMs) {
                            logger.info { "Starting automated GitHub backup for user ${acc.userId} (@${acc.githubUsername})" }
                            performBackup(acc.userId)
                        }
                    }
                } catch (e: Exception) {
                    logger.error(e) { "Error in GitHub automated backup scheduler" }
                }
            }
        }
    }

    fun getStatus(userId: Int): GitHubLinkStatus {
        val record = UserGitHubBackupTable.getForUser(userId) ?: return GitHubLinkStatus(isLinked = false)
        return GitHubLinkStatus(
            isLinked = true,
            githubUsername = record.githubUsername,
            repoName = record.repoName,
            repoUrl = "https://github.com/${record.githubUsername}/${record.repoName}",
            backupIntervalHours = record.backupIntervalHours,
            lastBackupAt = record.lastBackupAt,
            autoBackupEnabled = record.autoBackupEnabled,
        )
    }

    fun updateSettings(userId: Int, intervalHours: Int, autoBackupEnabled: Boolean) {
        val clampedInterval = intervalHours.coerceIn(1, 168)
        UserGitHubBackupTable.updateSettings(userId, clampedInterval, autoBackupEnabled)
    }

    fun unlink(userId: Int) {
        UserGitHubBackupTable.unlink(userId)
    }

    suspend fun linkAccount(userId: Int, token: String): GitHubLinkStatus {
        val cleanToken = token.trim()
        require(cleanToken.isNotEmpty()) { "GitHub token cannot be empty" }

        // 1. Verify user identity with GitHub API
        val userReq = Request.Builder()
            .url("https://api.github.com/user")
            .header("Authorization", "Bearer $cleanToken")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Tsundoku-Manga-Server")
            .get()
            .build()

        val ghUser = httpClient.newCall(userReq).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw IllegalArgumentException("GitHub authentication failed: HTTP ${resp.code} (${resp.message})")
            }
            val body = resp.body?.string() ?: throw IllegalStateException("Empty GitHub user response")
            json.parseToJsonElement(body).jsonObject
        }

        val ghUsername = ghUser["login"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Could not extract GitHub username")

        // 2. Fetch Tsundoku user username
        val tsundokuUser = UserManager.getUser(userId)
            ?: throw IllegalStateException("User $userId does not exist")
        val repoName = "${tsundokuUser.username}-Tsundoku-Backups"

        // 3. Ensure repository exists or create it
        ensureRepoExists(cleanToken, ghUsername, repoName)

        // 4. Save link in DB
        UserGitHubBackupTable.saveLink(userId, ghUsername, cleanToken, repoName)

        return getStatus(userId)
    }

    private fun ensureRepoExists(token: String, owner: String, repoName: String) {
        val checkReq = Request.Builder()
            .url("https://api.github.com/repos/$owner/$repoName")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Tsundoku-Manga-Server")
            .get()
            .build()

        val checkResp = httpClient.newCall(checkReq).execute()
        val exists = checkResp.isSuccessful
        checkResp.close()

        if (!exists) {
            val payload = buildJsonObject {
                put("name", repoName)
                put("description", "Automated Tsundoku Backups for $owner")
                put("private", true)
                put("auto_init", true)
            }.toString()

            val createReq = Request.Builder()
                .url("https://api.github.com/user/repos")
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "Tsundoku-Manga-Server")
                .post(payload.toRequestBody(jsonMediaType))
                .build()

            httpClient.newCall(createReq).execute().use { resp ->
                if (!resp.isSuccessful) {
                    throw IllegalStateException("Failed to create GitHub repository '$repoName': HTTP ${resp.code} - ${resp.body?.string()}")
                }
            }

            // Create initial folder structure markers
            createOrUpdateFile(token, owner, repoName, "Current/.gitkeep", "", "Initialize Current folder")
            createOrUpdateFile(token, owner, repoName, "Past Week/.gitkeep", "", "Initialize Past Week folder")
            createOrUpdateFile(token, owner, repoName, "Archived/.gitkeep", "", "Initialize Archived folder")
        }
    }

    private fun getFile(token: String, owner: String, repo: String, path: String): JsonObject? {
        val encodedPath = path.replace(" ", "%20")
        val req = Request.Builder()
            .url("https://api.github.com/repos/$owner/$repo/contents/$encodedPath")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Tsundoku-Manga-Server")
            .get()
            .build()

        return httpClient.newCall(req).execute().use { resp ->
            if (resp.code == 404) return null
            if (!resp.isSuccessful) throw IllegalStateException("GitHub getFile failed: HTTP ${resp.code} on $path")
            val body = resp.body?.string() ?: return null
            json.parseToJsonElement(body).jsonObject
        }
    }

    private fun getFileContentBase64(token: String, fileObj: JsonObject): String? {
        val directContent = fileObj["content"]?.jsonPrimitive?.contentOrNull?.replace("\n", "")
        if (!directContent.isNullOrEmpty()) {
            return directContent
        }
        val downloadUrl = fileObj["download_url"]?.jsonPrimitive?.contentOrNull
        if (!downloadUrl.isNullOrEmpty()) {
            val dlReq = Request.Builder()
                .url(downloadUrl)
                .header("Authorization", "Bearer $token")
                .header("User-Agent", "Tsundoku-Manga-Server")
                .get()
                .build()
            val bytes = httpClient.newCall(dlReq).execute().use { resp ->
                if (resp.isSuccessful) resp.body?.bytes() else null
            }
            if (bytes != null && bytes.isNotEmpty()) {
                return Base64.getEncoder().encodeToString(bytes)
            }
        }
        return null
    }

    private fun listFolder(token: String, owner: String, repo: String, path: String): List<JsonObject> {
        val encodedPath = path.replace(" ", "%20")
        val req = Request.Builder()
            .url("https://api.github.com/repos/$owner/$repo/contents/$encodedPath")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Tsundoku-Manga-Server")
            .get()
            .build()

        return httpClient.newCall(req).execute().use { resp ->
            if (resp.code == 404) return emptyList()
            if (!resp.isSuccessful) return emptyList()
            val body = resp.body?.string() ?: return emptyList()
            val element = json.parseToJsonElement(body)
            if (element is JsonArray) {
                element.mapNotNull { it as? JsonObject }
            } else {
                emptyList()
            }
        }
    }

    private fun createOrUpdateFile(
        token: String,
        owner: String,
        repo: String,
        path: String,
        contentBase64: String,
        message: String,
        sha: String? = null,
    ): String {
        val encodedPath = path.replace(" ", "%20")
        val payload = buildJsonObject {
            put("message", message)
            put("content", contentBase64)
            if (sha != null) {
                put("sha", sha)
            }
        }.toString()

        val req = Request.Builder()
            .url("https://api.github.com/repos/$owner/$repo/contents/$encodedPath")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Tsundoku-Manga-Server")
            .put(payload.toRequestBody(jsonMediaType))
            .build()

        return httpClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw IllegalStateException("Failed to write GitHub file '$path': HTTP ${resp.code} - ${resp.body?.string()}")
            }
            val body = resp.body?.string() ?: ""
            val obj = json.parseToJsonElement(body).jsonObject
            obj["content"]?.jsonObject?.get("sha")?.jsonPrimitive?.contentOrNull ?: ""
        }
    }

    private fun deleteFile(token: String, owner: String, repo: String, path: String, sha: String, message: String) {
        val encodedPath = path.replace(" ", "%20")
        val payload = buildJsonObject {
            put("message", message)
            put("sha", sha)
        }.toString()

        val req = Request.Builder()
            .url("https://api.github.com/repos/$owner/$repo/contents/$encodedPath")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Tsundoku-Manga-Server")
            .delete(payload.toRequestBody(jsonMediaType))
            .build()

        httpClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful && resp.code != 404) {
                logger.warn { "Failed to delete GitHub file '$path': HTTP ${resp.code}" }
            }
        }
    }

    /**
     * Executes backup for userId, enforcing folder policy:
     * - Current: single latest backup
     * - Past Week: up to 7 backups of previous days
     * - Archived: up to 10 historical backups
     */
    suspend fun performBackup(userId: Int): Pair<Boolean, String> {
        val record = UserGitHubBackupTable.getForUser(userId)
            ?: return Pair(false, "User has not linked a GitHub account")

        val token = record.githubToken
        val owner = record.githubUsername
        val repo = record.repoName

        try {
            // Generate user-specific protobuf backup
            val flags = BackupFlags.DEFAULT.copy(includeServerSettings = false, includeExtensions = true)
            val backupStream = ProtoBackupExport.createBackup(flags, userId = userId, canManageServer = false)
            val backupBytes = backupStream.readAllBytes()
            val newBase64 = Base64.getEncoder().encodeToString(backupBytes)
            val dateFormat = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US)
            val timestampStr = dateFormat.format(Date())

            // 1. Check existing backup in Current/
            val currentFile = getFile(token, owner, repo, "Current/backup.proto.gz")
            val currentSha = currentFile?.get("sha")?.jsonPrimitive?.contentOrNull

            if (currentFile != null) {
                // Fetch the content of the existing current backup
                val existingContentBase64 = getFileContentBase64(token, currentFile)
                if (!existingContentBase64.isNullOrEmpty()) {
                    // Rotate old Current to Past Week/backup-$timestampStr.proto.gz
                    val rotatedPath = "Past Week/backup-$timestampStr.proto.gz"
                    createOrUpdateFile(token, owner, repo, rotatedPath, existingContentBase64, "Rotate previous backup to Past Week")
                }
            }

            // 2. Rotate Past Week if it exceeds 7 files
            val pastWeekFiles = listFolder(token, owner, repo, "Past Week")
                .filter { it["name"]?.jsonPrimitive?.contentOrNull != ".gitkeep" }
                .sortedBy { it["name"]?.jsonPrimitive?.contentOrNull ?: "" }

            if (pastWeekFiles.size > 7) {
                val excess = pastWeekFiles.take(pastWeekFiles.size - 7)
                for (item in excess) {
                    val itemName = item["name"]?.jsonPrimitive?.contentOrNull ?: continue
                    val itemSha = item["sha"]?.jsonPrimitive?.contentOrNull ?: continue
                    val itemDetails = getFile(token, owner, repo, "Past Week/$itemName")
                    val itemContent = itemDetails?.let { getFileContentBase64(token, it) }

                    if (!itemContent.isNullOrEmpty()) {
                        // Move to Archived/
                        createOrUpdateFile(token, owner, repo, "Archived/$itemName", itemContent, "Move excess Past Week backup to Archived")
                    }
                    deleteFile(token, owner, repo, "Past Week/$itemName", itemSha, "Remove rotated backup from Past Week")
                }
            }

            // 3. Prune Archived if it exceeds 10 files
            val archivedFiles = listFolder(token, owner, repo, "Archived")
                .filter { it["name"]?.jsonPrimitive?.contentOrNull != ".gitkeep" }
                .sortedBy { it["name"]?.jsonPrimitive?.contentOrNull ?: "" }

            if (archivedFiles.size > 10) {
                val toDelete = archivedFiles.take(archivedFiles.size - 10)
                for (item in toDelete) {
                    val itemName = item["name"]?.jsonPrimitive?.contentOrNull ?: continue
                    val itemSha = item["sha"]?.jsonPrimitive?.contentOrNull ?: continue
                    deleteFile(token, owner, repo, "Archived/$itemName", itemSha, "Prune oldest archive beyond limit of 10")
                }
            }

            // 4. Upload latest to Current/backup.proto.gz
            val newSha = createOrUpdateFile(
                token,
                owner,
                repo,
                "Current/backup.proto.gz",
                newBase64,
                "Update Current backup ($timestampStr)",
                currentSha,
            )

            val now = System.currentTimeMillis()
            UserGitHubBackupTable.recordBackup(userId, newSha, now)
            logger.info { "Successfully completed GitHub backup for user $userId to $owner/$repo" }
            return Pair(true, "Backup successfully uploaded to GitHub ($owner/$repo: Current/backup.proto.gz)")
        } catch (e: Exception) {
            logger.error(e) { "Failed to perform GitHub backup for user $userId" }
            return Pair(false, "Backup failed: ${e.message}")
        }
    }

    /**
     * Checks if GitHub Current backup is different/newer than the memory/local state.
     * If newer, restores it into userId.
     */
    suspend fun checkSync(userId: Int): GitHubSyncResult {
        val record = UserGitHubBackupTable.getForUser(userId)
            ?: return GitHubSyncResult(false, "GitHub account not linked", "FAILED")

        val token = record.githubToken
        val owner = record.githubUsername
        val repo = record.repoName

        try {
            val currentFile = getFile(token, owner, repo, "Current/backup.proto.gz")
                ?: return GitHubSyncResult(false, "No backup found in GitHub Current folder", "FAILED")

            val remoteSha = currentFile["sha"]?.jsonPrimitive?.contentOrNull ?: ""
            if (remoteSha.isNotEmpty() && remoteSha == record.lastBackupSha && record.lastBackupAt > 0) {
                return GitHubSyncResult(true, "Your library is already up to date with GitHub Current.", "UP_TO_DATE")
            }

            // Remote is different or we haven't synced it yet - download and restore!
            val downloadUrl = currentFile["download_url"]?.jsonPrimitive?.contentOrNull
            val backupBytes = if (!downloadUrl.isNullOrEmpty()) {
                val dlReq = Request.Builder()
                    .url(downloadUrl)
                    .header("Authorization", "Bearer $token")
                    .header("User-Agent", "Tsundoku-Manga-Server")
                    .get()
                    .build()
                httpClient.newCall(dlReq).execute().use { it.body?.bytes() }
            } else {
                val base64 = currentFile["content"]?.jsonPrimitive?.contentOrNull?.replace("\n", "")
                if (!base64.isNullOrEmpty()) Base64.getDecoder().decode(base64) else null
            } ?: throw IllegalStateException("Could not read backup bytes from GitHub")

            ProtoBackupImport.restoreLegacy(
                ByteArrayInputStream(backupBytes),
                userId = userId,
                canManageServer = false,
            )

            val now = System.currentTimeMillis()
            UserGitHubBackupTable.recordBackup(userId, remoteSha, now)
            logger.info { "Successfully restored GitHub backup for user $userId from $owner/$repo" }
            return GitHubSyncResult(true, "Successfully restored newer backup from GitHub Current into your account.", "RESTORED")
        } catch (e: Exception) {
            logger.error(e) { "Failed to sync GitHub backup for user $userId" }
            return GitHubSyncResult(false, "Sync failed: ${e.message}", "FAILED")
        }
    }
}
