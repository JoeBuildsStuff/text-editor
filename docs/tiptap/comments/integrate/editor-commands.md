# Comments editor commands

The Comments Editor API focuses on the client-side interactions for managing comments within the editor, enabling direct manipulation and customization of comment threads.

For server-side operations, use the [Comments REST API](/docs/comments/integrate/rest-api) to manage thread and comments outside the editor.

## [](#all-editor-commands-for-comments)All editor commands for comments

Command

Description

`setThread`

Creates a new thread with optional user and content data

`removeThread`

Deletes a specified thread, with an option to remove it from the Yjs document

`updateThread`

Updates specific thread properties like 'seen' status

`selectThread`

Focuses the editor on a specified thread

`unselectThread`

Removes focus from the selected thread

`resolveThread`

Marks a thread as resolved

`unresolveThread`

Reverts a thread from resolved status

`createComment`

Adds a new comment to a thread with details like content and user data

`updateComment`

Modifies an existing comment's content and metadata

`removeComment`

Deletes a specified comment from a thread

## [](#interact-with-threads)Interact with threads

### [](#setthread-content-data-commentdata)setThread( content, data, commentData )

Creates a new thread at your current selection.

```
editor.commands.setThread({
  content: 'This is a new thread',
  data: { authorId: '123' },
  commentData: { authorId: '123' },
})
```

### [](#removethread-id-deletethread)removeThread( id, deleteThread )

Deletes a thread with the given ID. If no ID is provided, the thread at the current selection will be deleted. If `deleteThread` is set to `true`, the thread will also be deleted from the Yjs document.

```
editor.commands.removeThread({
  id: '101',
  deleteThread: true,
})
```

### [](#updatethread-id-data)updateThread( id, data )

Updates the properties of a thread with the specified ID.

```
editor.commands.updateThread({
  id: '101',
  data: { seen: true },
})
```

### [](#selectthread-id-selectaround)selectThread( id, selectAround )

Selects a thread with the specified ID. If `selectAround` is set to `true`, the editor will create a selection range spanning the entire thread.

```
editor.commands.selectThread({
  id: '101',
  selectAround: true,
})
```

### [](#unselectthread)unselectThread()

Deselects the currently selected thread.

```
editor.commands.unselectThread()
```

### [](#resolvethread-id)resolveThread( id )

Marks the thread with the specified ID as resolved.

```
editor.commands.resolveThread({
  id: '101',
})
```

### [](#unresolvethread-id)unresolveThread( id )

Reverts the thread with the specified ID to unresolved status.

```
editor.commands.unresolveThread({
  id: '101',
})
```

## [](#handle-comments)Handle comments

### [](#createcomment-threadid-content-data)createComment( threadId, content, data )

Creates a new comment on the thread with the specified thread ID.

```
editor.commands.createComment({
  threadId: '101',
  content: 'This is a new comment',
  data: { authorId: '123' },
})
```

### [](#updatecomment-threadid-id-content-data)updateComment( threadId, id, content, data )

Updates a comment with the specified ID on the thread identified by a given thread ID.

```
editor.commands.updateComment({
  threadId: '101',
  id: '456',
  content: 'Now this is the new content',
  data: { edited: true },
})
```

### [](#removecomment-threadid-id)removeComment( threadId, id )

Deletes a comment with the specified ID from the thread identified by a given thread ID.

```
editor.commands.removeComment({
  threadId: '101',
  id: '456',
})
```