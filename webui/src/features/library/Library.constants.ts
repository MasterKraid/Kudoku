/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { LibrarySortMode } from '@/features/library/Library.types.ts';

export const LIBRARY_SORT_OPTIONS: [LibrarySortMode, MessageDescriptor][] = [
    ['unreadChapters', msg`Unread chapters`],
    ['totalChapters', msg`Total chapters`],
    ['alphabetically', msg`A—Z`],
    ['dateAdded', msg`Recently added`],
    ['lastRead', msg`Recently read`],
    ['latestFetchedChapter', msg`Latest fetched chapter`],
    ['latestUploadedChapter', msg`Latest uploaded chapter`],
    ['random', msg`Random`],
];
