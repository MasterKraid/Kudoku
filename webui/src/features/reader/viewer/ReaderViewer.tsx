/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ForwardedRef } from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import { useMergedRef } from '@mantine/hooks';
import type { RouteStateReader } from '@/features/reader/Reader.types.ts';
import { PageInViewportType, ReaderResumeMode, ReadingDirection, ReadingMode } from '@/features/reader/Reader.types.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { ReaderControls } from '@/features/reader/services/ReaderControls.ts';
import {
    getPageGap,
    isContinuousReadingMode,
    isContinuousVerticalReadingMode,
    shouldApplyReaderWidth,
} from '@/features/reader/settings/ReaderSettings.utils.tsx';
import { useMouseDragScroll } from '@/base/hooks/useMouseDragScroll.tsx';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import { withPropsFrom } from '@/base/hoc/withPropsFrom.tsx';
import { useReaderAutoScroll } from '@/features/reader/auto-scroll/hooks/useReaderAutoScroll.ts';
import { useReaderHideOverlayOnUserScroll } from '@/features/reader/overlay/hooks/useReaderHideOverlayOnUserScroll.ts';
import { useReaderHorizontalModeRevampScrolling } from '@/features/reader/viewer/hooks/useReaderHorizontalModeRevampScrolling.ts';
import { useReaderHideCursorOnInactivity } from '@/features/reader/viewer/hooks/useReaderHideCursorOnInactivity.ts';
import { useReaderScrollToStartOnPageChange } from '@/features/reader/viewer/hooks/useReaderScrollToStartOnPageChange.ts';
import { useReaderHandlePageSelection } from '@/features/reader/viewer/hooks/useReaderHandlePageSelection.ts';
import { ReaderChapterViewer } from '@/features/reader/viewer/ReaderChapterViewer.tsx';
import {
    getPreviousNextChapterVisibility,
    getReaderChapterViewerCurrentPageIndex,
    getReaderChapterViewResumeMode,
} from '@/features/reader/Reader.utils.ts';
import { coerceIn, noOp } from '@/lib/HelperFunctions.ts';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import type { NavbarContextType } from '@/features/navigation-bar/NavigationBar.types.ts';
import { useReaderPreserveScrollPosition } from '@/features/reader/viewer/hooks/useReaderPreserveScrollPosition.ts';

import type { ChapterIdInfo } from '@/features/chapter/Chapter.types.ts';
import {
    getReaderAutoScrollStore,
    getReaderStore,
    useReaderChaptersStore,
    useReaderOverlayStore,
    useReaderPagesStore,
    useReaderSettingsStore,
} from '@/features/reader/stores/ReaderStore.ts';
import { STABLE_EMPTY_OBJECT } from '@/base/Base.constants.ts';
import { DEFAULT_READER_SETTINGS } from '@/features/reader/settings/ReaderSettings.constants.tsx';
import { getPage } from '@/features/reader/overlay/progress-bar/ReaderProgressBar.utils.tsx';

const READING_MODE_TO_IN_VIEWPORT_TYPE: Record<ReadingMode, PageInViewportType> = {
    [ReadingMode.SINGLE_PAGE]: PageInViewportType.X,
    [ReadingMode.DOUBLE_PAGE]: PageInViewportType.X,
    [ReadingMode.CONTINUOUS_VERTICAL]: PageInViewportType.Y,
    [ReadingMode.CONTINUOUS_HORIZONTAL]: PageInViewportType.X,
    [ReadingMode.WEBTOON]: PageInViewportType.Y,
};

