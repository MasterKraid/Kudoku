/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import { CARD_LIST_SX } from '@/base/components/lists/cardListSx.ts';
import { LocalFileSystem, type LocalChapterItem } from '@/features/local-repository/services/LocalFileSystem.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';

interface OfflineMangaViewProps {
    mangaId: number;
    title: string;
    coverUrl?: string;
    chapters: LocalChapterItem[];
    onUpdated?: () => void;
}

export const OfflineMangaView: React.FC<OfflineMangaViewProps> = ({
    mangaId,
    title,
    coverUrl,
    chapters,
    onUpdated,
}) => {
    const { t } = useLingui();
    const navigate = useNavigate();
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
    const [chapterToDelete, setChapterToDelete] = useState<LocalChapterItem | null>(null);

    const handleDeleteAll = async () => {
        await LocalFileSystem.deleteMangaCbz(title);
        setConfirmDeleteAll(false);
        makeToast(t`Deleted offline manga and chapters`, 'info');
        navigate(AppRoutes.browse.path, { replace: true });
    };

    const handleDeleteChapter = async (ch: LocalChapterItem) => {
        await LocalFileSystem.deleteChapterCbz(title, ch.name);
        setChapterToDelete(null);
        makeToast(t`Deleted chapter: ${ch.name}`, 'info');
        onUpdated?.();
    };

    const handleReadChapter = (ch: LocalChapterItem) => {
        const orderOrNum = ch.chapterNumber || 1;
        navigate(AppRoutes.manga.children.chapter.path(mangaId, orderOrNum));
    };

    return (
        <Box sx={{ display: { md: 'flex' }, p: { xs: 2, md: 3 }, gap: 4, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
            {/* Left Column: Cover & Metadata */}
            <Box sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0, mb: { xs: 3, md: 0 } }}>
                <Stack spacing={2} alignItems={{ xs: 'center', md: 'flex-start' }}>
                    <Button
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate(-1)}
                        variant="text"
                        color="inherit"
                        size="small"
                        sx={{ alignSelf: 'flex-start' }}
                    >
                        {t`Back`}
                    </Button>

                    <Box
                        sx={{
                            width: 200,
                            height: 280,
                            borderRadius: 2,
                            overflow: 'hidden',
                            boxShadow: 3,
                            bgcolor: 'background.paper',
                        }}
                    >
                        <SpinnerImage
                            src={coverUrl ?? ''}
                            alt={title}
                            imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            spinnerStyle={{ width: '100%', height: '100%' }}
                        />
                    </Box>

                    <Typography variant="h5" fontWeight={700} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        {title}
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip label={t`Local / Offline`} color="primary" size="small" />
                        <Chip label={t`${chapters.length} chapters`} size="small" variant="outlined" />
                    </Stack>

                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        {t`This manga is stored offline on this device and can be read without a server connection.`}
                    </Typography>

                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => setConfirmDeleteAll(true)}
                        fullWidth
                    >
                        {t`Delete Offline Manga`}
                    </Button>
                </Stack>
            </Box>

            {/* Right Column: Downloaded Chapters List */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                    {t`Downloaded Chapters`}
                </Typography>

                <List sx={CARD_LIST_SX}>
                    {chapters.map((ch) => (
                        <ListItem
                            key={ch.name}
                            disablePadding
                            secondaryAction={
                                <IconButton
                                    edge="end"
                                    aria-label="delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setChapterToDelete(ch);
                                    }}
                                    size="small"
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            }
                        >
                            <ListItemButton onClick={() => handleReadChapter(ch)}>
                                <ListItemText
                                    primary={ch.name}
                                    secondary={
                                        <Chip
                                            label={t`Downloaded`}
                                            color="success"
                                            size="small"
                                            variant="outlined"
                                            sx={{ height: 20, fontSize: '0.7rem', mt: 0.5 }}
                                        />
                                    }
                                />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Box>

            {/* Confirmation Dialog for Delete All */}
            <Dialog open={confirmDeleteAll} onClose={() => setConfirmDeleteAll(false)} maxWidth="xs">
                <DialogTitle>{t`Delete Manga?`}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t`Are you sure you want to delete all offline chapters for "${title}" from this device?`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDeleteAll(false)} color="inherit">
                        {t`Cancel`}
                    </Button>
                    <Button onClick={handleDeleteAll} color="error" variant="contained">
                        {t`Delete All`}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation Dialog for Delete Chapter */}
            <Dialog open={!!chapterToDelete} onClose={() => setChapterToDelete(null)} maxWidth="xs">
                <DialogTitle>{t`Delete Chapter?`}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t`Are you sure you want to delete "${chapterToDelete?.name}" from this device?`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setChapterToDelete(null)} color="inherit">
                        {t`Cancel`}
                    </Button>
                    <Button
                        onClick={() => chapterToDelete && handleDeleteChapter(chapterToDelete)}
                        color="error"
                        variant="contained"
                    >
                        {t`Delete`}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
