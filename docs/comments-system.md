# Comments System

This document explains how inline comments work in the editor, including the UI flow for adding comments from text selection, thread/reply behavior, and the backing API/database model.

## Overview

The app implements first-party comments (no paid Tiptap comments extension dependency).

- Comment anchors are tied to text selections in the editor.
- Threads and comments are persisted in SQLite.
- The editor renders comment highlights with custom ProseMirror decorations.
- The right panel shows threads and replies.

## User Flow: Add a Comment

1. Select text in the editor.
2. The Tiptap bubble menu appears.
3. Click `Comment` in the bubble menu.
4. A floating composer opens near the selection with:
   - current user avatar and name
   - a compact rich-text Tiptap input
   - `Cancel` and `Send` actions
5. Click `Send` to create a new thread on that selection.
6. The thread appears in the comments panel and the selection gets highlighted.

## Thread UI Behavior

In the comments panel, each thread card includes:

- Header left: avatar, author label, and timestamp formatted with `date-fns`
- Header right: resolve checkbox, edit (pencil), and delete (trash) actions
- Body: initial thread comment content

When a thread is selected:

- Replies are shown inline under the main comment.
- Reply composer appears with current user avatar/name and rich-text input.
- `Add Reply` appends a comment to the selected thread.
- `Cmd/Ctrl+Enter` submits from the comment composer and reply composer.

## Show/Hide Comments Panel

A toggle next to the delete document button controls comments panel visibility.

- Toggle on: split layout with editor + comments panel
- Toggle off: editor takes full width

## Anchor Model

Each thread stores anchor metadata:

- `anchorFrom`, `anchorTo`: document offsets
- `anchorExact`: selected text
- `anchorPrefix`, `anchorSuffix`: nearby context text

Anchors are remapped as the document changes and synchronized via a debounced API call.

## Editor Integration

### Key files

- `src/components/tiptap/comment-anchors.ts`
  - Custom Tiptap extension for thread decorations and thread commands.
- `src/components/tiptap/bubble-menu.tsx`
  - Adds the `Comment` action for selected text.
- `src/components/tiptap/comment-composer-popover.tsx`
  - Floating composer shown near selected text.
- `src/components/tiptap/comments-panel.tsx`
  - Sidebar UI for threads, replies, resolve, and delete actions.
- `src/components/tiptap/comment-input-editor.tsx`
  - Compact Tiptap input used by both comment and reply composers (rich text, no toolbar menus).
- `src/components/tiptap/use-document-comments.ts`
  - Centralized comments orchestration hook (thread CRUD, anchor sync, selection/composer state).
- `src/components/tiptap/tiptap.tsx`
  - Renders the editor plus floating composer and comments panel when `commentsDocumentId` is provided.
- `src/components/documents/document-editor.tsx`
  - Handles document save behavior and passes comments configuration into TipTap.
- `src/components/documents/document-title-editor.tsx`
  - Contains the comments panel visibility toggle.

### Decoration classes

Thread highlights are styled with classes in `src/app/globals.css`:

- `.tiptap-thread`
- `.tiptap-thread--inline`
- `.tiptap-thread--hovered`
- `.tiptap-thread--selected`
- `.tiptap-thread--resolved`
- `.tiptap-thread--unresolved`

## API Endpoints

All endpoints are document-scoped and require authentication.

- `GET /api/documents/:id/threads`
  - Returns all threads/comments for a document.
- `POST /api/documents/:id/threads`
  - Creates a thread with initial comment and selection anchors.
- `PATCH /api/documents/:id/threads/anchors`
  - Bulk updates anchor positions/context after edits.
- `PATCH /api/documents/:id/threads/:threadId`
  - Updates thread state (currently resolve/reopen).
- `DELETE /api/documents/:id/threads/:threadId`
  - Deletes a thread (and its comments via cascade).
- `POST /api/documents/:id/threads/:threadId/comments`
  - Adds a reply comment.
- `PATCH /api/documents/:id/threads/:threadId/comments/:commentId`
  - Updates comment content.
- `DELETE /api/documents/:id/threads/:threadId/comments/:commentId`
  - Deletes a comment.

## Database Tables

Comments use two tables in `documents.db`:

- `comment_threads`
  - one row per thread with anchor and status metadata
- `comments`
  - one row per comment/reply linked to `comment_threads`

`comments.thread_id` has `ON DELETE CASCADE`, so deleting a thread removes its comments automatically.

## Current Scope

Implemented:

- Inline text-selection comments
- Thread create/list/resolve/delete
- Thread/reply edit
- Reply create/delete
- Rich-text comment and reply content entry
- Rich-text comment and reply rendering via read-only Tiptap instances
- Selection bubble-menu composer
- Sidebar thread UI with inline replies

Not yet implemented:

- Block/node-level comments
- Mentions and notifications
- Real-time multi-user updates
- Webhooks/outbox events

## Content Format

- Comment/reply bodies are stored as rich text HTML.
- Rich content is rendered in read-only Tiptap views in the comments panel.
- Empty rich-text content (for example, markup with no visible text) is rejected by client and server validation.

## Parity Notes vs Tiptap Paid Comments

Implemented in this custom version (currently aligned):

- Inline text-selection comment threads
- Create/list/update/delete threads
- Resolve/reopen threads
- Create/update/delete comments and replies
- Rich-text comment/reply input and rendering
- Thread highlighting, hover, and selection linkage between editor and sidebar
- Document-scoped REST endpoints for thread/comment CRUD

Not yet implemented (available in official paid extension ecosystem):

- Block/node/custom-node comment anchors and full multi-node wrapping support
- Document-level and sidebar-only comment modes
- Provider-backed realtime thread subscriptions/watchers and offline sync behavior
- Mention workflows and mention-triggered notifications
- Webhook event pipeline for thread/comment lifecycle events
- Soft-delete/archived thread model and archived/unarchived filtering
- Full official editor command surface and metadata model parity (`data`, `commentData`, etc.)
- Advanced extension configuration parity (`deleteUnreferencedThreads`, wrapping migration options, full class map including block thread class)
