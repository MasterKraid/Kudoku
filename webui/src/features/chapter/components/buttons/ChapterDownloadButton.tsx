/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import IconButton from '@mui/material/IconButton';
import DownloadIcon from '@mui/icons-material/Download';
import { useLingui } from '@lingui/react/macro';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { Chapters } from '@/features/chapter/services/Chapters.ts';
import { useClientDownloadStore } from '@/features/download-manager/services/ClientDownloadManager.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';
import type { ChapterIdInfo } from '@/features/chapter/Chapter.types.ts';

export const ChapterDownloadButton = ({
    chapterId,
    isDownloaded,
}: {
    chapterId: ChapterIdInfo['id'];
    isDownloaded: boolean;
}) => {
    const { t } = useLingui();
    const download = Chapters.useDownloadStatusFromCache(chapterId);

    const isClientActive = useClientDownloadStore((state) =>
        state.queue.some(
            (entry) =>
                entry.chapterId === chapterId && entry.status !== 'error' && entry.status !== 'cancelled',
        ),
    );

    const isAlreadyDownloaded = Chapters.isDownloaded({ isDownloaded, id: chapterId });

    const downloadChapter = () => {
        Chapters.downloadChapters([chapterId]).catch((e) =>
            makeToast(t`Failed to save changes`, 'error', getErrorMessage(e)),
        );
    };

    if (download != null || isAlreadyDownloaded || isClientActive) {
        return null;
    }

    return (
        <CustomTooltip title={t`Download`}>
            <IconButton
                {...MUIUtil.preventRippleProp()}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    downloadChapter();
                }}
            >
                <DownloadIcon />
            </IconButton>
        </CustomTooltip>
    );
};
