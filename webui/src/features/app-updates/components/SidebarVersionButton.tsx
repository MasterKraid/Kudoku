/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { alpha } from '@mui/material/styles';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';

/**
 * Always shows the server version at the bottom of the sidebar and links to the About page.
 * Turns green when a newer release exists (the periodic check runs in ServerUpdateChecker).
 * In Docker the update is a new image, so it only says so there.
 */
export const SidebarVersionButton = ({
    isCollapsed = false,
    inline = false,
}: {
    isCollapsed?: boolean;
    /** in a page (the mobile More tab) instead of at the bottom of the sidebar */
    inline?: boolean;
}) => {
    const { t } = useLingui();

    const { data } = requestManager.useGetAbout();
    const { data: updateData } = requestManager.useCheckForServerUpdate({ fetchPolicy: 'cache-only' });

    const about = data?.aboutServer;
    if (!about) {
        return null;
    }

    const label = `Version ${about.version}`;
    const title = about.version;
    const Icon = InfoOutlinedIcon;

    return (
        <ButtonBase
            component={Link}
            to={AppRoutes.about.path}
            aria-label={label}
            title={title}
            sx={(theme) => ({
                mx: inline ? 2 : 1,
                mt: inline ? 1 : 'auto',
                mb: inline ? 1 : 0,
                p: isCollapsed ? 1 : '6px 10px',
                gap: 1,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                textAlign: 'start',
                borderRadius: '10px',
                color: theme.palette.text.secondary,
                border: '1px solid transparent',
                backgroundColor: 'transparent',
                transition:
                    'background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 100ms cubic-bezier(0.2, 0, 0, 1)',
                '&:hover': {
                    backgroundColor: theme.palette.action.hover,
                },
                '&:active': { transform: 'scale(0.98)' },
            })}
        >
            <Icon fontSize="small" />
            {!isCollapsed && (
                <Stack sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: 'monospace' }}>
                        {label}
                    </Typography>
                </Stack>
            )}
        </ButtonBase>
    );
};
