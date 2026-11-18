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
import { requestManager } from '@/lib/requests/RequestManager.ts';
import type { RestClient } from '@/lib/requests/client/RestClient.ts';
import { GET_CHAPTER_PAGES_FETCH } from '@/lib/graphql/chapter/ChapterMutation.ts';
import type {
    GetChapterPagesFetchMutation,
    GetChapterPagesFetchMutationVariables,
} from '@/lib/graphql/generated/graphql.ts';

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

/** Validates that buffer starts with valid image magic bytes */
function isValidImageBuffer(buffer: ArrayBuffer): boolean {
    if (!buffer || buffer.byteLength < 12) return false;
    const view = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 32));

    // JPEG: FF D8 FF
    if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return true;
    // PNG: 89 50 4E 47
    if (view.length >= 4 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) return true;
    // WebP: RIFF .... WEBP
    if (
        view.length >= 12 &&
        view[0] === 0x52 &&
        view[1] === 0x49 &&
        view[2] === 0x46 &&
        view[3] === 0x46 &&
        view[8] === 0x57 &&
        view[9] === 0x45 &&
        view[10] === 0x42 &&
        view[11] === 0x50
    ) {
        return true;
    }
    // GIF: GIF8
    if (view.length >= 4 && view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x38) return true;
    // BMP: BM
    if (view.length >= 2 && view[0] === 0x42 && view[1] === 0x4d) return true;
    // AVIF: ....ftyp
    if (view.length >= 12) {
        const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
        if (ftyp === 'ftyp') return true;
    }
    return false;
}

/** Guess a file extension from an ArrayBuffer (magic bytes) or fallback to .jpg */
function guessExtension(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));
    if (view.length >= 4 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) {
        return 'png';
    }
    if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
        return 'jpg';
    }
    if (view.length >= 4 && view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) {
        return 'gif';
    }
    if (
        view.length >= 12 &&
        view[0] === 0x52 &&
        view[1] === 0x49 &&
        view[2] === 0x46 &&
        view[3] === 0x46 &&
        view[8] === 0x57 &&
        view[9] === 0x45 &&
        view[10] === 0x42 &&
        view[11] === 0x50
    ) {
        return 'webp';
    }
    if (view.length >= 12) {
        const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
        if (ftyp === 'ftyp') {
            return 'avif';
        }
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

    const restClient = requestManager.getClient() as RestClient;

    // 1. Fetch exact page list from GraphQL mutation fetchChapterPages
    // This tells the Suwayomi server to invoke Page.INSTANCE.prefetchChapter(...) to prefetch from upstream extension
    const pagesMutation = await requestManager.graphQLClient.client.mutate<
        GetChapterPagesFetchMutation,
        GetChapterPagesFetchMutationVariables
    >({
        mutation: GET_CHAPTER_PAGES_FETCH,
        variables: {
            input: { chapterId },
        },
        context: { fetchOptions: { signal } },
    });

    const pages = pagesMutation.data?.fetchChapterPages?.pages;
    if (!pages || pages.length === 0) {
        throw new Error('Chapter has no pages or failed to prefetch from source');
    }

    const pageCount = pages.length;

    // 2. Fetch each page as ArrayBuffer
    const pageBuffers: { buffer: ArrayBuffer; ext: string }[] = [];
    let downloadedBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < pageCount; i++) {
        if (signal.aborted) {
            throw new DOMException('Cancelled', 'AbortError');
        }
        const pageUrl = pages[i];
        /* eslint-disable-next-line no-await-in-loop */
        const pageRes = await restClient.fetcher(
            pageUrl,
            { checkResponseIsJson: false, config: { signal } },
        );
        /* eslint-disable-next-line no-await-in-loop */
        const buffer = await pageRes.arrayBuffer();

        // Validate buffer
        if (!buffer || buffer.byteLength === 0) {
            throw new Error(`Downloaded empty buffer for page ${i + 1}`);
        }
        if (!isValidImageBuffer(buffer)) {
            const preview = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 80)));
            throw new Error(`Server returned non-image response for page ${i + 1}: ${preview}`);
        }

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
    let thumbnailUrl: string | undefined;
    try {
        const { Mangas } = await import('@/features/manga/services/Mangas.ts');
        thumbnailUrl = Mangas.getFromCache(mangaId)?.thumbnailUrl;
    } catch {
        // ignore
    }
    // Invalidate cached pages in memory if re-downloading
    LocalFileSystem.clearChapterPagesCache(chapterId);

    const { savedToDisk } = await LocalFileSystem.saveChapterCbz(mangaTitle, chapterName, cbzBlob, mangaId, thumbnailUrl);

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

        import('@/features/local-repository/services/LocalFileSystem.ts').then(({ LocalFileSystem }) => {
            LocalFileSystem.registerMangaMetadata(mangaTitle, mangaId);
        });

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
