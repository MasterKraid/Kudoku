/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { ListSubheader } from '@/base/components/lists/ListSubheader.tsx';
import Divider from '@mui/material/Divider';
import { useLingui } from '@lingui/react/macro';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { CARD_LIST_SX } from '@/base/components/lists/cardListSx.ts';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { UpdateState } from '@/lib/graphql/generated/graphql-base.types.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { VersionInfo } from '@/features/app-updates/components/VersionInfo.tsx';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { epochToDate } from '@/base/utils/DateHelper.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { DebugInformation } from '@/features/settings/components/DebugInformation.tsx';
import Stack from '@mui/material/Stack';

export function About() {
    const { t } = useLingui();

    useAppTitle(t`About`);

    const { data, loading, error, refetch } = requestManager.useGetAbout();

    const {
        data: serverUpdateCheckData,
        loading: isCheckingForServerUpdate,
        refetch: checkForServerUpdate,
        error: serverUpdateCheckError,
    } = requestManager.useCheckForServerUpdate();
    const {
        data: webUIUpdateData,
        loading: isCheckingForWebUIUpdate,
        refetch: checkForWebUIUpdate,
        error: orgWebUIUpdateCheckError,
    } = requestManager.useCheckForWebUIUpdate();
    const webUIUpdateCheckError = orgWebUIUpdateCheckError || webUIUpdateData?.checkForWebUIUpdate.tag === '';

    const { data: webUIUpdateStatusData } = requestManager.useGetWebUIUpdateStatus();
    const { state: webUIUpdateState, progress: webUIUpdateProgress } = webUIUpdateStatusData?.getWebUIUpdateStatus ?? {
        state: UpdateState.Idle,
        progress: 0,
    };

    if (loading && !data) {
        return <LoadingPlaceholder />;
    }

    const { aboutServer, aboutWebUI } = data ?? {
        aboutServer: {
            name: 'Kudoku Server',
            version: 'v1.3.0-kudoku',
            revision: '1',
            buildType: 'STABLE',
            buildTime: Date.now(),
            github: 'https://github.com/MasterKraid/Kudoku',
            discord: '',
            isDocker: true,
        },
        aboutWebUI: {
            channel: 'STABLE',
            tag: 'v1.3.0-kudoku',
            updateTimestamp: Date.now(),
        },
    };
    const selectedServerChannelInfo = serverUpdateCheckData?.checkForServerUpdates?.find(
        (channel) => channel.channel === aboutServer.buildType,
    );
    const isServerUpdateAvailable =
        !!selectedServerChannelInfo?.tag && selectedServerChannelInfo.tag !== aboutServer.version;
    const isWebUIUpdateAvailable = !!webUIUpdateData?.checkForWebUIUpdate.updateAvailable;

    return (
        <List sx={CARD_LIST_SX}>
            <List
                sx={{ padding: 0 }}
                subheader={
                    <ListSubheader component="div" id="about-app-info">
                        Kudoku
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary="Application" secondary="Kudoku" />
                </ListItem>
                <ListItem>
                    <ListItemText primary="Author" secondary="Kraid" />
                </ListItem>
            </List>
            <Divider />
            <List
                sx={{ padding: 0 }}
                subheader={
                    <ListSubheader component="div" id="about-server-info">
                        {t`Server`}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary={t`Server`} secondary={`Kudoku Server (${aboutServer.buildType})`} />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`Server version`}
                        // VersionInfo renders block elements, which are invalid inside the default <p>
                        slotProps={{ secondary: { component: 'div' } }}
                        secondary={
                            <VersionInfo
                                version={aboutServer.version}
                                isCheckingForUpdate={isCheckingForServerUpdate}
                                isUpdateAvailable={isServerUpdateAvailable}
                                updateCheckError={serverUpdateCheckError}
                                checkForUpdate={checkForServerUpdate}
                                downloadAsLink
                                // a container is updated by pulling the new image, not by downloading a jar
                                url={aboutServer.isDocker ? '' : (selectedServerChannelInfo?.url ?? '')}
                                disableAction={aboutServer.isDocker}
                            />
                        }
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`Build time`}
                        secondary={epochToDate(Number(aboutServer.buildTime)).toDate().toLocaleString()}
                    />
                </ListItem>
            </List>
            <Divider />
            <List
                sx={{ padding: 0 }}
                subheader={
                    <ListSubheader component="div" id="about-webui-info">
                        {t`WebUI`}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary={t`WebUI channel`} secondary={aboutWebUI.channel.toLocaleUpperCase()} />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t`WebUI version`}
                        // VersionInfo renders block elements, which are invalid inside the default <p>
                        slotProps={{ secondary: { component: 'div' } }}
                        secondary={
                            <VersionInfo
                                version={aboutWebUI.tag}
                                isCheckingForUpdate={isCheckingForWebUIUpdate}
                                isUpdateAvailable={isWebUIUpdateAvailable}
                                updateCheckError={webUIUpdateCheckError}
                                checkForUpdate={checkForWebUIUpdate}
                                triggerUpdate={() =>
                                    requestManager
                                        .updateWebUI()
                                        .response.catch(defaultPromiseErrorHandler('About::updateWebUI'))
                                }
                                progress={webUIUpdateProgress}
                                updateState={webUIUpdateState}
                            />
                        }
                    />
                </ListItem>
            </List>
            <Divider />
            <List
                subheader={
                    <ListSubheader component="div" id="about-links">
                        Attribution & Parent Projects
                    </ListSubheader>
                }
            >
                <ListItemLink to="https://github.com/jt-ito/tsundoku" target="_blank" rel="noreferrer">
                    <ListItemText primary="Tsundoku (Parent Project)" secondary="https://github.com/jt-ito/tsundoku" />
                </ListItemLink>
                <ListItemLink to="https://github.com/suwayomi/tachidesk-server" target="_blank" rel="noreferrer">
                    <ListItemText primary="Suwayomi-Server (Upstream)" secondary="https://github.com/suwayomi/tachidesk-server" />
                </ListItemLink>
                <ListItemLink to="https://github.com/suwayomi/tachidesk-webui" target="_blank" rel="noreferrer">
                    <ListItemText primary="Suwayomi-WebUI (Upstream)" secondary="https://github.com/suwayomi/tachidesk-webui" />
                </ListItemLink>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="about-webui-info">
                        {t`Debug information`}
                    </ListSubheader>
                }
            >
                <Stack sx={{ px: 2, py: 1 }}>
                    <DebugInformation />
                </Stack>
            </List>
        </List>
    );
}
