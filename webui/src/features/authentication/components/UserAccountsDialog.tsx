/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import ListItemButton from '@mui/material/ListItemButton';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteIcon from '@mui/icons-material/Delete';
import { useLingui } from '@lingui/react/macro';
import { PasswordTextField } from '@/base/components/inputs/PasswordTextField.tsx';
import { Confirmation } from '@/base/AppAwaitableComponent.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { AuthManager } from '@/features/authentication/AuthManager.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { SubpathUtil } from '@/lib/utils/SubpathUtil.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import type { GetMeQuery } from '@/lib/graphql/generated/graphql.ts';

const ROLES = ['MEMBER', 'ADMIN'] as const;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;

const isValidCredentials = (username: string, password: string) =>
    USERNAME_REGEX.test(username.trim()) && password.length >= 4 && password.length <= 128;

const UserAvatar = ({ username, size = 40 }: { username: string; size?: number }) => (
    <Avatar sx={{ width: size, height: size, bgcolor: 'primary.main', fontWeight: 700 }}>
        {username.charAt(0).toUpperCase()}
    </Avatar>
);

const goToLibrary = () => {
    // drop everything that was loaded for the previous account, and start on the library instead of whatever page the
    // previous account was on
    window.location.assign(`${SubpathUtil.getSubpath()}${AppRoutes.library.path()}`);
};

