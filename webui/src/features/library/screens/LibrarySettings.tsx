/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import { CARD_LIST_SX } from '@/base/components/lists/cardListSx.ts';
import { ListSubheader } from '@/base/components/lists/ListSubheader.tsx';
import { useLingui } from '@lingui/react/macro';
import { msg, plural, t as translate } from '@lingui/core/macro';
import { GlobalUpdateSettings } from '@/features/settings/components/globalUpdate/GlobalUpdateSettings.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Mangas } from '@/features/manga/services/Mangas.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import type {
    GetCategoriesSettingsQuery,
    GetCategoriesSettingsQueryVariables,
    GetMangasBaseQuery,
    GetMangasBaseQueryVariables,
} from '@/lib/graphql/generated/graphql.ts';
import { GET_CATEGORIES_SETTINGS } from '@/lib/graphql/category/CategoryQuery.ts';
import { GET_MANGAS_BASE } from '@/lib/graphql/manga/MangaQuery.ts';
import type { MetadataLibrarySettings } from '@/features/library/Library.types.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { LIBRARY_SORT_OPTIONS } from '@/features/library/Library.constants.ts';
import { batchUpdateCategoryMetadata } from '@/features/category/services/CategoryMetadata.ts';

const removeNonLibraryMangasFromCategories = async (): Promise<void> => {
    try {
        const nonLibraryMangas = await requestManager.getMangas<GetMangasBaseQuery, GetMangasBaseQueryVariables>(
            GET_MANGAS_BASE,
            {
                filter: { inLibrary: { equalTo: false }, categoryId: { isNull: false } },
            },
            { fetchPolicy: 'no-cache' },
        ).response;

        if (!nonLibraryMangas.data) {
            return;
        }

        const mangaIdsToRemove = Mangas.getIds(nonLibraryMangas.data.mangas.nodes);

        if (mangaIdsToRemove.length) {
            await requestManager.updateMangasCategories(mangaIdsToRemove, {
                clearCategories: true,
            }).response;
        }
        makeToast(translate`Removed non library manga from categories`, 'success');
    } catch (e) {
        makeToast(translate`Could not remove non library manga from categories`, 'error', getErrorMessage(e));
    }
};

