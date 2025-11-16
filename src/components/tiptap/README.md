# Tiptap File Handling System

A unified file handling system for the Tiptap editor that eliminates base64 blobs and streams every upload through the local `/api/files/*` endpoints backed by the filesystem.

## 🎯 **Overview**

The system provides a single, consistent approach for handling all file types in Tiptap:
- **Images, documents, archives** - All uploaded through the `/api/files/upload` route and written to `server/uploads/<userId>`
- **No base64 data** - Only file paths stored in editor content
- **Unified architecture** - Single pattern for all file operations
- **Secure access** - Download URLs are generated on-demand and validated per user
- **Automatic cleanup** - Files removed from storage when deleted

## 🚀 **Key Benefits**

1. **Performance**: Editor content remains lightweight regardless of file count/size
2. **Scalability**: No content size limits from embedded binary data
3. **Consistency**: Single pattern for all file types
4. **Security**: Centralized access control and authentication
5. **Cost Efficiency**: Reduced database storage costs
6. **Maintainability**: Unified codebase for all file operations
7. **Developer Experience**: Single import point for all file operations
8. **Error Handling**: Consistent error handling across all functions
9. **Configuration**: Centralized file type and size configuration
10. **Testing**: Easier to test and mock file operations

## 🏗️ **Architecture**

### **Unified File Manager**

The system now uses a consolidated `file-storage-manager.ts` that provides:

- **Single import point** for all file operations
- **Consistent error handling** across all functions
- **Unified interfaces** for upload, delete, and serve operations
- **Backward compatibility** with legacy function names
- **Centralized configuration** for file types and limits

### **Core Components**

#### 1. **FileHandler Extension** (`file-handler.tsx`)
- Intercepts all file drops and paste events
- Uploads files via the unified file manager and `/api/files/upload`
- Determines appropriate node type (Image vs FileNode)
- Inserts nodes with file paths (not binary data)

#### 2. **FileNode** (`file-node.tsx`)
- Represents non-image files in editor content
- Stores file metadata (name, size, type, path)
- Supports different preview types (document, file)
- Tracks upload status

#### 3. **FileNodeView** (`file-node-view.tsx`)
- Renders file nodes with local storage integration
- Fetches signed URLs from `/api/files/serve`
- Provides download and preview functionality
- Shows loading and error states

#### 4. **CustomImageView** (`custom-image-view.tsx`)
- Renders images stored through `/api/files`
- Uses the unified file manager for scoped URLs
- Consistent with the unified file system

#### 5. **DocumentPreview** (`file-document-preview.tsx`)
- Renders document previews from local storage
- Supports `.txt`, `.docx`, and `.pdf` files
- Fetches file data via unified file manager

### **API Routes**

The system uses these API endpoints, but all interactions are now handled through the unified file manager:

#### **`/api/files/upload`**
- Uploads all file types to the local filesystem
- Validates file type and size
- Creates organized file paths: `{userId}/{category}/{timestamp}-{filename}`
- Returns file path for storage in editor content

#### **`/api/files/serve`**
- Generates short-lived URLs for secure file access
- Verifies user authentication and ownership
- Returns `/api/files/raw?path=...` download URLs for both images and file nodes

#### **`/api/files/delete`**
- Removes files from local storage
- Verifies user ownership before deletion
- Automatic cleanup when files are removed from editor

#### **`/api/files/raw`**
- Streams the actual file bytes with the correct `Content-Type`
- Requires the same authenticated session as the metadata routes

### **Storage System**

#### **Directory Layout**
```
server/uploads/
├── {userId}/
│   ├── notes/
│   │   ├── {timestamp}-{filename}.jpg
│   │   ├── {timestamp}-{filename}.pdf
│   │   └── {timestamp}-{filename}.docx
│   └── other-groups/
└── ...
```

#### **File Path Format**
```
{userId}/{category}/{timestamp}-{filename}
Example: 401cc145-0c7b-4825-a14b-090c8ba30f7e/notes/1756851600392-document.pdf
```

## 📁 **File Type Support**

### **Images**
- **Formats**: JPEG, PNG, GIF, WebP
- **Node Type**: Standard Tiptap Image node
- **Preview**: Direct browser rendering
- **Storage**: `server/uploads/{userId}/notes/...`

### **Documents**
- **Formats**: TXT, PDF, DOCX, XLSX, PPTX, DOC, XLS, PPT
- **Node Type**: FileNode with `previewType: 'document'`
- **Preview**: DocumentPreview component
- **Storage**: `server/uploads/{userId}/notes/...`

### **Archives & Other Files**
- **Formats**: ZIP, RAR, 7Z, JSON, CSV, HTML, CSS
- **Node Type**: FileNode with `previewType: 'file'`
- **Preview**: File information card with download actions
- **Storage**: `server/uploads/{userId}/notes/...`

## ⚙️ **Configuration**

### **Basic Setup**

```typescript
import { createFileHandlerConfig } from './file-handler'
import { FileNode } from './file-node'
import { createFileUploader } from './file-storage-manager'

const fileHandler = createFileHandlerConfig({
  fileUploadConfig: {
    pathPrefix: 'notes',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // Documents
      'text/plain', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Archives
      'application/zip', 'application/x-rar-compressed',
      // Other
      'application/json', 'text/csv', 'text/html', 'text/css'
    ]
  }
})

const extensions = [
  // ... other extensions
  FileNode,
  fileHandler,
]
```

