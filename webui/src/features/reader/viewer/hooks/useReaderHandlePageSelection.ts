/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { MutableRefObject } from 'react';
import { useLayoutEffect } from 'react';
import type { Direction } from '@mui/material/styles';
import type { ReaderStatePages, ReadingDirection } from '@/features/reader/Reader.types.ts';
import { getIndexOfPage, getPage } from '@/features/reader/overlay/progress-bar/ReaderProgressBar.utils.tsx';
import { getScrollIntoViewInlineOption } from '@/features/reader/viewer/pager/ReaderPager.utils.tsx';
import type { ReaderControls } from '@/features/reader/services/ReaderControls.ts';
import {
    getReaderChaptersStore,
    getReaderPagesStore,
    getReaderSettingsStore,
} from '@/features/reader/stores/ReaderStore.ts';
import { isContinuousVerticalReadingMode } from '@/features/reader/settings/ReaderSettings.utils.tsx';
import { ReaderScrollOffset } from '@/features/reader/services/ReaderScrollOffset.ts';

export const useReaderHandlePageSelection = (
    pageToScrollToIndex: ReaderStatePages['pageToScrollToIndex'],
    pages: ReaderStatePages['pages'],
    totalPages: number,
    updateCurrentPageIndex: ReturnType<typeof ReaderControls.useUpdateCurrentPageIndex>,
    isContinuousReadingModeActive: boolean,
    imageRefs: MutableRefObject<(HTMLElement | null)[]>,
    themeDirection: Direction,
    readingDirection: ReadingDirection,
    scrollElementRef: { current: HTMLElement | null },
) => {
    useLayoutEffect(() => {
        if (pageToScrollToIndex == null || !pages?.length) {
            return;
        }

        const pageToScrollTo = getPage(pageToScrollToIndex, pages);
        if (!pageToScrollTo) {
            return;
        }

        if (isContinuousReadingModeActive) {
            const doScroll = () => {
                let imageRef = imageRefs.current[pageToScrollTo.pagesIndex];
                if (!imageRef && scrollElementRef.current) {
                    imageRef = (scrollElementRef.current.querySelector(
                        `img[alt="Page #${pageToScrollTo.primary.index + 1}"]`,
                    ) ||
                        scrollElementRef.current.querySelector(
                            `[data-reader-page="true"][alt="Page #${pageToScrollTo.primary.index + 1}"]`,
                        ) ||
                        scrollElementRef.current.querySelectorAll('[data-reader-page="true"]')[
                            pageToScrollTo.pagesIndex
                        ]) as HTMLElement | null;
                }
                if (!imageRef) {
                    return false;
                }

                imageRef.scrollIntoView({
                    block: 'start',
                    behavior: 'auto',
                });

                if (
                    scrollElementRef.current &&
                    isContinuousVerticalReadingMode(getReaderSettingsStore().readingMode.value)
                ) {
                    const pageRect = imageRef.getBoundingClientRect();
                    const containerRect = scrollElementRef.current.getBoundingClientRect();
                    scrollElementRef.current.scrollTop += pageRect.top - containerRect.top;
                }

                const { currentChapter } = getReaderChaptersStore();
                if (
                    scrollElementRef.current &&
                    currentChapter &&
                    isContinuousVerticalReadingMode(getReaderSettingsStore().readingMode.value)
                ) {
                    ReaderScrollOffset.applyPendingResume(
                        currentChapter.id,
                        getIndexOfPage(pageToScrollTo),
                        imageRef,
                        scrollElementRef.current,
                    );
                }
                return true;
            };

            if (!doScroll()) {
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    if (doScroll() || attempts >= 20) {
                        clearInterval(interval);
                    }
                }, 50);
            }
        }

        const newPageIndex = getIndexOfPage(pageToScrollTo);
        const isLastPage = newPageIndex === totalPages - 1;

        getReaderPagesStore().setPageToScrollToIndex(null);
        updateCurrentPageIndex(newPageIndex, !isLastPage, isLastPage);
    }, [pageToScrollToIndex]);
};
