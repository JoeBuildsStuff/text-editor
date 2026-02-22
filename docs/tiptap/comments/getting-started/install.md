# Install the Comments extension

Install and configure the comments extension by following this guide. Take a look at the Comments example application at the bottom of this page for a whole integration.

Requirements

1\. Activate trial or subscribe

2\. Start Document server

3\. Install from private registry

## [](#access-the-private-registry)Access the private registry

The Comments extension is published in Tiptap’s private npm registry. Integrate the extension by following the [private registry guide](/docs/guides/pro-extensions).

```
npm install @tiptap-pro/extension-comments
```

## [](#integrating-the-comments-extension)Integrating the Comments extension

After installing the `comments` extension via npm or any other package manager, you can use it in your editor by registering the extension in the `extensions` property of your editor instance.

The Comments extension consists of multiple components, including nodes and plugins. To include all the required features, use the `CommentsKit` extension.

```
import { CommentsKit } from '@tiptap-pro/extension-comments'

const editor = new Editor({
  ...
  extensions: [
    ...,
    CommentsKit,
  ]
})
```

This will add all required extensions to your editor. Since Threads are a **cloud** or **on premises** feature you will need to also pass through a `TiptapCollabProvider` instance to your comments extension.

```
const collabProvider = new TiptapCollabProvider({
  // your provider options
})

const editor = new Editor({
  ...
  extensions: [
    ...,
    CommentsKit.configure({
      provider: collabProvider,
    }),
  ]
})
```

Your editor is now ready to support threads.

* * *

See a full example of how to use the Comments extension in the following example: