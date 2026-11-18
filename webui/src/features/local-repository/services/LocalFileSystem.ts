/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import JSZip from 'jszip';
import { Sources } from '@/features/source/services/Sources.ts';

export interface LocalMangaItem {
    id: number;
    title: string;
    thumbnailUrl?: string;
    inLibrary?: boolean;
    sourceId: string;
    chapterCount: number;
}

export interface LocalChapterItem {
    id: number;
    name: string;
    chapterNumber: number;
    isDownloaded: boolean;
}

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

const DB_NAME = 'tsundoku-local-fs';
const DB_VERSION = 2;
const HANDLE_STORE = 'directory-handle';
const OFFLINE_STORE = 'offline-chapters';
const METADATA_STORE = 'manga-metadata';
const HANDLE_KEY = 'active-handle';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE)) {
                db.createObjectStore(HANDLE_STORE);
            }
            if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
                db.createObjectStore(OFFLINE_STORE);
            }
            if (!db.objectStoreNames.contains(METADATA_STORE)) {
                db.createObjectStore(METADATA_STORE);
            }
        };
        req.onsuccess = () => {
            resolve(req.result);
        };
        req.onerror = () => {
            reject(req.error);
        };
    });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => {
            resolve(req.result as T | undefined);
        };
        req.onerror = () => {
            reject(req.error);
        };
    });
}

function idbPut(db: IDBDatabase, store: string, key: IDBValidKey, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(value, key);
        req.onsuccess = () => {
            resolve();
        };
        req.onerror = () => {
            reject(req.error);
        };
    });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(key);
        req.onsuccess = () => {
            resolve();
        };
        req.onerror = () => {
            reject(req.error);
        };
    });
}

function idbGetAllEntries<T = unknown>(db: IDBDatabase, store: string): Promise<Array<{ key: string; value: T }>> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).openCursor();
        const results: Array<{ key: string; value: T }> = [];
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                results.push({ key: String(cursor.key), value: cursor.value as T });
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        req.onerror = () => {
            reject(req.error);
        };
    });
}

function idbGetChaptersForManga(
    db: IDBDatabase,
    mangaTitle: string,
): Promise<Array<{ chapterName: string; blob?: Blob }>> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const prefix = `${mangaTitle}::`;
        const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
        const req = tx.objectStore(OFFLINE_STORE).openCursor(range);
        const results: Array<{ chapterName: string; blob?: Blob }> = [];
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                const key = String(cursor.key);
                if (key.startsWith(prefix)) {
                    results.push({
                        chapterName: key.slice(prefix.length),
                        blob: cursor.value as Blob,
                    });
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        req.onerror = () => {
            reject(req.error);
        };
    });
}

function hashStringToId(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    const abs = Math.abs(hash) || 1;
    return -abs;
}

