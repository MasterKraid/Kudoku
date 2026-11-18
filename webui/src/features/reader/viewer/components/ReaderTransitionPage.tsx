/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { Link } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { memo, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import { useLingui } from '@lingui/react/macro';
import { ReaderBackgroundColor, ReaderTransitionPageMode, ReadingMode } from '@/features/reader/Reader.types.ts';
import { isTransitionPageVisible } from '@/features/reader/viewer/pager/ReaderPager.utils.tsx';
import { useBackButton } from '@/base/hooks/useBackButton.ts';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import {
    isContinuousReadingMode,
    isContinuousVerticalReadingMode,
} from '@/features/reader/settings/ReaderSettings.utils.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import type { NavbarContextType } from '@/features/navigation-bar/NavigationBar.types.ts';
import { withPropsFrom } from '@/base/hoc/withPropsFrom.tsx';
import { getValueFromObject, noOp } from '@/lib/HelperFunctions.ts';
import type { ChapterIdInfo, ChapterNameInfo, ChapterScanlatorInfo } from '@/features/chapter/Chapter.types.ts';
import {
    useReaderChaptersStore,
    useReaderPagesStore,
    useReaderScrollbarStore,
    useReaderSettingsStore,
    useReaderStore,
} from '@/features/reader/stores/ReaderStore.ts';
import { READER_BACKGROUND_TO_COLOR } from '@/features/reader/settings/ReaderSettings.constants.tsx';
import { getPage } from '@/features/reader/overlay/progress-bar/ReaderProgressBar.utils.tsx';

const ChapterInfo = ({
    title,
    name,
    scanlator,
    backgroundColor,
}: {
    title: string;
    name?: ChapterNameInfo['name'];
    scanlator?: ChapterScanlatorInfo['scanlator'];
    backgroundColor: ReaderBackgroundColor;
}) => {
    const theme = useTheme();

    const readingMode = useReaderSettingsStore((state) => state.readingMode.value);
    const useAutoBackgroundColorContinuousMode = useReaderSettingsStore('useAutoBackgroundColorContinuousMode');
    const autoBackgroundColor = useReaderPagesStore((state) =>
        backgroundColor === ReaderBackgroundColor.AUTO &&
        useAutoBackgroundColorContinuousMode &&
        isContinuousReadingMode(readingMode)
            ? state.pageBackgroundColors[getPage(state.currentPageIndex, state.pages)?.pagesIndex ?? 0]?.color
            : undefined,
    );

    const isVerticalContinuous = isContinuousVerticalReadingMode(readingMode);
    const contrastText = isVerticalContinuous
        ? theme.palette.text.primary
        : theme.palette.getContrastText(
              autoBackgroundColor ?? getValueFromObject<string>(theme.palette, READER_BACKGROUND_TO_COLOR[backgroundColor]),
          );
    const disabledText = isVerticalContinuous
        ? theme.palette.text.secondary
        : theme.alpha(contrastText, 0.5);

    if (!name) {
        return null;
    }

    return (
        <Stack sx={{ alignItems: isVerticalContinuous ? 'center' : 'inherit' }}>
            <Typography
                variant={isVerticalContinuous ? 'caption' : 'body1'}
                sx={{
                    color: disabledText,
                    ...(isVerticalContinuous && { textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }),
                }}
            >
                {title}
            </Typography>
            <Typography
                sx={{ color: contrastText, fontWeight: isVerticalContinuous ? 600 : 'inherit' }}
                variant={isVerticalContinuous ? 'subtitle1' : 'h6'}
                component="h1"
            >
                {name}
            </Typography>
            {scanlator && (
                <Typography variant="caption" sx={{ color: disabledText }}>
                    {scanlator}
                </Typography>
            )}
        </Stack>
    );
};

const BaseReaderTransitionPage = ({
    type,
    currentChapterName,
    currentChapterScanlator,
    previousChapterName,
    previousChapterScanlator,
    nextChapterName,
    nextChapterScanlator,
    readerNavBarWidth,
    handleBack,
}: Pick<NavbarContextType, 'readerNavBarWidth'> & {
    // gets used in the "source props creators" of the "withPropsFrom" call
    chapterId: ChapterIdInfo['id'];
    currentChapterName?: ChapterNameInfo['name'];
    currentChapterScanlator?: ChapterScanlatorInfo['scanlator'];
    previousChapterName?: ChapterNameInfo['name'];
    previousChapterScanlator?: ChapterScanlatorInfo['scanlator'];
    nextChapterName?: ChapterNameInfo['name'];
    nextChapterScanlator?: ChapterScanlatorInfo['scanlator'];
    type: Exclude<ReaderTransitionPageMode, ReaderTransitionPageMode.NONE | ReaderTransitionPageMode.BOTH>;
    handleBack: () => void;
}) => {
    const { t } = useLingui();
    const manga = useReaderStore('manga');
    const scrollbar = useReaderScrollbarStore((state) => state);
    const transitionPageMode = useReaderPagesStore('transitionPageMode');
    const { readingMode, backgroundColor, shouldShowTransitionPage } = useReaderSettingsStore((state) => ({
        readingMode: state.readingMode.value,
        backgroundColor: state.backgroundColor,
        shouldShowTransitionPage: state.shouldShowTransitionPage,
    }));

    const isPreviousType = type === ReaderTransitionPageMode.PREVIOUS;
    const isNextType = type === ReaderTransitionPageMode.NEXT;

    const isFirstChapter = !!currentChapterName && !previousChapterName;
    const isLastChapter = !!currentChapterName && !nextChapterName;

    const forceShowFirstChapterPreviousTransitionPage = isFirstChapter && type === ReaderTransitionPageMode.PREVIOUS;
    const forceShowLastChapterNextTransitionPage = isLastChapter && type === ReaderTransitionPageMode.NEXT;
    const forceShowTransitionPage =
        forceShowFirstChapterPreviousTransitionPage || forceShowLastChapterNextTransitionPage;

    if (!shouldShowTransitionPage && !forceShowTransitionPage) {
        return null;
    }

    if (!isTransitionPageVisible(type, transitionPageMode, readingMode)) {
        return null;
    }

    const isVerticalContinuous = isContinuousVerticalReadingMode(readingMode);

    return (
        <Stack
            sx={{
                justifyContent: 'center',
                alignItems: 'center',
                ...applyStyles(!isContinuousReadingMode(readingMode), {
                    backgroundColor: READER_BACKGROUND_TO_COLOR[backgroundColor],
                    width: `calc(100vw - ${scrollbar.ySize}px - ${readerNavBarWidth}px)`,
                    height: `calc(100vh - ${scrollbar.xSize}px)`,
                }),
                ...applyStyles(isContinuousReadingMode(readingMode), {
                    ...applyStyles(isVerticalContinuous, {
                        width: '100%',
                        maxWidth: (theme) =>
                            `min(480px, calc(100vw - ${scrollbar.ySize}px - ${readerNavBarWidth}px - ${theme.spacing(4)}))`,
                        margin: '16px auto',
                        py: 2,
                        px: 3,
                        border: '2px solid',
                        borderColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                        borderRadius: 2,
                        backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? '#1c1c1e' : '#f5f5f7',
                        backdropFilter: 'blur(10px)',
                        boxShadow: 4,
                        textAlign: 'center',
                        minHeight: 'unset',
                        height: 'auto',
                        boxSizing: 'border-box',
                    }),
                    ...applyStyles(readingMode === ReadingMode.CONTINUOUS_HORIZONTAL, {
                        top: 0,
                        position: 'sticky',
                        minWidth: `calc(100vw - ${scrollbar.ySize}px - ${readerNavBarWidth}px)`,
                        maxHeight: `calc(100vh - ${scrollbar.xSize}px)`,
                    }),
                }),
            }}
        >
            <Stack
                sx={{
                    gap: 1.5,
                    maxWidth: (theme) =>
                        `calc(100vw - ${scrollbar.ySize}px - ${readerNavBarWidth}px - ${theme.spacing(2)})`,
                    maxHeight: isVerticalContinuous ? 'unset' : `calc(100vh - ${scrollbar.xSize}px)`,
                    width: isVerticalContinuous ? '100%' : 'max-content',
                    alignItems: 'center',
                    ...applyStyles(!isContinuousReadingMode(readingMode), {
                        py: 3,
                        px: 4,
                        border: '2px solid',
                        borderColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                        borderRadius: 2,
                        backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? '#1c1c1e' : '#f5f5f7',
                        boxShadow: 4,
                        minWidth: 280,
                    }),
                    p: isVerticalContinuous ? 0 : undefined,
                }}
            >
                {isPreviousType && isFirstChapter && (
                    <Typography variant="h6">{t`There is no previous chapter`}</Typography>
                )}
                <Stack sx={{ gap: isVerticalContinuous ? 1.5 : 5, width: '100%', alignItems: 'center' }}>
                    {isPreviousType && !isFirstChapter && (
                        <ChapterInfo
                            title={t`Previous:`}
                            name={previousChapterName}
                            scanlator={previousChapterScanlator}
                            backgroundColor={backgroundColor}
                        />
                    )}
                    {isPreviousType && !isFirstChapter && !!currentChapterName && isVerticalContinuous && (
                        <Divider
                            sx={{
                                width: '60%',
                                my: 0.5,
                                borderColor: (theme) =>
                                    theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                            }}
                        />
                    )}
                    {!!currentChapterName && (
                        <ChapterInfo
                            title={isPreviousType ? t`Current:` : t`Finished:`}
                            name={currentChapterName}
                            scanlator={currentChapterScanlator}
                            backgroundColor={backgroundColor}
                        />
                    )}
                    {isNextType && !isLastChapter && !!currentChapterName && isVerticalContinuous && (
                        <Divider
                            sx={{
                                width: '60%',
                                my: 0.5,
                                borderColor: (theme) =>
                                    theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                            }}
                        />
                    )}
                    {isNextType && !isLastChapter && (
                        <ChapterInfo
                            title={t`Next:`}
                            name={nextChapterName}
                            scanlator={nextChapterScanlator}
                            backgroundColor={backgroundColor}
                        />
                    )}
                </Stack>
                {isNextType && isLastChapter && <Typography variant="h6">{t`There is no next chapter`}</Typography>}
                {((isPreviousType && isFirstChapter) || (isNextType && isLastChapter)) && (
                    <Stack sx={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
                        <Button
                            sx={{ flexGrow: 1 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleBack();
                            }}
                            variant="contained"
                        >
                            {t`Exit to previous page`}
                        </Button>
                        <Button
                            sx={{ flexGrow: 1 }}
                            component={Link}
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                            variant="contained"
                            to={AppRoutes.manga.path(manga?.id ?? -1)}
                        >
                            {t`Exit to manga page`}
                        </Button>
                    </Stack>
                )}
            </Stack>
        </Stack>
    );
};

export const ReaderTransitionPage = withPropsFrom(
    memo(BaseReaderTransitionPage) as typeof BaseReaderTransitionPage,
    [
        ({ chapterId }: Pick<ComponentProps<typeof BaseReaderTransitionPage>, 'chapterId'>) => {
            const chapters = useReaderChaptersStore('chapters');

            const currentChapterIndex = useMemo(
                () => chapters.findIndex((chapter) => chapter.id === chapterId),
                [chapterId, chapters],
            );
            const currentChapter = chapters[currentChapterIndex];
            // chapters are sorted from latest to oldest
            const previousChapter = useMemo(() => chapters[currentChapterIndex + 1], [currentChapterIndex, chapters]);
            const nextChapter = useMemo(() => chapters[currentChapterIndex - 1], [currentChapterIndex, chapters]);

            return {
                currentChapterName: currentChapter?.name,
                currentChapterScanlator: currentChapter?.scanlator,
                previousChapterName: previousChapter?.name,
                previousChapterScanlator: previousChapter?.scanlator,
                nextChapterName: nextChapter?.name,
                nextChapterScanlator: nextChapter?.scanlator,
            };
        },
        useNavBarContext,
        ({ chapterId, type }: Pick<ComponentProps<typeof BaseReaderTransitionPage>, 'chapterId' | 'type'>) => {
            const handleBack = useBackButton();
            const chapters = useReaderChaptersStore('chapters');

            const currentChapterIndex = useMemo(
                () => chapters.findIndex((chapter) => chapter.id === chapterId),
                [chapterId, chapters],
            );

            // chapters are sorted from latest to oldest
            const isLastChapter = currentChapterIndex === 0;
            const isFirstChapter = currentChapterIndex === chapters.length - 1;

            const handleBackFirstChapter = type === ReaderTransitionPageMode.PREVIOUS && isFirstChapter;
            const handleBackLastChapter = type === ReaderTransitionPageMode.NEXT && isLastChapter;

            const needsToHandleBack = handleBackFirstChapter || handleBackLastChapter;

            return {
                handleBack: needsToHandleBack ? handleBack : noOp,
            };
        },
    ],
    [
        'currentChapterName',
        'currentChapterScanlator',
        'previousChapterName',
        'previousChapterScanlator',
        'nextChapterName',
        'nextChapterScanlator',
        'readerNavBarWidth',
        'handleBack',
    ],
);
