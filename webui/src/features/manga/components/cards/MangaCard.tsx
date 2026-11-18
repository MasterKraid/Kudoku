/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import PopupState, { bindMenu } from 'material-ui-popup-state';
import { memo, useCallback, useMemo } from 'react';
import type { SingleModeProps } from '@/features/manga/components/MangaActionMenuItems.tsx';
import { MangaActionMenuItems } from '@/features/manga/components/MangaActionMenuItems.tsx';
import { Menu } from '@/base/components/menu/Menu.tsx';
import { useManageMangaLibraryState } from '@/features/manga/hooks/useManageMangaLibraryState.tsx';
import { MangaGridCard } from '@/features/manga/components/cards/MangaGridCard.tsx';
import { MangaListCard } from '@/features/manga/components/cards/MangaListCard.tsx';
import type { MangaCardMode, MangaCardProps, MangaSourceNameInfo } from '@/features/manga/Manga.types.ts';
import { ContinueReadingButton } from '@/features/manga/components/ContinueReadingButton.tsx';
import { MangaBadges } from '@/features/manga/components/MangaBadges.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { GridLayout } from '@/base/Base.types.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { t } from '@lingui/core/macro';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ReactRouter } from '@/lib/react-router/ReactRouter.ts';
import { MigrationOptionsDialog } from '@/features/migration/components/MigrationOptionsDialog.tsx';
import { AwaitableComponent } from 'awaitable-component';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler';
import { MangaMigration } from '@/features/migration/MangaMigration.ts';
import { MANGA_ACTION_TO_TRANSLATION } from '@/features/manga/Manga.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { assertIsDefined } from '@/base/Asserts.ts';
import { usePress } from '@/base/hooks/usePress.ts';
import { Confirmation } from '@/base/AppAwaitableComponent.ts';
import type { RouteStateSourceBrowse } from '@/features/source/Source.types.ts';
import type { RouteStateSourcesSearchAll } from '@/features/global-search/SearchAll.types.ts';
import { SubpathUtil } from '@/lib/utils/SubpathUtil.ts';
import { Sources } from '@/features/source/services/Sources.ts';

const getMangaLinkTo = (mode: MangaCardMode, mangaId: number): string => {
    switch (mode) {
        case 'default':
        case 'source':
        case 'duplicate':
        case 'migrate.select.single':
        case 'migrate.select.bulk':
            return AppRoutes.manga.path(mangaId);
        default:
            throw new Error(`getMangaLinkTo: unexpected MangaCardMode "${mode}"`);
    }
};

