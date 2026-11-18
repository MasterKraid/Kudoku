/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import pLimit from 'p-limit';
import JSZip from 'jszip';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { closeSnackbar, enqueueSnackbar } from 'notistack';
import Button from '@mui/material/Button';
import { createElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterInfo {
    id: number;
    name: string;
    chapterNumber: number;
    sourceOrder: number;
    pageCount?: number;
}

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';

export interface DownloadEntry {
    chapterId: number;
    chapterName: string;
    mangaTitle: string;
    mangaId: number;
    status: DownloadStatus;
    /** 0–100 */
    progress: number;
    /** bytes/sec, only while downloading */
    speed: number;
    /** seconds remaining estimate */
    eta: number;
    error?: string;
    /** AbortController signal for in-flight fetches */
    abortController?: AbortController;
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface ClientDownloadState {
    queue: DownloadEntry[];
    addEntry: (entry: DownloadEntry) => void;
    updateEntry: (chapterId: number, patch: Partial<DownloadEntry>) => void;
    removeEntry: (chapterId: number) => void;
}

export const useClientDownloadStore = create<ClientDownloadState>()(
    devtools(
        immer((set) => ({
            queue: [],
            addEntry: (entry) => {
                set((state) => {
                    const existing = state.queue.findIndex((e) => e.chapterId === entry.chapterId);
                    if (existing === -1) {
                        state.queue.push(entry);
                    }
                });
            },
            updateEntry: (chapterId, patch) => {
                set((state) => {
                    const idx = state.queue.findIndex((e) => e.chapterId === chapterId);
                    if (idx !== -1) {
                        Object.assign(state.queue[idx], patch);
                    }
                });
            },
            removeEntry: (chapterId) => {
                set((state) => ({
                    queue: state.queue.filter((e) => e.chapterId !== chapterId),
                }));
            },
        })),
        { name: 'ClientDownloadStore' },
    ),
);

// ---------------------------------------------------------------------------
// Event emitter (lightweight, for non-React consumers)
// ---------------------------------------------------------------------------

type DownloadEvent =
    | { type: 'queued'; chapterId: number }
    | { type: 'progress'; chapterId: number; progress: number }
    | { type: 'done'; chapterId: number }
    | { type: 'error'; chapterId: number; error: string }
    | { type: 'cancelled'; chapterId: number };

type DownloadEventListener = (event: DownloadEvent) => void;

const eventListeners: Set<DownloadEventListener> = new Set();

function emit(event: DownloadEvent) {
    eventListeners.forEach((fn) => {
        fn(event);
    });
}

// ---------------------------------------------------------------------------
// Concurrency limiter — max 2 chapter downloads at the same time
// ---------------------------------------------------------------------------

const limiter = pLimit(2);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChapterName(chapter: ChapterInfo): string {
    return chapter.name || `Chapter ${chapter.chapterNumber}`;
}

/** Pads a number to `width` digits, e.g. padIndex(3, 3) → '003' */
function padIndex(n: number, width = 3): string {
    return String(n).padStart(width, '0');
}

function escapeXml(s: string): string {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function buildComicInfoXml(mangaTitle: string, chapterName: string, chapterNumber: number): string {
    return [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '           xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
        `  <Title>${escapeXml(chapterName)}</Title>`,
        `  <Series>${escapeXml(mangaTitle)}</Series>`,
        `  <Number>${chapterNumber}</Number>`,
        '</ComicInfo>',
    ].join('\n');
}

/** Guess a file extension from an ArrayBuffer (magic bytes) or fallback to .jpg */
function guessExtension(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer, 0, 12);
    if (view[0] === 0x89 && view[1] === 0x50) {
        return 'png';
    }
    if (view[0] === 0xff && view[1] === 0xd8) {
        return 'jpg';
    }
    if (view[0] === 0x47 && view[1] === 0x49) {
        return 'gif';
    }
    if (view[0] === 0x52 && view[1] === 0x49 && view[8] === 0x57 && view[9] === 0x45) {
        return 'webp';
    }
    return 'jpg';
}

/** Fire action toast asking the user to save the CBZ to their Downloads folder */
function showSaveToDownloadsToast(mangaTitle: string, chapterName: string, blob: Blob) {
    const key = enqueueSnackbar('Chapter downloaded for offline reading.', {
        variant: 'success',
        persist: false,
        autoHideDuration: 10_000,
        // @ts-ignore notistack action prop
        action: () =>
            createElement(
                Button,
                {
                    color: 'inherit',
                    size: 'small',
                    onClick: () => {
                        closeSnackbar(key);
                        import('@/features/local-repository/services/LocalFileSystem.ts').then(({ LocalFileSystem }) => {
                            LocalFileSystem.exportCbzToUserDownloads(mangaTitle, chapterName, blob);
                        });
                    },
                },
                'Save copy to Downloads',
            ),
    });
}

// ---------------------------------------------------------------------------
// Core download logic
// ---------------------------------------------------------------------------

async function downloadChapter(
    chapter: ChapterInfo,
    mangaTitle: string,
    mangaId: number,
    abortController: AbortController,
): Promise<void> {
    const { signal } = abortController;
    const { updateEntry } = useClientDownloadStore.getState();
    const chapterId = chapter.id;
    const chapterName = buildChapterName(chapter);

    // 1. Fetch page list from server REST API
    const listRes = await fetch(
        `/api/v1/manga/${mangaId}/chapter/${chapter.sourceOrder}`,
        { signal },
    );
    if (!listRes.ok) {
        throw new Error(`Failed to fetch chapter info: ${listRes.status}`);
    }
    const chapterMeta: { pageCount: number } = await listRes.json();
    const pageCount: number = chapterMeta.pageCount ?? chapter.pageCount ?? 0;
    if (pageCount === 0) {
        throw new Error('Chapter has no pages');
    }

    // 2. Fetch each page as ArrayBuffer
    const pageBuffers: { buffer: ArrayBuffer; ext: string }[] = [];
    let downloadedBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < pageCount; i++) {
        if (signal.aborted) {
            throw new DOMException('Cancelled', 'AbortError');
        }
        /* eslint-disable-next-line no-await-in-loop */
        const pageRes = await fetch(
            `/api/v1/manga/${mangaId}/chapter/${chapter.sourceOrder}/page/${i}`,
            { signal },
        );
        if (!pageRes.ok) {
            throw new Error(`Failed to fetch page ${i}: ${pageRes.status}`);
        }
        /* eslint-disable-next-line no-await-in-loop */
        const buffer = await pageRes.arrayBuffer();
        const ext = guessExtension(buffer);
        pageBuffers.push({ buffer, ext });

        // Update progress + speed/ETA
        downloadedBytes += buffer.byteLength;
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
        const progress = Math.round(((i + 1) / pageCount) * 100);
        // Simple ETA: remaining pages * average time per page
        const avgPageTime = elapsed / (i + 1);
        const eta = avgPageTime * (pageCount - i - 1);

        updateEntry(chapterId, { progress, speed, eta });
        emit({ type: 'progress', chapterId, progress });
    }

    // 3. Build CBZ using JSZip
    const zip = new JSZip();

    pageBuffers.forEach(({ buffer, ext }, idx) => {
        zip.file(`${padIndex(idx + 1)}.${ext}`, buffer);
    });

    zip.file(
        'ComicInfo.xml',
        buildComicInfoXml(mangaTitle, chapterName, chapter.chapterNumber),
    );

    const cbzBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    // 4. Save via LocalFileSystem
    const { LocalFileSystem } = await import('@/features/local-repository/services/LocalFileSystem.ts');
    const { savedToDisk } = await LocalFileSystem.saveChapterCbz(mangaTitle, chapterName, cbzBlob);

    if (!savedToDisk) {
        showSaveToDownloadsToast(mangaTitle, chapterName, cbzBlob);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ClientDownloadManager = {
    /**
     * Queue a single chapter for client-side download.
     */
    queueChapter(chapter: ChapterInfo, mangaTitle: string, mangaId: number): void {
        const { addEntry, updateEntry, removeEntry } = useClientDownloadStore.getState();
        const chapterId = chapter.id;

        // Skip if already queued or downloading
        const existing = useClientDownloadStore
            .getState()
            .queue.find((e) => e.chapterId === chapterId);
        if (existing && existing.status !== 'error' && existing.status !== 'cancelled') {
            return;
        }

        const abortController = new AbortController();
        const entry: DownloadEntry = {
            chapterId,
            chapterName: buildChapterName(chapter),
            mangaTitle,
            mangaId,
            status: 'queued',
            progress: 0,
            speed: 0,
            eta: 0,
            abortController,
        };

        addEntry(entry);
        emit({ type: 'queued', chapterId });

        limiter(async () => {
            if (abortController.signal.aborted) {
                updateEntry(chapterId, { status: 'cancelled' });
                return;
            }

            updateEntry(chapterId, { status: 'downloading' });

            try {
                await downloadChapter(chapter, mangaTitle, mangaId, abortController);
                updateEntry(chapterId, { status: 'done', progress: 100 });
                emit({ type: 'done', chapterId });

                // Remove from queue after a short delay so UI can show 'done' state
                setTimeout(() => {
                    removeEntry(chapterId);
                }, 3000);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    updateEntry(chapterId, { status: 'cancelled', progress: 0 });
                    emit({ type: 'cancelled', chapterId });
                } else {
                    const message = err instanceof Error ? err.message : String(err);
                    updateEntry(chapterId, { status: 'error', error: message });
                    emit({ type: 'error', chapterId, error: message });
                }
            }
        });
    },

    /**
     * Queue multiple chapters for client-side download.
     */
    queueChapters(chapters: ChapterInfo[], mangaTitle: string, mangaId: number): void {
        chapters.forEach((chapter) => {
            ClientDownloadManager.queueChapter(chapter, mangaTitle, mangaId);
        });
    },

    /**
     * Returns true if the chapter with the given ID is currently queued or downloading.
     */
    isDownloading(chapterId: number): boolean {
        const { queue } = useClientDownloadStore.getState();
        const entry = queue.find((e) => e.chapterId === chapterId);
        return entry?.status === 'queued' || entry?.status === 'downloading';
    },

    /**
     * Cancel a queued or in-progress download.
     */
    cancelDownload(chapterId: number): void {
        const { queue, updateEntry } = useClientDownloadStore.getState();
        const entry = queue.find((e) => e.chapterId === chapterId);
        if (!entry) {
            return;
        }
        entry.abortController?.abort();
        updateEntry(chapterId, { status: 'cancelled' });
        emit({ type: 'cancelled', chapterId });
    },

    /**
     * Subscribe to download lifecycle events.
     * Returns an unsubscribe function.
     */
    subscribe(listener: DownloadEventListener): () => void {
        eventListeners.add(listener);
        return () => {
            eventListeners.delete(listener);
        };
    },
};