/** The accounts that stay signed in on this device: one tap switches, no password. */
const SavedAccounts = ({ currentUserId, onDone }: { currentUserId: number; onDone: () => void }) => {
    const { t } = useLingui();
    AuthManager.useSession();

    const accounts = AuthManager.getSavedAccounts().filter((account) => account.userId !== currentUserId);

    if (!accounts.length) {
        return null;
    }

    return (
        <List dense sx={{ pt: 2 }}>
            {accounts.map((account) => (
                <ListItem
                    key={account.userId}
                    disablePadding
                    secondaryAction={
                        <IconButton
                            edge="end"
                            title={t`Remove from this device`}
                            onClick={() => {
                                // ends the session on the server, so the saved token is worthless afterwards
                                requestManager.logoutUser(account.refreshToken).response.catch(() => {});
                                AuthManager.forgetAccount(account.userId);
                            }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    }
                >
                    <ListItemButton
                        onClick={() => {
                            AuthManager.activateSavedAccount(account);
                            onDone();
                            goToLibrary();
                        }}
                    >
                        <ListItemAvatar>
                            <UserAvatar username={account.username} size={32} />
                        </ListItemAvatar>
                        <ListItemText primary={account.username} secondary={t`Tap to switch`} />
                    </ListItemButton>
                </ListItem>
            ))}
        </List>
    );
};

const SwitchAccount = ({ currentUserId, onDone }: { currentUserId: number; onDone: () => void }) => {
    const { t } = useLingui();
    const [loginUser, { loading }] = requestManager.useLoginUser();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [stayLoggedIn, setStayLoggedIn] = useState(true);

    const switchAccount = async () => {
        try {
            const { data } = await loginUser({ variables: { username: username.trim(), password } });
            if (!data) {
                return;
            }

            AuthManager.setTokens(data.login.accessToken, data.login.refreshToken, stayLoggedIn);
            onDone();
            goToLibrary();
        } catch (e) {
            makeToast(t`Could not log in to Kudoku`, 'error', getErrorMessage(e));
        }
    };

    return (
        <>
            <SavedAccounts currentUserId={currentUserId} onDone={onDone} />
            <Stack
                component="form"
                sx={{ gap: 2, pt: 2 }}
                onSubmit={(e) => {
                    e.preventDefault();
                    switchAccount();
                }}
            >
                <TextField
                    label={t`Username`}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    fullWidth
                />
                <PasswordTextField value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
                <FormControlLabel
                    label={t`Stay signed in on this device`}
                    control={<Checkbox checked={stayLoggedIn} onChange={(e) => setStayLoggedIn(e.target.checked)} />}
                />
                <Button type="submit" variant="contained" disabled={loading || !isValidCredentials(username, password)}>
                    {t`Add account`}
                </Button>
            </Stack>
        </>
    );
};

const ManageAccounts = ({ currentUserId }: { currentUserId: number }) => {
    const { t } = useLingui();
    const { data, refetch } = requestManager.useGetUsers();
    const [createUser, { loading: isCreating }] = requestManager.useCreateUser();
    const [deleteUser] = requestManager.useDeleteUser();

    const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<(typeof ROLES)[number]>('MEMBER');

    const users = data?.users ?? [];

    const create = async () => {
        try {
            await createUser({ variables: { username: username.trim(), password, role } });
            setUsername('');
            setPassword('');
            setIsCreateFormOpen(false);
            await refetch();
        } catch (e) {
            makeToast(t`Could not create the account`, 'error', getErrorMessage(e));
        }
    };

    const remove = async (user: (typeof users)[number]) => {
        await Confirmation.show({
            title: t`Are you sure?`,
            message: t`You are about to delete the account "${user.username}". Its personal library and reading progress will be removed permanently.`,
        });

        try {
            await deleteUser({ variables: { id: user.id } });
            await refetch();
        } catch (e) {
            makeToast(t`Could not delete the account`, 'error', getErrorMessage(e));
        }
    };

    return (
        <Stack sx={{ gap: 1, pt: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">{t`Accounts (${users.length})`}</Typography>
                <Button size="small" variant="outlined" onClick={() => setIsCreateFormOpen((open) => !open)}>
                    {t`New account`}
                </Button>
            </Stack>
            {isCreateFormOpen && (
                <Stack
                    component="form"
                    sx={{ gap: 2 }}
                    onSubmit={(e) => {
                        e.preventDefault();
                        create();
                    }}
                >
                    <TextField
                        label={t`Username`}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="off"
                        size="small"
                        fullWidth
                    />
                    <PasswordTextField
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        size="small"
                        fullWidth
                    />
                    <TextField
                        select
                        label={t`Role`}
                        value={role}
                        onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                        size="small"
                        fullWidth
                    >
                        {ROLES.map((roleOption) => (
                            <MenuItem key={roleOption} value={roleOption}>
                                {roleOption}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={isCreating || !isValidCredentials(username, password)}
                    >
                        {t`Create account`}
                    </Button>
                </Stack>
            )}
            <List disablePadding>
                {users.map((user) => (
                    <ListItem
                        key={user.id}
                        disableGutters
                        secondaryAction={
                            user.id !== 1 && user.id !== currentUserId ? (
                                <IconButton
                                    edge="end"
                                    aria-label={t`Delete account`}
                                    onClick={() => remove(user).catch(defaultPromiseErrorHandler('remove user'))}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            ) : undefined
                        }
                    >
                        <ListItemAvatar>
                            <UserAvatar username={user.username} size={32} />
                        </ListItemAvatar>
                        <ListItemText
                            primary={
                                <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                                    {user.username}
                                    {user.id === currentUserId && (
                                        <Chip size="small" color="success" label={t`Active`} />
                                    )}
                                </Stack>
                            }
                            secondary={`${user.role} • #${user.id}`}
                        />
                    </ListItem>
                ))}
            </List>
        </Stack>
    );
};

interface GitHubStatus {
    isLinked: boolean;
    githubUsername?: string;
    repoName?: string;
    repoUrl?: string;
    backupIntervalHours?: number;
    lastBackupAt?: number;
    autoBackupEnabled?: boolean;
}

const GitHubAccountSection = ({ currentUserId }: { currentUserId: number }) => {
    const [status, setStatus] = useState<GitHubStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchStatus = () => {
        setLoading(true);
        requestManager
            .getClient()
            .get('/api/v1/backup/github/status')
            .then(async (res) => {
                const data = await res.json();
                setStatus(data);
            })
            .catch((err) => {
                makeToast('Failed to load GitHub status', 'error', getErrorMessage(err));
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchStatus();
    }, [currentUserId]);

    const handleLink = async () => {
        if (!token.trim()) return;
        setSubmitting(true);
        try {
            const res = await requestManager.getClient().post('/api/v1/backup/github/link', { token: token.trim() });
            const data = await res.json();
            setStatus(data);
            setToken('');
            makeToast('GitHub account linked successfully! Backup repository initialized.', 'success');
        } catch (err: any) {
            makeToast('Failed to link GitHub', 'error', getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnlink = async () => {
        try {
            await Confirmation.show({
                title: 'Unlink GitHub Account',
                message: 'Are you sure you want to unlink your GitHub account from Kudoku backups?',
            });
        } catch {
            return;
        }

        setSubmitting(true);
        try {
            await requestManager.getClient().post('/api/v1/backup/github/unlink');
            setStatus({ isLinked: false });
            makeToast('GitHub account unlinked', 'info');
        } catch (err: any) {
            makeToast('Failed to unlink GitHub', 'error', getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Stack sx={{ py: 4, alignItems: 'center' }}>
                <CircularProgress size={32} />
            </Stack>
        );
    }

    if (status?.isLinked) {
        return (
            <Stack sx={{ pt: 2, gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                    Your account is linked to GitHub for automated backups.
                </Typography>
                <List disablePadding>
                    <ListItem disableGutters>
                        <ListItemAvatar>
                            <Avatar sx={{ bgcolor: 'secondary.main', fontWeight: 700 }}>GH</Avatar>
                        </ListItemAvatar>
                        <ListItemText
                            primary={`@${status.githubUsername}`}
                            secondary={
                                <Typography
                                    component="a"
                                    href={status.repoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="caption"
                                    sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                >
                                    {status.repoName}
                                </Typography>
                            }
                        />
                    </ListItem>
                </List>
                <Typography variant="caption" color="text.secondary">
                    Manage backup interval and synchronization in Settings &gt; Backup &gt; Github Backups.
                </Typography>
                <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={handleUnlink}
                    disabled={submitting}
                >
                    Unlink GitHub Account
                </Button>
            </Stack>
        );
    }

    return (
        <Stack sx={{ pt: 2, gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
                Link your GitHub Personal Access Token to enable automated backups into your own private repository.
            </Typography>
            <TextField
                label="GitHub Personal Access Token"
                placeholder="ghp_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={submitting}
                type="password"
                size="small"
                fullWidth
                helperText="Requires 'repo' scope to create private backup repository."
            />
            <Button
                variant="contained"
                onClick={handleLink}
                disabled={submitting || !token.trim()}
            >
                {submitting ? 'Linking...' : 'Link GitHub Account'}
            </Button>
        </Stack>
    );
};

export const UserAccountsDialog = ({
    user,
    open,
    onClose,
}: {
    user: NonNullable<GetMeQuery['me']>;
    open: boolean;
    onClose: () => void;
}) => {
    const { t } = useLingui();
    const { isAuthRequired, refreshToken } = AuthManager.useSession();
    const [tab, setTab] = useState<'switch' | 'manage' | 'github'>('switch');
    const isAdmin = user.role === 'ADMIN';
    // without a required login, there is nothing to sign out of, unless a personal account is in use
    const canSignOut = !!isAuthRequired || !!refreshToken;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{t`Accounts`}</DialogTitle>
            <DialogContent>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
                    <UserAvatar username={user.username} />
                    <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 600 }}>
                            {user.username}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {user.role} • #{user.id}
                        </Typography>
                    </Stack>
                    {canSignOut && (
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                                onClose();
                                // ends the session on the server first, so the refresh token is worthless afterwards
                                const refreshTokenToEnd = AuthManager.getRefreshToken();
                                if (refreshTokenToEnd) {
                                    requestManager.logoutUser(refreshTokenToEnd).response.catch(() => {});
                                }
                                // clears the tokens and all cached data, which brings up the login page (or, if the
                                // server does not require a login, the default account)
                                requestManager.reset();
                            }}
                        >
                            {t`Sign out`}
                        </Button>
                    )}
                </Stack>
                <Tabs value={tab} onChange={(_, newTab) => setTab(newTab)} variant="fullWidth" sx={{ mt: 2 }}>
                    <Tab value="switch" label={t`Switch account`} />
                    {isAdmin && <Tab value="manage" label={t`Manage accounts`} />}
                    <Tab value="github" label="GitHub" />
                </Tabs>
                {tab === 'manage' && isAdmin ? (
                    <ManageAccounts currentUserId={user.id} />
                ) : tab === 'github' ? (
                    <GitHubAccountSection currentUserId={user.id} />
                ) : (
                    <SwitchAccount currentUserId={user.id} onDone={onClose} />
                )}
            </DialogContent>
        </Dialog>
    );
};