export const MangaCard = memo((props: MangaCardProps) => {
    const {
        manga,
        gridLayout,
        inLibraryIndicator,
        selected,
        handleSelection,
        mode = 'default',
        onMigrateSelect,
    } = props;
    const { id, firstUnreadChapter, downloadCount, unreadCount } = manga;

    const peekChapterCount = useCallback(async () => {
        const { data } = await requestManager.refreshManga(id, { fetchManga: false, fetchChapters: true }).response;
        return data?.fetchMangaAndChapters?.chapters?.length ?? 0;
    }, [id]);

    const { mangaId: mangaIdAsString } = useParams<{ mangaId?: string }>();
    const [searchParams] = useSearchParams();
    const searchParamMangaId = searchParams.get('mangaId');
    const location = useLocation<RouteStateSourceBrowse | RouteStateSourcesSearchAll>();
    const stateMangaId =
        location.state && 'mangaId' in location.state && location.state.mangaId != null
            ? location.state.mangaId
            : undefined;
    const rawMangaId = props.migrationSourceMangaId ?? mangaIdAsString ?? stateMangaId ?? searchParamMangaId;
    const migrationSourceMangaId = rawMangaId != null && !Number.isNaN(Number(rawMangaId)) ? Number(rawMangaId) : NaN;

    const {
        settings: { showContinueReadingButton },
    } = useMetadataServerSettings();

    const { updateLibraryState, isInLibrary } = useManageMangaLibraryState(manga, mode === 'source');

    const mangaLinkTo = getMangaLinkTo(mode, manga.id);

    const handleClick = useCallback(
        (event: React.MouseEvent | React.TouchEvent, openMenu?: () => void) => {
            const isDefaultMode = mode === 'default';
            const isSourceMode = mode === 'source';
            const isMigrationSelectSingleMode = mode === 'migrate.select.single';
            const isMigrationSelectBulkMode = mode === 'migrate.select.bulk';
            const isMigrateSelectMode = isMigrationSelectSingleMode || isMigrationSelectBulkMode;
            const isSelectionMode = selected !== null;
            const isLongPress = !!openMenu;

            const shouldHandleClick =
                isMigrateSelectMode || isSelectionMode || ((isDefaultMode || isSourceMode) && isLongPress);
            if (!shouldHandleClick) {
                return;
            }

            event.preventDefault();

            if (isSourceMode) {
                updateLibraryState();
                return;
            }

            if (isSelectionMode) {
                handleSelection?.(id, !selected, { selectRange: event.shiftKey });
                return;
            }

            if (isDefaultMode) {
                openMenu?.();
                return;
            }

            if (isMigrateSelectMode) {
                if (isMigrationSelectBulkMode) {
                    Confirmation.show({
                        title: t`Bulk migration manual search`,
                        message: `Select "${manga.title}" as the migration destination?`,
                        actions: {
                            confirm: {
                                title: t`Select`,
                            },
                            extra: {
                                show: true,
                                title: t`Show entry`,
                                link: AppRoutes.manga.path(id),
                            },
                            autoFocus: 'extra',
                        },
                    }).then(() => {
                        assertIsDefined(onMigrateSelect);
                        onMigrateSelect({ ...manga, missingChapters: undefined });
                    });
                    return;
                }

                const migrate = () => {
                    const targetMangaId = Number(id);
                    if (Number.isNaN(targetMangaId) || !targetMangaId) {
                        makeToast(t`Failed to determine target manga for migration`, 'error');
                        return;
                    }

                    if (Number.isNaN(migrationSourceMangaId) || !migrationSourceMangaId) {
                        makeToast(t`Failed to determine source manga for migration`, 'error');
                        return;
                    }

                    const optionsDialog = AwaitableComponent.showControlled(
                        MigrationOptionsDialog,
                        {
                            mangaIdToMigrateTo: targetMangaId,
                            isMigrating: false,
                            startMigration: async (options) => {
                                makeToast(t`Migrating manga…`, 'info');

                                optionsDialog.update({ isMigrating: true });

                                try {
                                    await MangaMigration.migrateByIdWithFetch(
                                        migrationSourceMangaId,
                                        targetMangaId,
                                        options,
                                    );
                                    optionsDialog.submit(options);
                                    ReactRouter.navigate(AppRoutes.manga.path(targetMangaId), { replace: true });
                                } catch (e) {
                                    makeToast(
                                        t(MANGA_ACTION_TO_TRANSLATION['migrate'].error),
                                        'error',
                                        getErrorMessage(e),
                                    );
                                    optionsDialog.update({ isMigrating: false, startMigration: () => migrate() });
                                }
                            },
                        },
                        { id: `manga-migration-single-manga-${migrationSourceMangaId}-${targetMangaId}` },
                    );
                    optionsDialog.promise.catch(defaultPromiseErrorHandler('MangaCard::migrate'));
                };
                migrate();
            }
        },
        [mode, selected, updateLibraryState, handleSelection, migrationSourceMangaId],
    );

    const longPressBind = usePress({
        onLongPress: useCallback(
            (e: any, { context }: any) => {
                // oxlint-disable-next-line no-param-reassign
                e.shiftKey = true;
                handleClick(e, context as () => void);
            },
            [handleClick],
        ),
        onPress: handleClick,
    });

    const handleAuxClick = useCallback(
        (event: React.MouseEvent) => {
            if (event.button === 1) {
                event.preventDefault();
                window.open(`${SubpathUtil.getSubpath()}${mangaLinkTo}`, '_blank');
            }
        },
        [mangaLinkTo],
    );

    const MangaCardComponent = useMemo(
        () => (gridLayout === GridLayout.List ? MangaListCard : MangaGridCard),
        [gridLayout],
    );

    return (
        <PopupState variant="popover" popupId="manga-card-action-menu">
            {(popupState) => (
                <>
                    <MangaCardComponent
                        {...props}
                        longPressBind={longPressBind}
                        popupState={popupState}
                        mangaLinkTo={mangaLinkTo}
                        onAuxClick={handleAuxClick}
                        isInLibrary={isInLibrary}
                        inLibraryIndicator={inLibraryIndicator}
                        continueReadingButton={
                            <ContinueReadingButton
                                showContinueReadingButton={showContinueReadingButton && mode === 'default'}
                                chapter={firstUnreadChapter}
                                mangaLinkTo={mangaLinkTo}
                            />
                        }
                        mangaBadges={
                            <MangaBadges
                                inLibraryIndicator={inLibraryIndicator}
                                isInLibrary={isInLibrary}
                                unread={unreadCount}
                                downloadCount={downloadCount}
                                chapterCount={manga.chapters?.totalCount}
                                onPeekChapterCount={mode === 'source' ? peekChapterCount : undefined}
                                status={manga.status}
                                // "null" (not undefined): the source could not be found, which is only known if it was requested
                                isSourceMissing={mode === 'default' && (manga as MangaSourceNameInfo).source === null}
                                updateLibraryState={updateLibraryState}
                                mode={mode}
                                mangaTitle={manga.title}
                                isLocalSource={manga.sourceId === Sources.LOCAL_SOURCE_ID}
                            />
                        }
                    />
                    {!!handleSelection && popupState.isOpen && (
                        <Menu {...bindMenu(popupState)}>
                            {(onClose, setHideMenu) => (
                                <MangaActionMenuItems
                                    manga={manga as SingleModeProps['manga']}
                                    handleSelection={handleSelection}
                                    onClose={onClose}
                                    setHideMenu={setHideMenu}
                                />
                            )}
                        </Menu>
                    )}
                </>
            )}
        </PopupState>
    );
});
