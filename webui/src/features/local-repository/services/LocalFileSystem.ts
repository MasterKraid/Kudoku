/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import JSZip from 'jszip';

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

const DB_NAME = 'tsundoku-local-fs';
const DB_VERSION = 1;
const HANDLE_STORE = 'directory-handle';
const OFFLINE_STORE = 'offline-chapters';
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

// ─── Type helpers ────────────────────────────────────────────────────────────

type FSDirectoryHandle = FileSystemDirectoryHandle;

// ─── LocalFileSystem service ─────────────────────────────────────────────────

class LocalFileSystemService {
    private directoryHandle: FSDirectoryHandle | null = null;

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
    ): Promise<{ savedToDisk: boolean; blob: Blob }> {
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