function parseChapterNumber(name: string): number {
    const chMatch = /(?:ch(?:apter)?\.?\s*|#\s*)(\d+(?:\.\d+)?)/i.exec(name);
    if (chMatch) {
        return parseFloat(chMatch[1]);
    }
    const numMatch = /(\d+(?:\.\d+)?)/.exec(name);
    if (numMatch) {
        return parseFloat(numMatch[1]);
    }
    return 0;
}

async function* iterateDirectory(
    dirHandle: FileSystemDirectoryHandle,
): AsyncGenerator<[string, FileSystemHandle]> {
    if (typeof (dirHandle as any).entries === 'function') {
        for await (const entry of (dirHandle as any).entries()) {
            yield entry as [string, FileSystemHandle];
        }
    } else if (typeof (dirHandle as any)[Symbol.asyncIterator] === 'function') {
        for await (const entry of (dirHandle as any)) {
            yield entry as [string, FileSystemHandle];
        }
    }
}

// ─── Type helpers ────────────────────────────────────────────────────────────

type FSDirectoryHandle = FileSystemDirectoryHandle;

// ─── LocalFileSystem service ─────────────────────────────────────────────────

class LocalFileSystemService {
    private directoryHandle: FSDirectoryHandle | null = null;
    private coverUrlCache = new Map<string, string>();
    private mangaIdCache = new Map<string, number>();
    private idToTitleMap = new Map<number, string>();

    // ── Manga metadata tracking ──────────────────────────────────────────────

    async registerMangaMetadata(
        mangaTitle: string,
        mangaId: number,
        thumbnailUrl?: string,
        inLibrary?: boolean,
    ): Promise<void> {
        this.mangaIdCache.set(mangaTitle, mangaId);
        this.idToTitleMap.set(mangaId, mangaTitle);
        this.idToTitleMap.set(hashStringToId(mangaTitle), mangaTitle);
        if (thumbnailUrl) {
            this.coverUrlCache.set(mangaTitle, thumbnailUrl);
        }
        try {
            const db = await openDb();
            await idbPut(db, METADATA_STORE, mangaTitle, { mangaId, mangaTitle, thumbnailUrl, inLibrary });
        } catch {
            // ignore
        }
    }

    getTitleById(id: number): string | undefined {
        return this.idToTitleMap.get(id);
    }

    async resolveTitleById(id: number): Promise<string | undefined> {
        let title = this.idToTitleMap.get(id);
        if (!title) {
            await this.getLocalMangaList();
            title = this.idToTitleMap.get(id);
        }
        return title;
    }

    async getMangaId(mangaTitle: string): Promise<number | undefined> {
        if (this.mangaIdCache.has(mangaTitle)) {
            return this.mangaIdCache.get(mangaTitle);
        }

        try {
            const db = await openDb();
            const meta = await idbGet<{ mangaId: number }>(db, METADATA_STORE, mangaTitle);
            if (meta?.mangaId) {
                this.mangaIdCache.set(mangaTitle, meta.mangaId);
                return meta.mangaId;
            }
        } catch {
            // ignore
        }

        try {
            const { useClientDownloadStore } = await import('@/features/download-manager/services/ClientDownloadManager.ts');
            const queueEntry = useClientDownloadStore.getState().queue.find((e) => e.mangaTitle === mangaTitle);
            if (queueEntry?.mangaId) {
                this.mangaIdCache.set(mangaTitle, queueEntry.mangaId);
                return queueEntry.mangaId;
            }
        } catch {
            // ignore
        }

        try {
            const { requestManager } = await import('@/lib/requests/RequestManager.ts');
            const cacheData = requestManager.graphQLClient.client.cache.extract();
            for (const key in cacheData) {
                if (key.startsWith('MangaType:')) {
                    const cachedManga = cacheData[key] as any;
                    if (cachedManga?.title?.trim().toLowerCase() === mangaTitle.trim().toLowerCase()) {
                        const num = Number(cachedManga.id);
                        if (!isNaN(num) && num > 0) {
                            this.mangaIdCache.set(mangaTitle, num);
                            if (cachedManga?.thumbnailUrl) {
                                this.coverUrlCache.set(mangaTitle, cachedManga.thumbnailUrl);
                            }
                            return num;
                        }
                    }
                }
            }
        } catch {
            // ignore
        }

        // 5. Query GraphQL server
        try {
            const { requestManager } = await import('@/lib/requests/RequestManager.ts');
            const { GET_MANGAS_BASE } = await import('@/lib/graphql/manga/MangaQuery.ts');
            const res = await requestManager.graphQLClient.client.query({
                query: GET_MANGAS_BASE,
                variables: {
                    condition: {
                        title: mangaTitle,
                    },
                },
                fetchPolicy: 'cache-first',
            });
            const nodes = (res.data as any)?.mangas?.nodes ?? [];
            if (nodes.length > 0) {
                const match = nodes.find((n: any) => n.inLibrary) ?? nodes[0];
                const id = Number(match.id);
                if (!isNaN(id) && id > 0) {
                    this.mangaIdCache.set(mangaTitle, id);
                    if (match.thumbnailUrl) {
                        this.coverUrlCache.set(mangaTitle, match.thumbnailUrl);
                    }
                    await this.registerMangaMetadata(mangaTitle, id, match.thumbnailUrl, match.inLibrary);
                    return id;
                }
            }
        } catch {
            // ignore network/GraphQL failure
        }

        return undefined;
    }

    // ── Feature detection ────────────────────────────────────────────────────

    isSupported(): boolean {
        return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    }

    isConnected(): boolean {
        return this.directoryHandle !== null;
    }

    // ── Directory permission ─────────────────────────────────────────────────

    /**
     * Opens the native directory picker, persists the handle in IndexedDB,
     * and returns the chosen directory name.
     */
    async requestDirectoryPermission(): Promise<string> {
        if (!this.isSupported()) {
            throw new Error('FileSystem Access API is not supported in this browser.');
        }

        const handle: FSDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        const db = await openDb();
        await idbPut(db, HANDLE_STORE, HANDLE_KEY, handle);
        this.directoryHandle = handle;
        return handle.name;
    }

    /**
     * Retrieves the previously stored directory handle from IndexedDB.
     * Re-requests permission if needed. Returns the handle or null if
     * none stored / permission denied.
     */
    async getStoredDirectoryHandle(): Promise<FSDirectoryHandle | null> {
        if (this.directoryHandle) {
            return this.directoryHandle;
        }

        if (!this.isSupported()) {
            return null;
        }

        try {
            const db = await openDb();
            const stored = await idbGet<FSDirectoryHandle>(db, HANDLE_STORE, HANDLE_KEY);
            if (!stored) {
                return null;
            }

            // Verify / re-request permission
            const permission = await (stored as any).queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                this.directoryHandle = stored;
                return stored;
            }

            const requested = await (stored as any).requestPermission({ mode: 'readwrite' });
            if (requested === 'granted') {
                this.directoryHandle = stored;
                return stored;
            }

            // Permission denied – remove stale handle
            await idbDelete(db, HANDLE_STORE, HANDLE_KEY);
            return null;
        } catch {
            return null;
        }
    }

    /** Disconnects the active handle (does not remove from IndexedDB). */
    disconnect(): void {
        this.directoryHandle = null;
    }

    // ── CBZ save / read ──────────────────────────────────────────────────────

    private offlineKey(mangaTitle: string, chapterName: string): string {
        return `${mangaTitle}::${chapterName}`;
    }

    /**
     * Saves a chapter CBZ blob.
     *
     * - If a directory handle is active: creates a manga sub-folder and writes
     *   the file via the FileSystem Access API.
     * - Otherwise: saves the blob in the IndexedDB 'offline-chapters' store as
     *   a fallback for Firefox / mobile / unsupported browsers.
     *
     * Returns `{ savedToDisk: boolean, blob }`.
     */
    async saveChapterCbz(
        mangaTitle: string,
        chapterName: string,
        blob: Blob,
        mangaId?: number,
    ): Promise<{ savedToDisk: boolean; blob: Blob }> {
        if (mangaId) {
            await this.registerMangaMetadata(mangaTitle, mangaId);
        }
        const handle = await this.getStoredDirectoryHandle();

        if (handle) {
            try {
                // Create / open manga subfolder
                const mangaDir = await handle.getDirectoryHandle(mangaTitle, { create: true });
                const fileName = `${chapterName}.cbz`;
                const fileHandle = await mangaDir.getFileHandle(fileName, { create: true });
                const writable = await (fileHandle as any).createWritable();
                await writable.write(blob);
                await writable.close();
                return { savedToDisk: true, blob };
            } catch {
                // Fall through to IndexedDB if disk write fails
            }
        }

        // IndexedDB fallback
        const db = await openDb();
        await idbPut(db, OFFLINE_STORE, this.offlineKey(mangaTitle, chapterName), blob);
        return { savedToDisk: false, blob };
    }

    /**
     * Returns true if the chapter exists either in the linked directory or in
     * the IndexedDB offline store.
     */
    async hasChapter(mangaTitle: string, chapterName: string): Promise<boolean> {
        // Check linked directory first
        const handle = await this.getStoredDirectoryHandle();
        if (handle) {
            try {
                const mangaDir = await handle.getDirectoryHandle(mangaTitle, { create: false });
                await mangaDir.getFileHandle(`${chapterName}.cbz`, { create: false });
                return true;
            } catch {
                // Not in directory
            }
        }

        // Check IndexedDB offline store
        const db = await openDb();
        const stored = await idbGet<Blob>(db, OFFLINE_STORE, this.offlineKey(mangaTitle, chapterName));
        return stored != null;
    }

    /**
     * Gets the blob for a chapter from the linked directory or from IndexedDB.
     * Returns null if not found in either location.
     */
    async getChapterBlob(mangaTitle: string, chapterName: string): Promise<Blob | null> {
        // Try linked directory first
        const handle = await this.getStoredDirectoryHandle();
        if (handle) {
            try {
                const mangaDir = await handle.getDirectoryHandle(mangaTitle, { create: false });
                const fileHandle = await mangaDir.getFileHandle(`${chapterName}.cbz`, { create: false });
                return await fileHandle.getFile();
            } catch {
                // Not in directory
            }
        }

        // Try IndexedDB offline store
        const db = await openDb();
        const stored = await idbGet<Blob>(db, OFFLINE_STORE, this.offlineKey(mangaTitle, chapterName));
        return stored ?? null;
    }

    // ── CBZ extraction ───────────────────────────────────────────────────────

    private static IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

    private static naturalCompare(a: string, b: string): number {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }

    /**
     * Unzips a CBZ blob and returns object URLs for all image files, sorted
     * numerically/alphabetically.
     */
    async extractPagesFromCbz(blob: Blob): Promise<{ url: string; index: number; name: string }[]> {
        const zip = await JSZip.loadAsync(blob);

        const imageEntries = Object.entries(zip.files).filter(
            ([name, file]) => !file.dir && LocalFileSystemService.IMAGE_EXTENSIONS.test(name),
        );

        // Sort numerically/alphabetically by filename
        imageEntries.sort(([nameA], [nameB]) => LocalFileSystemService.naturalCompare(nameA, nameB));

        const pages = await Promise.all(
            imageEntries.map(async ([name, file], index) => {
                const imgBlob = await file.async('blob');
                const url = URL.createObjectURL(imgBlob);
                return { url, index, name };
            }),
        );

        return pages;
    }

    /**
     * Extracts the first page from a CBZ blob as a typed blob URL for cover/thumbnail display.
     */
    async extractCoverFromCbz(blob: Blob): Promise<string | undefined> {
        try {
            const zip = await JSZip.loadAsync(blob);
            const imageEntries = Object.entries(zip.files).filter(
                ([name, file]) => !file.dir && LocalFileSystemService.IMAGE_EXTENSIONS.test(name),
            );
            if (imageEntries.length === 0) {
                return undefined;
            }
            imageEntries.sort(([nameA], [nameB]) => LocalFileSystemService.naturalCompare(nameA, nameB));
            const [coverName, coverFile] = imageEntries[0];
            const buffer = await coverFile.async('arraybuffer');
            let mimeType = 'image/jpeg';
            if (/\.png$/i.test(coverName)) {
                mimeType = 'image/png';
            } else if (/\.webp$/i.test(coverName)) {
                mimeType = 'image/webp';
            } else if (/\.gif$/i.test(coverName)) {
                mimeType = 'image/gif';
            } else if (/\.avif$/i.test(coverName)) {
                mimeType = 'image/avif';
            }
            const imgBlob = new Blob([buffer], { type: mimeType });
            return URL.createObjectURL(imgBlob);
        } catch {
            return undefined;
        }
    }

    /**
     * Retrieves the list of local manga across the linked directory (FileSystem Access API)
     * and IndexedDB offline chapters fallback, deduplicated and sorted by title.
     */
    async getLocalMangaList(): Promise<LocalMangaItem[]> {
        const mangaMap = new Map<string, LocalMangaItem>();

        // 1. Collect from linked directory handle (if connected)
        const handle = await this.getStoredDirectoryHandle();
        if (handle) {
            try {
                for await (const [, entry] of iterateDirectory(handle)) {
                    if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                        const mangaTitle = entry.name;
                        const mangaDir = entry as FileSystemDirectoryHandle;
                        let chapterCount = 0;
                        let coverFileHandle: FileSystemFileHandle | null = null;
                        let firstCbzHandle: FileSystemFileHandle | null = null;

                        for await (const [, child] of iterateDirectory(mangaDir)) {
                            if (child.kind === 'file') {
                                const name: string = child.name;
                                if (/\.cbz$/i.test(name)) {
                                    chapterCount++;
                                    if (!firstCbzHandle) {
                                        firstCbzHandle = child as FileSystemFileHandle;
                                    }
                                } else if (/^cover\.(jpe?g|png|webp|avif|bmp)$/i.test(name) && !coverFileHandle) {
                                    coverFileHandle = child as FileSystemFileHandle;
                                }
                            } else if (child.kind === 'directory' && !child.name.startsWith('.')) {
                                chapterCount++;
                            }
                        }

                        let coverUrl = this.coverUrlCache.get(mangaTitle);
                        if (!coverUrl) {
                            if (coverFileHandle) {
                                try {
                                    const file = await coverFileHandle.getFile();
                                    coverUrl = URL.createObjectURL(file);
                                    this.coverUrlCache.set(mangaTitle, coverUrl);
                                } catch {
                                    // ignore read failure
                                }
                            } else if (firstCbzHandle) {
                                try {
                                    const file = await firstCbzHandle.getFile();
                                    coverUrl = await this.extractCoverFromCbz(file);
                                    if (coverUrl) {
                                        this.coverUrlCache.set(mangaTitle, coverUrl);
                                    }
                                } catch {
                                    // ignore read failure
                                }
                            }
                        }

                        if (chapterCount > 0 || coverUrl) {
                            const realId = await this.getMangaId(mangaTitle);
                            const syntheticId = hashStringToId(mangaTitle);
                            const finalId = realId ?? syntheticId;
                            this.idToTitleMap.set(finalId, mangaTitle);
                            this.idToTitleMap.set(syntheticId, mangaTitle);

                            let inLibrary = false;
                            try {
                                const db = await openDb();
                                const meta = await idbGet<{ thumbnailUrl?: string; inLibrary?: boolean }>(db, METADATA_STORE, mangaTitle);
                                if (meta?.thumbnailUrl) {
                                    coverUrl = meta.thumbnailUrl;
                                }
                                if (meta?.inLibrary != null) {
                                    inLibrary = meta.inLibrary;
                                }
                            } catch {
                                // ignore
                            }

                            mangaMap.set(mangaTitle, {
                                id: finalId,
                                title: mangaTitle,
                                thumbnailUrl: coverUrl,
                                inLibrary,
                                sourceId: Sources.LOCAL_SOURCE_ID,
                                chapterCount,
                            });
                        }
                    }
                }
            } catch {
                // Ignore directory read failure
            }
        }

        // 2. Collect from IndexedDB offline-chapters
        try {
            const db = await openDb();
            const idbEntries = await idbGetAllEntries<Blob>(db, OFFLINE_STORE);
            const idbMangaMap = new Map<string, { count: number; firstBlob?: Blob }>();

            for (const { key, value } of idbEntries) {
                const sep = key.indexOf('::');
                if (sep === -1) {
                    continue;
                }
                const title = key.slice(0, sep);
                const existing = idbMangaMap.get(title);
                if (!existing) {
                    idbMangaMap.set(title, { count: 1, firstBlob: value });
                } else {
                    existing.count++;
                }
            }

            await Promise.all(
                Array.from(idbMangaMap.entries()).map(async ([title, info]) => {
                    const existing = mangaMap.get(title);
                    if (existing) {
                        const realId = await this.getMangaId(title);
                        if (realId) {
                            existing.id = realId;
                            this.idToTitleMap.set(realId, title);
                        }
                        if (!existing.thumbnailUrl && info.firstBlob) {
                            let coverUrl = this.coverUrlCache.get(title);
                            if (!coverUrl) {
                                coverUrl = await this.extractCoverFromCbz(info.firstBlob);
                                if (coverUrl) {
                                    this.coverUrlCache.set(title, coverUrl);
                                }
                            }
                            existing.thumbnailUrl = coverUrl;
                        }
                        const chapters = await this.getLocalMangaChapters(title);
                        existing.chapterCount = chapters.length;
                    } else {
                        const realId = await this.getMangaId(title);
                        const syntheticId = hashStringToId(title);
                        const finalId = realId ?? syntheticId;
                        this.idToTitleMap.set(finalId, title);
                        this.idToTitleMap.set(syntheticId, title);

                        let coverUrl = this.coverUrlCache.get(title);
                        if (!coverUrl && info.firstBlob) {
                            coverUrl = await this.extractCoverFromCbz(info.firstBlob);
                            if (coverUrl) {
                                this.coverUrlCache.set(title, coverUrl);
                            }
                        }

                        let inLibrary = false;
                        try {
                            const db = await openDb();
                            const meta = await idbGet<{ thumbnailUrl?: string; inLibrary?: boolean }>(db, METADATA_STORE, title);
                            if (meta?.thumbnailUrl) {
                                coverUrl = meta.thumbnailUrl;
                            }
                            if (meta?.inLibrary != null) {
                                inLibrary = meta.inLibrary;
                            }
                        } catch {
                            // ignore
                        }

                        mangaMap.set(title, {
                            id: finalId,
                            title,
                            thumbnailUrl: coverUrl,
                            inLibrary,
                            sourceId: Sources.LOCAL_SOURCE_ID,
                            chapterCount: info.count,
                        });
                    }
                }),
            );
        } catch {
            // Ignore IDB read failure
        }

        const result = Array.from(mangaMap.values());
        result.sort((a, b) => LocalFileSystemService.naturalCompare(a.title, b.title));
        return result;
    }

    /**
     * Retrieves the list of chapters for a given manga title across the linked directory
     * and IndexedDB offline store.
     */
    async getLocalMangaChapters(mangaTitle: string): Promise<LocalChapterItem[]> {
        const chapterMap = new Map<string, { name: string; chapterNumber: number }>();

        // 1. From linked directory handle
        const handle = await this.getStoredDirectoryHandle();
        if (handle) {
            try {
                const mangaDir = await handle.getDirectoryHandle(mangaTitle, { create: false });
                for await (const [, child] of iterateDirectory(mangaDir)) {
                    if (child.kind === 'file' && /\.cbz$/i.test(child.name)) {
                        const name = child.name.replace(/\.cbz$/i, '');
                        chapterMap.set(name, {
                            name,
                            chapterNumber: parseChapterNumber(name),
                        });
                    } else if (child.kind === 'directory' && !child.name.startsWith('.')) {
                        const { name } = child;
                        chapterMap.set(name, {
                            name,
                            chapterNumber: parseChapterNumber(name),
                        });
                    }
                }
            } catch {
                // Directory handle read error or folder doesn't exist
            }
        }

        // 2. From IndexedDB offline-chapters
        try {
            const db = await openDb();
            const idbChapters = await idbGetChaptersForManga(db, mangaTitle);
            for (const { chapterName } of idbChapters) {
                if (!chapterMap.has(chapterName)) {
                    chapterMap.set(chapterName, {
                        name: chapterName,
                        chapterNumber: parseChapterNumber(chapterName),
                    });
                }
            }
        } catch {
            // IDB read error
        }

        const chapters: LocalChapterItem[] = Array.from(chapterMap.values()).map((ch) => ({
            id: hashStringToId(`${mangaTitle}::${ch.name}`),
            name: ch.name,
            chapterNumber: ch.chapterNumber,
            isDownloaded: true,
        }));

        chapters.sort(
            (a, b) => b.chapterNumber - a.chapterNumber || LocalFileSystemService.naturalCompare(b.name, a.name),
        );

        return chapters;
    }

    // ── Export to user downloads ─────────────────────────────────────────────

    /**
     * Triggers a standard browser file download for the given CBZ blob,
     * named `${mangaTitle} - ${chapterName}.cbz`.
     */
    exportCbzToUserDownloads(mangaTitle: string, chapterName: string, blob: Blob): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${mangaTitle} - ${chapterName}.cbz`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke after a short delay to let the browser initiate the download
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 10_000);
    }
}

// Export a singleton instance
export const LocalFileSystem = new LocalFileSystemService();
