/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';

// !!! IMPORTANT !!! - Update along with vite.config.ts workbox config
export enum ImageCacheKey {
    OTHER = 'image-cache-other',
    EXTENSION_ICONS = 'image-cache-extension-icons',
    MANGA_THUMBNAILS = 'image-cache-manga-thumbnails',
    CHAPTER_PAGES = 'image-cache-chapter-pages',
}

const IMAGE_CACHE_KEYS = Object.values(ImageCacheKey);

if (window.caches) {
    caches.delete('image-cache').catch(defaultPromiseErrorHandler('ImageCache: delete removed "image-cache"'));
}

export class ImageCache {
    // !!! IMPORTANT !!! - Update along with vite.config.ts workbox config
    static getKeyFor(url: string): ImageCacheKey {
        if (url.match(/\/chapter\/[0-9]+\/page\/[0-9]+/g)) {
            return ImageCacheKey.CHAPTER_PAGES;
        }

        if (url.match(/\/manga\/[0-9]+\/thumbnail/g)) {
            return url.includes('inLibrary=1') ? ImageCacheKey.MANGA_THUMBNAILS : ImageCacheKey.OTHER;
        }

        if (url.includes('/extension/icon/')) {
            return ImageCacheKey.EXTENSION_ICONS;
        }

        return ImageCacheKey.OTHER;
    }

    static async has(url: string, key: ImageCacheKey = this.getKeyFor(url)): Promise<boolean> {
        // Only library manga thumbnails are cached
        if (url.includes('/thumbnail') && !url.includes('inLibrary=1')) {
            return false;
        }
        try {
            const cache = await caches.open(key);
            const response = await cache.match(url, { ignoreVary: true });

            return response !== undefined;
        } catch (error) {
            return false;
        }
    }

    static async get(url: string, key: ImageCacheKey = this.getKeyFor(url)): Promise<Response | null> {
        try {
            const cache = await caches.open(key);
            const response = await cache.match(url);

            return response || null;
        } catch (error) {
            return null;
        }
    }

    static async clear(key: ImageCacheKey): Promise<void> {
        const cache = await caches.open(key);
        const imageKeys = await cache.keys();

        await Promise.all(imageKeys.map((imageKey) => cache.delete(imageKey)));
    }

    static async clearAll(): Promise<void> {
        try {
            const { requestManager } = await import('@/lib/requests/RequestManager.ts');
            requestManager.clearImageMemoryCache();
        } catch {
            // ignore
        }
        await Promise.all(IMAGE_CACHE_KEYS.map((key) => ImageCache.clear(key)));
    }

    /**
     * Enforces client storage quota (1 GB hard cap).
     * If storage usage exceeds 1 GB, trims temporary chapter pages and caches.
     */
    static async enforceQuota(maxBytes: number = 1024 * 1024 * 1024): Promise<void> {
        if (!('storage' in navigator) || !navigator.storage.estimate) return;
        try {
            const estimate = await navigator.storage.estimate();
            if (estimate.usage && estimate.usage > maxBytes) {
                // Evict non-essential chapter pages first
                await ImageCache.clear(ImageCacheKey.CHAPTER_PAGES);
                await ImageCache.clear(ImageCacheKey.OTHER);
            }
        } catch {
            // Ignore quota check failures
        }
    }
}
