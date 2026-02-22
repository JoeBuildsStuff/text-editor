# Comments REST API

The Comments REST API lets users manage comment threads and individual comments from outside the Tiptap Editor. It supports creating, updating, deleting, and retrieving threads and comments.

Use the [Comments Postman Collection](https://www.postman.com/tiptap-platform/workspace/tiptap-workspace/folder/33042171-01d1c110-e913-4d99-b47a-fc95aad877c9) for hands-on experimentation.

Requirements

1\. Activate trial or subscribe

2\. Start Document server

## [](#access-the-api)Access the API

The REST API is exposed directly from your Document server, available at your custom URL:

```
https://YOUR_APP_ID.collab.tiptap.cloud/
```

Authentication is done using an API secret which you can find in the [settings](https://cloud.tiptap.dev/v2/configuration/document-server) of your Document server. The secret must be sent as an `Authorization` header.

If your document identifier contains a slash (`/`), encode it as `%2F`, e.g. using `encodeURIComponent`.

## [](#review-all-api-endpoints)Review all API endpoints

Operation

Method

Endpoint

Description

Create thread

POST

/api/documents/:identifier/threads

Create a new thread within a document

Get threads

GET

/api/documents/:identifier/threads

List all threads and view their details

Get thread

GET

/api/documents/:identifier/threads/:threadIdentifier

Retrieve a specific thread

Update thread

PATCH

/api/documents/:identifier/threads/:threadIdentifier

Modify attributes of an existing thread

Update comment

PATCH

/api/documents/:identifier/threads/:threadIdentifier/comments/:commentIdentifier

Update the content or metadata of a comment

Delete thread

DELETE

/api/documents/:identifier/threads/:threadIdentifier

Remove a specific thread from a document

Delete comment

DELETE

/api/documents/:identifier/threads/:threadIdentifier/comments/:commentIdentifier

Remove a specific comment from a thread

## [](#thread-rest-api-endpoints)Thread REST API endpoints

### [](#get-threads)Get threads

```
GET /api/documents/:identifier/threads
```

Retrieve all comment threads associated with a specific document. Use this endpoint to list all threads and view their details.

```
curl --location 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads' \
--header 'Authorization: {{Authorization}}'
```

### [](#get-thread)Get thread

```
GET /api/documents/:identifier/threads/:threadIdentifier
```

Fetch details of a specific thread using its unique identifier within a document. This is useful for retrieving specific discussion threads.

```
curl --location 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads/{thread_id}' \
--header 'Authorization: {{Authorization}}'
```

### [](#create-thread)Create thread

```
POST /api/documents/:identifier/threads
```

Create a new thread within a document. You can specify the initial content and additional data like user metadata.

```
curl --location 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads' \
--header 'Content-Type: application/json' \
--header 'Authorization: {{Authorization}}' \
--data '{
    "content": "moin",
    "data": { "key": "ttt"}
}'
```

### [](#update-thread)Update thread

```
PATCH /api/documents/:identifier/threads/:threadIdentifier
```

Modify attributes of an existing thread, such as marking it as resolved or updating its metadata.

```
curl --location --request PATCH 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads/{thread_id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: {{Authorization}}' \
--data '{
    "resolvedAt": null
}'
```

### [](#delete-thread)Delete thread

```
DELETE /api/documents/:identifier/threads/:threadIdentifier
```

Remove a specific thread from a document, effectively deleting all nested comments.

```
curl --location --request DELETE 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads/{thread_id}' \
--header 'Authorization: {{Authorization}}'
```

## [](#comment-rest-api-endpoints)Comment REST API endpoints

### [](#create-comment)Create comment

```
POST /api/documents/:identifier/threads/:threadIdentifier/comments
```

Add a new comment to an existing thread. Specify the content and any associated data.

```
curl --location 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads/{thread_id}/comments' \
--header 'Content-Type: application/json' \
--header 'Authorization: {{Authorization}}' \
--data '{
    "content": "test",
    "data": { "key": "ttt"}
}'
```

### [](#update-comment)Update comment

```
PATCH /api/documents/:identifier/threads/:threadIdentifier/comments/:commentIdentifier
```

Update the content or metadata of an existing comment within a thread.

```
curl --location --request PATCH 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads/{thread_id}/comments/{comment_id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: {{Authorization}}' \
--data '{
    "content": "UPDATED!"
}'
```

### [](#delete-comment)Delete comment

```
DELETE /api/documents/:identifier/threads/:threadIdentifier/comments/:commentIdentifier
```

Remove a specific comment from a thread. Use this to manage individual comments.

```
curl --location --request DELETE 'https://YOUR_APP_ID.collab.tiptap.cloud/api/documents/{document_id}/threads/{thread_id}/comments/{comment_id}' \
--header 'Authorization: {{Authorization}}'
```

## [](#review-postman-collection)Review Postman Collection

Use the [Comments Postman Collection](https://www.postman.com/tiptap-platform/workspace/tiptap-workspace/folder/33042171-01d1c110-e913-4d99-b47a-fc95aad877c9) for hands-on experimentation.