export function LibrarySettings() {
    const { t } = useLingui();

    useAppTitle(t`Library`);

    const [isSortDialogOpen, setIsSortDialogOpen] = useState(false);

    const categories = requestManager.useGetCategories<GetCategoriesSettingsQuery, GetCategoriesSettingsQueryVariables>(
        GET_CATEGORIES_SETTINGS,
    );
    const serverSettings = requestManager.useGetServerSettings();
    const {
        settings,
        loading: areMetadataServerSettingsLoading,
        request: { error: metadataServerSettingsError, refetch: refetchMetadataServerSettings },
    } = useMetadataServerSettings();

    const setSettingValue = createUpdateMetadataServerSettings<keyof MetadataLibrarySettings>((e) =>
        makeToast(t`Could not save the default search settings to the server`, 'error', getErrorMessage(e)),
    );

    const categoryCount = categories.data?.categories.nodes.length ?? 0;

    const loading = serverSettings.loading || areMetadataServerSettingsLoading || categories.loading;
    if (loading) {
        return <LoadingPlaceholder />;
    }

    const error = serverSettings.error ?? metadataServerSettingsError ?? categories.error;
    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t`Unable to load data`}
                messageExtra={getErrorMessage(error)}
                retry={() => {
                    if (serverSettings.error) {
                        serverSettings
                            ?.refetch()
                            .catch(defaultPromiseErrorHandler('LibrarySettings::refetchServerSettings'));
                    }

                    if (metadataServerSettingsError) {
                        refetchMetadataServerSettings().catch(
                            defaultPromiseErrorHandler('LibrarySettings::refetchMetadataServerSettings'),
                        );
                    }

                    if (categories.error) {
                        categories.refetch().catch(defaultPromiseErrorHandler('LibrarySettings::refetchCategories'));
                    }
                }}
            />
        );
    }

    return (
        <>
            <List sx={CARD_LIST_SX}>
            <List
                subheader={
                    <ListSubheader component="div" id="library-category-settings">
                        {t`Categories`}
                    </ListSubheader>
                }
            >
                <ListItemLink to={AppRoutes.settings.children.categories.path}>
                    <ListItemText
                        primary={t`Edit categories`}
                        secondary={plural(categoryCount, {
                            one: '# category',
                            other: '# categories',
                        })}
                    />
                </ListItemLink>
                <ListItem>
                    <ListItemText
                        primary={t`Category selection dialog`}
                        secondary={t`Show the category selection dialog when adding a manga to the library`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.showAddToLibraryCategorySelectDialog}
                        onChange={(e) => setSettingValue('showAddToLibraryCategorySelectDialog', e.target.checked)}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`Forget manga categories`}
                        secondary={t`Remove manga from categories when removing them from the library`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.removeMangaFromCategories}
                        onChange={(e) => setSettingValue('removeMangaFromCategories', e.target.checked)}
                    />
                </ListItem>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="library-sorting-settings">
                        {t`Default sorting`}
                    </ListSubheader>
                }
            >
                <ListItemButton onClick={() => setIsSortDialogOpen(true)}>
                    <ListItemText
                        primary={t`Default sort rule`}
                        secondary={
                            t(
                                LIBRARY_SORT_OPTIONS.find(
                                    ([mode]) => mode === (settings.defaultSortBy ?? 'alphabetically'),
                                )?.[1] ?? msg`A—Z`,
                            )
                        }
                    />
                </ListItemButton>
                <ListItem>
                    <ListItemText
                        primary={t`Sort descending`}
                        secondary={t`Reverse the sorting order across categories by default`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.defaultSortDesc ?? false}
                        onChange={(e) => setSettingValue('defaultSortDesc', e.target.checked)}
                    />
                </ListItem>
                <ListItemButton
                    onClick={async () => {
                        try {
                            const allCategories = categories.data?.categories.nodes ?? [];
                            if (allCategories.length) {
                                await batchUpdateCategoryMetadata([
                                    {
                                        categories: allCategories,
                                        delete: ['sortBy', 'sortDesc'],
                                    },
                                ]);
                            }
                            makeToast(t`Applied default sort rule to all categories`, 'success');
                        } catch (e) {
                            makeToast(t`Failed to reset category sort rules`, 'error', getErrorMessage(e));
                        }
                    }}
                >
                    <ListItemText
                        primary={t`Apply default sort to all categories`}
                        secondary={t`Clears category-specific sort overrides so all categories use the default sort rule`}
                    />
                </ListItemButton>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="library-general-settings">
                        {t`General`}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t`Ignore filters when searching`}
                        secondary={t`Search results will include manga that do not match the current filters`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.ignoreFilters}
                        onChange={(e) => setSettingValue('ignoreFilters', e.target.checked)}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`Fuzzy search`}
                        secondary={t`Match the library search even with typos or words in a different order, and show the closest matches first`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.fuzzySearch}
                        onChange={(e) => setSettingValue('fuzzySearch', e.target.checked)}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`Separate scroll buttons`}
                        secondary={t`Show a button for the top and one for the bottom of the library, instead of one that switches`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.splitScrollButtons}
                        onChange={(e) => setSettingValue('splitScrollButtons', e.target.checked)}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`Swipe between categories`}
                        secondary={t`On touch screens, swiping the library sideways moves to the next or previous category`}
                    />
                    <Switch
                        edge="end"
                        checked={settings.swipeBetweenCategories}
                        onChange={(e) => setSettingValue('swipeBetweenCategories', e.target.checked)}
                    />
                </ListItem>
            </List>
            <GlobalUpdateSettings
                serverSettings={serverSettings.data!.settings}
                categories={categories.data!.categories.nodes}
            />
            <List
                subheader={
                    <ListSubheader component="div" id="library-advanced">
                        {t`Advanced`}
                    </ListSubheader>
                }
            >
                <ListItemButton onClick={() => removeNonLibraryMangasFromCategories()}>
                    <ListItemText
                        primary={t`Cleanup database`}
                        secondary={t`Remove non library manga from categories`}
                    />
                </ListItemButton>
                <ListItemLink to={AppRoutes.settings.children.library.children.share.path}>
                    <ListItemText
                        primary={t`Share library`}
                        secondary={t`Send your library or some categories to another account`}
                    />
                </ListItemLink>
                <ListItemLink to={AppRoutes.settings.children.library.children.duplicates.path}>
                    <ListItemText
                        primary={t`Duplicated entries`}
                        secondary={t`Show all duplicated entries in your library`}
                    />
                </ListItemLink>
            </List>
        </List>
        <Dialog open={isSortDialogOpen} onClose={() => setIsSortDialogOpen(false)}>
            <DialogTitle>{t`Default sort rule`}</DialogTitle>
            <DialogContent sx={{ p: 0 }}>
                <List>
                    {LIBRARY_SORT_OPTIONS.map(([mode, label]) => (
                        <ListItemButton
                            key={mode}
                            selected={(settings.defaultSortBy ?? 'alphabetically') === mode}
                            onClick={() => {
                                setSettingValue('defaultSortBy', mode);
                                setIsSortDialogOpen(false);
                            }}
                        >
                            <ListItemText primary={t(label)} />
                        </ListItemButton>
                    ))}
                </List>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setIsSortDialogOpen(false)}>{t`Cancel`}</Button>
            </DialogActions>
        </Dialog>
        </>
    );
}