const BaseReaderViewer = ({
    readerNavBarWidth,
    updateCurrentPageIndex,
    ref,
}: Pick<NavbarContextType, 'readerNavBarWidth'> & {
    updateCurrentPageIndex: ReturnType<typeof ReaderControls.useUpdateCurrentPageIndex>;
    ref?: ForwardedRef<HTMLDivElement | null>;
}) => {
    const { direction: themeDirection } = useTheme();
    const isOverlayVisible = useReaderOverlayStore('isVisible');
    const { currentPageIndex, pageToScrollToIndex, pages, totalPages, transitionPageMode, retryFailedPagesKeyPrefix } =
        useReaderPagesStore(
            'currentPageIndex',
            'pageToScrollToIndex',
            'pages',
            'totalPages',
            'transitionPageMode',
            'retryFailedPagesKeyPrefix',
        );
    const { initialChapter, currentChapter, chapters, visibleChapters, isCurrentChapterReady, isPreviousChapterLocked } = useReaderChaptersStore(
        'initialChapter',
        'currentChapter',
        'chapters',
        'visibleChapters',
        'isCurrentChapterReady',
        'isPreviousChapterLocked',
    );
    const {
        readingMode,
        readingDirection,
        readerWidth,
        readerZoom,
        pageScaleMode,
        shouldOffsetDoubleSpreads,
        imagePreLoadAmount,
        pageGap,
        customFilter,
        shouldStretchPage,
        isStaticNav,
        shouldShowTransitionPage,
    } = useReaderSettingsStore((state) => ({
        readingMode: state.readingMode.value,
        readingDirection: state.readingDirection.value,
        readerWidth: state.readerWidth.value,
        readerZoom: state.readerZoom?.value ?? DEFAULT_READER_SETTINGS.readerZoom,
        pageScaleMode: state.pageScaleMode.value,
        shouldOffsetDoubleSpreads: state.shouldOffsetDoubleSpreads.value,
        imagePreLoadAmount: state.imagePreLoadAmount,
        pageGap: state.pageGap.value,
        customFilter: state.customFilter,
        shouldStretchPage: state.shouldStretchPage.value,
        isStaticNav: state.isStaticNav,
        shouldShowTransitionPage: state.shouldShowTransitionPage,
    }));
    const safeAreaInset = useReaderSettingsStore('safeAreaInset');
    const { resumeMode = ReaderResumeMode.START } = useLocation<RouteStateReader>().state ?? STABLE_EMPTY_OBJECT;

    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
    const scrollElementRef = useRef<HTMLDivElement | null>(null);
    const setScrollElementRef = useCallback((node: HTMLDivElement | null) => {
        scrollElementRef.current = node;
        setScrollElement(node);
    }, []);
    const mergedRef = useMergedRef(ref, setScrollElementRef);

    const isContinuousVerticalReadingModeActive = isContinuousVerticalReadingMode(readingMode);
    const isContinuousReadingModeActive = isContinuousReadingMode(readingMode);
    const isDragging = useMouseDragScroll(scrollElementRef);

    useEffect(() => {
        if (scrollElement) {
            getReaderAutoScrollStore().setScrollRef(scrollElement);
        }
    }, [scrollElement]);

    const chapterElementRefs = useRef<Map<number, HTMLElement>>(new Map());
    const setChapterElementRef = useCallback((chapterId: ChapterIdInfo['id'], element: HTMLElement | null) => {
        if (element) {
            chapterElementRefs.current.set(chapterId, element);
        } else {
            chapterElementRefs.current.delete(chapterId);
        }
    }, []);

    const scrollbarXSize = MediaQuery.useGetScrollbarSize('X', scrollElementRef.current);
    const scrollbarYSize = MediaQuery.useGetScrollbarSize('Y', scrollElementRef.current);
    useLayoutEffect(() => {
        const { scrollbar } = getReaderStore();
        scrollbar.setXSize(scrollbarXSize);
        scrollbar.setYSize(scrollbarYSize);
    }, [scrollbarXSize, scrollbarYSize]);

    const imageRefs = useRef<(HTMLElement | null)[]>(pages.map(() => null));
    const [{ minChapterViewerWidth, minChapterViewerHeight, minChapterViewerSourceChapterId }, setChapterViewerSize] =
        useState({
            minChapterViewerWidth: 0,
            minChapterViewerHeight: 0,
            minChapterViewerSourceChapterId: -1,
        });

    const [, setTriggerReRender] = useState({});

    const inViewportType = READING_MODE_TO_IN_VIEWPORT_TYPE[readingMode];
    const isLtrReadingDirection = readingDirection === ReadingDirection.LTR;
    const initialChapterIndex = useMemo(
        () => chapters.findIndex((chapter) => chapter.id === initialChapter?.id),
        [chapters, initialChapter?.id],
    );
    const chaptersToRender = useMemo(
        () =>
            chapters.slice(
                Math.max(0, initialChapterIndex - visibleChapters.trailing),
                Math.min(chapters.length, initialChapterIndex + (isPreviousChapterLocked ? 0 : visibleChapters.leading) + 1),
            ),
        [chapters, initialChapterIndex, visibleChapters.trailing, visibleChapters.leading, isPreviousChapterLocked],
    );
    const currentChapterIndex = useMemo(
        () => chaptersToRender.findIndex((chapter) => chapter.id === currentChapter?.id),
        [currentChapter, chaptersToRender],
    );

    const onChapterViewerSizeChange = useCallback(
        (width: number, height: number, chapterId: ChapterIdInfo['id']) => {
            if (!isContinuousReadingModeActive) {
                return;
            }

            const isSameChapterId = chapterId === minChapterViewerSourceChapterId;

            if (isContinuousVerticalReadingModeActive) {
                if (!isSameChapterId && minChapterViewerWidth >= width) {
                    return;
                }

                setChapterViewerSize({
                    minChapterViewerWidth: width,
                    minChapterViewerHeight: 0,
                    minChapterViewerSourceChapterId: chapterId,
                });
                return;
            }

            if (isSameChapterId || minChapterViewerHeight < height) {
                setChapterViewerSize({
                    minChapterViewerWidth: 0,
                    minChapterViewerHeight: height,
                    minChapterViewerSourceChapterId: chapterId,
                });
            }
        },
        [
            isContinuousReadingModeActive,
            isContinuousVerticalReadingModeActive,
            minChapterViewerWidth,
            minChapterViewerHeight,
            minChapterViewerSourceChapterId,
        ],
    );

    useReaderHandlePageSelection(
        pageToScrollToIndex,
        pages,
        totalPages,
        updateCurrentPageIndex,
        isContinuousReadingModeActive,
        imageRefs,
        themeDirection,
        readingDirection,
        scrollElementRef,
    );
    useReaderScrollToStartOnPageChange(
        currentPageIndex,
        isContinuousReadingModeActive,
        themeDirection,
        readingDirection,
        scrollElementRef,
    );
    useReaderHideCursorOnInactivity(scrollElementRef);
    useReaderHorizontalModeRevampScrolling(readingMode, readingDirection, scrollElementRef);
    useReaderHideOverlayOnUserScroll(isOverlayVisible, scrollElementRef);
    useReaderAutoScroll(isOverlayVisible, isStaticNav);
    useReaderPreserveScrollPosition(
        scrollElementRef,
        currentChapter?.id,
        currentChapterIndex,
        currentPageIndex,
        chaptersToRender,
        visibleChapters,
        readingMode,
        readingDirection,
        pageScaleMode,
        shouldStretchPage,
        readerWidth,
        readerZoom,
    );

    useLayoutEffect(() => {
        setChapterViewerSize({
            minChapterViewerWidth: 0,
            minChapterViewerHeight: 0,
            minChapterViewerSourceChapterId: -1,
        });
        setTriggerReRender({});
    }, [readingMode]);

    const handleViewerScroll = useCallback(() => {
        if (isContinuousReadingModeActive && chaptersToRender.length > 1) {
            const focusY = isContinuousVerticalReadingModeActive ? window.innerHeight * 0.35 : 0;
            const focusX = !isContinuousVerticalReadingModeActive ? window.innerWidth * 0.5 : 0;

            let focusedChapterId: number | undefined;
            for (const ch of chaptersToRender) {
                const el = chapterElementRefs.current.get(ch.id);
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                const isUnderFocus = isContinuousVerticalReadingModeActive
                    ? rect.top <= focusY && rect.bottom > focusY
                    : rect.left <= focusX && rect.right > focusX;
                if (isUnderFocus) {
                    focusedChapterId = ch.id;
                    break;
                }
            }

            if (focusedChapterId === undefined) {
                let maxVisible = 0;
                for (const ch of chaptersToRender) {
                    const el = chapterElementRefs.current.get(ch.id);
                    if (!el) continue;
                    const rect = el.getBoundingClientRect();
                    const visible = isContinuousVerticalReadingModeActive
                        ? Math.max(0, Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top))
                        : Math.max(0, Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left));
                    if (visible > maxVisible) {
                        maxVisible = visible;
                        focusedChapterId = ch.id;
                    }
                }
            }

            if (focusedChapterId !== undefined && focusedChapterId !== currentChapter.id) {
                const prevChapter = currentChapter;
                const nextChapterId = focusedChapterId;
                const nextChapterObj = chapters.find((c) => c.id === nextChapterId);
                const isForward =
                    nextChapterObj && prevChapter ? nextChapterObj.sourceOrder > prevChapter.sourceOrder : true;

                if (prevChapter && isForward) {
                    // Mark previous chapter as read only if 90% was read
                    const prevPageCount = prevChapter.pageCount || 1;
                    const isNinetyPercent = (prevChapter.lastPageRead + 1) >= Math.ceil(prevPageCount * 0.9);
                    ReaderService.getOrCreateChapterUpdateQueue(prevChapter.id).enqueue(
                        `${prevChapter.id}`,
                        async () => {
                            await requestManager.updateChapters(
                                [prevChapter.id],
                                {
                                    lastPageRead: Math.max(0, prevChapter.pageCount - 1),
                                    ...(isNinetyPercent ? { isRead: true } : {}),
                                },
                                { errorPolicy: 'all' },
                            ).response;
                        },
                    );
                }
                ReaderControls.openChapter(nextChapterId, {
                    doTransitionCheck: false,
                    scrollIntoView: false,
                });
                // Record new chapter entry in history
                ReaderService.getOrCreateChapterUpdateQueue(nextChapterId).enqueue(
                    `${nextChapterId}`,
                    async () => {
                        await requestManager.updateChapters(
                            [nextChapterId],
                            { lastPageRead: 0 },
                            { errorPolicy: 'all' },
                        ).response;
                    },
                );
            }
        }

        const currentChapterEl = chapterElementRefs.current.get(currentChapter.id);
        ReaderControls.updateCurrentPageOnScroll(
            imageRefs,
            totalPages - 1,
            updateCurrentPageIndex,
            inViewportType,
            readingDirection,
            currentChapterEl,
        );
    }, [
        isContinuousReadingModeActive,
        chaptersToRender,
        isContinuousVerticalReadingModeActive,
        currentChapter,
        totalPages,
        updateCurrentPageIndex,
        inViewportType,
        readingDirection,
    ]);

    if (!initialChapter || !currentChapter) {
        throw new Error('ReaderViewer: illegal state - initialChapter and currentChapter should not be undefined');
    }

    return (
        <Stack
            ref={mergedRef}
            sx={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                overflowAnchor: 'none',
                flexWrap: 'nowrap',
                ...applyStyles(isContinuousReadingModeActive && !shouldShowTransitionPage, {
                    gap: `${getPageGap(pageGap, readingMode)}px`,
                }),
                ...applyStyles(isContinuousVerticalReadingModeActive, {
                    alignItems: 'center',
                }),
                ...applyStyles(!isContinuousVerticalReadingModeActive, {
                    ...applyStyles(themeDirection === 'ltr', {
                        flexDirection: isLtrReadingDirection ? 'row' : 'row-reverse',
                    }),
                    ...applyStyles(themeDirection === 'rtl', {
                        flexDirection: isLtrReadingDirection ? 'row-reverse' : 'row',
                    }),
                }),
            }}
            onClick={(e) => !isDragging && ReaderControls.handleClick(scrollElementRef.current, e)}
            onScroll={handleViewerScroll}
        >
            {chaptersToRender.map((_, index) => {
                // chapters are sorted by latest to oldest, thus, loop over it in reversed order
                const chapterIndex = Math.max(0, chaptersToRender.length - index - 1);
                const chapter = chaptersToRender[chapterIndex];

                const candidatePrev =
                    chaptersToRender[chapterIndex + 1] ?? chapters[initialChapterIndex + visibleChapters.leading + 1];
                const previousChapter =
                    candidatePrev && isPreviousChapterLocked && candidatePrev.sourceOrder < initialChapter.sourceOrder
                        ? undefined
                        : candidatePrev;
                const nextChapter =
                    chaptersToRender[chapterIndex - 1] ?? chapters[initialChapterIndex - visibleChapters.trailing - 1];

                const isChapterViewerSourceChapter = chapter.id === minChapterViewerSourceChapterId;

                const isInitialChapter = chapter.id === initialChapter.id;
                const isCurrentChapter = chapter.id === currentChapter.id;
                const isPreviousChapter = chapter.id === chaptersToRender[currentChapterIndex + 1]?.id;
                const isNextChapter = chapter.id === chaptersToRender[currentChapterIndex - 1]?.id;
                const isAdjacentChapterToCurrentChapter = isPreviousChapter || isNextChapter;

                const isLeadingChapter = initialChapter.sourceOrder > chapter.sourceOrder;
                const isTrailingChapter = initialChapter.sourceOrder < chapter.sourceOrder;
                const isLastLeadingChapter = visibleChapters.lastLeadingChapterSourceOrder === chapter.sourceOrder;
                const isLastTrailingChapter = visibleChapters.lastTrailingChapterSourceOrder === chapter.sourceOrder;

                const isPreloadMode =
                    !isContinuousReadingModeActive &&
                    ((isLastLeadingChapter && visibleChapters.isLeadingChapterPreloadMode) ||
                        (isLastTrailingChapter && visibleChapters.isTrailingChapterPreloadMode));

                const previousNextChapterVisibility = getPreviousNextChapterVisibility(
                    chapterIndex,
                    chaptersToRender,
                    visibleChapters,
                );

                const currentChapterCurrentPageIndex = isAdjacentChapterToCurrentChapter
                    ? getReaderChapterViewerCurrentPageIndex(
                          currentPageIndex,
                          currentChapter,
                          currentChapter,
                          true,
                          isCurrentChapterReady,
                          initialChapter.sourceOrder > currentChapter.sourceOrder,
                          initialChapter.sourceOrder < currentChapter.sourceOrder,
                          visibleChapters,
                      )
                    : -1;
                const currentChapterCurrentPagesIndex = isAdjacentChapterToCurrentChapter
                    ? (getPage(currentChapterCurrentPageIndex, pages)?.pagesIndex ?? -1)
                    : -1;

                const currentChapterRemainingLeadingPages = currentChapterCurrentPagesIndex;
                const currentChapterRemainingTrailingPages = pages.length - 1 - currentChapterCurrentPagesIndex;

                const currentChapterRemainingPages = isNextChapter
                    ? currentChapterRemainingTrailingPages
                    : currentChapterRemainingLeadingPages;

                return (
                    <ReaderChapterViewer
                        key={chapter.id}
                        chapterId={chapter.id}
                        previousChapterId={previousChapter?.id}
                        nextChapterId={nextChapter?.id}
                        isPreviousChapterVisible={previousNextChapterVisibility.previous}
                        isNextChapterVisible={previousNextChapterVisibility.next}
                        lastPageRead={coerceIn(chapter.lastPageRead, 0, chapter.pageCount - 1)}
                        lastPageOffset={chapter.lastPageOffset}
                        currentChapterRemainingPages={currentChapterRemainingPages}
                        currentPageIndex={getReaderChapterViewerCurrentPageIndex(
                            currentPageIndex,
                            chapter,
                            currentChapter,
                            isCurrentChapter,
                            isCurrentChapterReady,
                            isLeadingChapter,
                            isTrailingChapter,
                            visibleChapters,
                        )}
                        isInitialChapter={isInitialChapter}
                        isCurrentChapter={isCurrentChapter}
                        isPreviousChapter={isPreviousChapter}
                        isNextChapter={isNextChapter}
                        isLeadingChapter={isLeadingChapter}
                        isTrailingChapter={isTrailingChapter}
                        isPreloadMode={isPreloadMode}
                        imageRefs={imageRefs}
                        transitionPageMode={transitionPageMode}
                        retryFailedPagesKeyPrefix={retryFailedPagesKeyPrefix}
                        readingMode={readingMode}
                        readerWidth={readerWidth}
                        readerZoom={readerZoom}
                        safeAreaInset={safeAreaInset}
                        pageScaleMode={pageScaleMode}
                        shouldOffsetDoubleSpreads={shouldOffsetDoubleSpreads}
                        readingDirection={readingDirection}
                        updateCurrentPageIndex={isCurrentChapter ? updateCurrentPageIndex : noOp}
                        scrollIntoView={isCurrentChapter && visibleChapters.scrollIntoView}
                        resumeMode={getReaderChapterViewResumeMode(
                            isCurrentChapter,
                            isInitialChapter,
                            isLeadingChapter,
                            isTrailingChapter,
                            visibleChapters.resumeMode,
                            resumeMode,
                        )}
                        pageGap={pageGap}
                        imagePreLoadAmount={imagePreLoadAmount}
                        customFilter={customFilter}
                        shouldStretchPage={shouldStretchPage}
                        readerNavBarWidth={readerNavBarWidth}
                        onSizeChange={onChapterViewerSizeChange}
                        minWidth={isChapterViewerSourceChapter ? 0 : minChapterViewerWidth}
                        minHeight={isChapterViewerSourceChapter ? 0 : minChapterViewerHeight}
                        scrollElement={scrollElement}
                        setChapterElementRef={setChapterElementRef}
                    />
                );
            })}
        </Stack>
    );
};

export const ReaderViewer = withPropsFrom(
    memo(BaseReaderViewer),
    [() => ({ updateCurrentPageIndex: ReaderControls.useUpdateCurrentPageIndex() }), useNavBarContext],
    ['readerNavBarWidth', 'updateCurrentPageIndex'],
);
