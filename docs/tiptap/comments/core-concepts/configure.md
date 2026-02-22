# Configure comments

Comments are embedded within documents in the Collaboration Cloud. To enable comments, integrate the TiptapCollabProvider and configure your setup to support comment functionality.

## [](#provider)Provider

The `TiptapCollabProvider` instance

Default: `null`

```
const tiptapCollabProvider = new TiptapCollabProvider({
  // your provider options
})

Comments.configure({
  provider: tiptapCollabProvider,
})
```

## [](#classes)Classes

The classes used for the threads.

Default:

```
{
  thread: 'tiptap-thread',
  threadInline: 'tiptap-thread--inline',
  threadBlock: 'tiptap-thread--block',
  threadHovered: 'tiptap-thread--hovered',
  threadSelected: 'tiptap-thread--selected',
  threadResolved: 'tiptap-thread--resolved',
  threadUnresolved: 'tiptap-thread--unresolved',
}
```

```
Comments.configure({
  classes: {
    thread: 'my-thread',
    threadInline: 'my-thread-inline',
    threadBlock: 'my-thread-block',
    threadHovered: 'my-thread-hovered',
    threadSelected: 'my-thread-selected',
    threadResolved: 'my-thread-resolved',
    threadUnresolved: 'my-thread-unresolved',
  },
})
```

## [](#onclickthread)onClickThread

A callback that is called when a thread is clicked. If the thread is clicked, the thread ID is passed to the callback. If no thread is clicked, `null` is passed.

Default: `undefined`

```
Comments.configure({
  // ID can be a string or null
  onClickThread: (id) => console.log('Thread clicked', id),
})
```

## [](#deleteunreferencedthreads)deleteUnreferencedThreads

A boolean option that controls whether to delete threads not referenced in the document. By default, threads are marked as deleted when they are not referenced in a document anymore. This is useful for cleaning up threads that are no longer needed.

However, if you want to keep the threads even if they are not referenced in the document, you can set this option to `false`.

**Default:**: `true`

```
Comments.configure({
  // keep threads even if they are not referenced in the document
  deleteUnreferencedThreads: false,
})
```

## [](#uselegacywrapping)useLegacyWrapping

### Warning

The new wrapping mechanism uses a different schema for threads on block nodes, which is not compatible with the previous wrapping behavior. If this is set to `false` without mapping existing thread nodes to the new schema, the threads content will be stripped from the document.

A boolean option that controls whether to use the legacy wrapping mechanism for multi-line comments. We suggest for new implementations to set this to `false`, and existing integrations can stay on the previous behavior. This is only required for backwards compatibility with existing comments, and it will be removed in the future.

The new wrapping mechanism is more flexible, allowing to wrap content more precise and supports mixed wrapping of inline and block nodes.

**Default:** `true`

```
Comments.configure({
  // enable new flexible block wrapping
  useLegacyWrapping: false,
})
```