### **Tiptap Component Usage**

```typescript
<Tiptap
  content={content}
  onChange={handleChange}
  fileUploadConfig={{
    pathPrefix: 'notes',
    maxFileSize: 10 * 1024 * 1024,
    allowedMimeTypes: [/* your file types */]
  }}
  enableFileNodes={true}
/>
```

### **Editor Configuration**

```typescript
import { deleteFile } from './file-storage-manager'

const editor = useEditor({
  extensions,
  onDelete: ({ type, node }) => {
    // Handle cleanup of deleted file nodes
    if (type === 'node' && node?.attrs?.src) {
      const src = node.attrs.src
      
      // Only cleanup local file paths, not external URLs
      if (typeof src === 'string' && !src.startsWith('http') && !src.startsWith('data:')) {
        deleteFile(src).catch(error => {
          console.error('Failed to cleanup deleted file:', error)
        })
      }
    }
  },
})
```

## 🔄 **Data Flow**

### **Upload Flow**
1. User drops/pastes file → FileHandler intercepts
2. FileHandler calls unified file manager's `uploadFile()`
3. Upload API writes file to `server/uploads/<userId>`, returns the relative file path
4. FileHandler inserts appropriate node with `src: filePath`
5. Node renders using file path, fetches a scoped URL on demand

### **Display Flow**
1. File node has `src` attribute with file path
2. FileNodeView/CustomImageView component loads
3. Fetches download URL via unified file manager
4. Displays content using the returned URL

### **Cleanup Flow**
1. User deletes file node → `onDelete` event fires
2. Event handler extracts deleted node's `src` attribute
3. Unified file manager's `deleteFile()` calls delete API
4. File removed from local storage

## 🛡️ **Security**

### **Authentication & Authorization**
- All file operations require user authentication
- File paths include user ID for access control
- Each request validates file ownership
- Users can only access files in their own folders

### **File Access**
- Download URLs are generated on demand and scoped to the authenticated user
- Files are never served directly from the filesystem—everything flows through `/api/files/raw`
- File type and size validation occurs on both client and server
- Path traversal protection defends against forged file paths

## 🧹 **Cleanup System**

### **Unified File Operations**

```typescript
import { 
  uploadFile, 
  deleteFile, 
  deleteFiles, 
  getFileUrl,
  createFileUploader 
} from './file-storage-manager'

// Upload a file
const result = await uploadFile(file, { pathPrefix: 'notes' })

// Delete single file
await deleteFile(filePath)

// Delete multiple files
await deleteFiles([filePath1, filePath2, filePath3])

// Get download URL for serving
const urlResult = await getFileUrl(filePath)

// Create custom uploader
const customUploader = createFileUploader({ 
  maxFileSize: 5 * 1024 * 1024, // 5MB
  pathPrefix: 'documents' 
})
```

### **Automatic Cleanup**
- Files automatically removed from storage when deleted from editor
- Uses Tiptap's `onDelete` event for immediate cleanup
- No complex content diffing or state tracking needed

## 🔧 **Troubleshooting**

### **Common Issues**

#### **Files Not Uploading**
- Ensure `server/uploads/` exists and is writable by the Next.js server
- Check file type is in `allowedMimeTypes`
- Verify file size is under `maxFileSize`

#### **Files Not Displaying**
- Check browser console for API errors
- Verify the relative file path is correct and still present under `server/uploads/{userId}`
- Check user authentication
- Verify file ownership

#### **Cleanup Failing**
- Check authentication status
- Verify file path format
- Check delete API permissions
- Verify file ownership

### **Debug Tips**
1. Check browser console for detailed error messages
2. Verify the local storage directory exists and is accessible
3. Test with smaller files first
4. Ensure all API routes are properly configured
5. Check file type support in configuration

## 📚 **Dependencies**

```json
{
  "dependencies": {
    "@tiptap/core": "^3.0.0",
    "@tiptap/react": "^3.0.0",
    "@tiptap/extension-file-handler": "^3.0.0",
    "docx-preview": "^0.2.0"
  }
}
```

## 🚀 **Getting Started**

1. **Install Dependencies**: Ensure all Tiptap extensions are installed
2. **Prepare Storage**: Make sure the `server/uploads` directory exists (the upload API will create folders per user automatically)
3. **Add Extensions**: Include FileNode and FileHandler in your editor
4. **Configure Upload**: Set up `fileUploadConfig` with your preferences
5. **Test**: Try uploading different file types

## 🎯 **Migration from Legacy System**

### **What Changed**
- `imageUploadConfig` → `fileUploadConfig`
- Files are written to `server/uploads/<userId>` via the `/api/files` routes
- Unified API endpoints (`/api/files/*`)
- Single cleanup system for all file types
- **Consolidated file operations** into `file-storage-manager.ts`


### **Backward Compatibility**
- Existing image handling continues to work
- Gradual migration possible for existing content
- All file types now use the same upload/display pattern

## 🔮 **Future Enhancements**

- Enhanced document preview support (Excel, PowerPoint)
- File compression and optimization
- Progress tracking for uploads
- Batch file operations
- File versioning and history
- Advanced preview capabilities

---

This system provides a robust, scalable, and maintainable solution for file handling in Tiptap editors, eliminating the performance and scalability issues of base64 storage while providing a consistent user experience across all file types.
