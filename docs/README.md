# Documentation Index

This directory contains comprehensive documentation to help you understand, develop, and maintain the codebase.

## 📚 Documentation Overview

This is a markdown-based text editor built with Next.js and Tiptap. It provides a rich editing experience with document organization, file uploads, and user authentication.

## 📖 Documentation Structure

### Getting Started
- **[Architecture Overview](./architecture.md)** - High-level system design, technology stack, and architectural decisions
- **[Project Structure](./project-structure.md)** - Detailed explanation of the codebase organization and directory structure
- **[Development Guide](./development-guide.md)** - Setup instructions, development workflow, and best practices

### Core Systems
- **[Authentication](./authentication.md)** - User authentication system using Better Auth
- **[Database Schema](./database-schema.md)** - SQLite database structure, tables, and relationships
- **[File Storage System](./file-storage.md)** - File upload, storage, and management system
- **[API Reference](./api-reference.md)** - Complete API endpoint documentation

### Operations
- **[Deployment Guide](./deployment.md)** - Production deployment process, CI/CD, and optimization strategies

## 🎯 Quick Links

### For New Developers
1. Start with [Architecture Overview](./architecture.md) to understand the system
2. Review [Project Structure](./project-structure.md) to navigate the codebase
3. Follow [Development Guide](./development-guide.md) to set up your environment

### For Contributors
- [Development Guide](./development-guide.md) - Development workflow and conventions
- [API Reference](./api-reference.md) - API endpoints and usage
- [Database Schema](./database-schema.md) - Database structure and migrations

### For DevOps
- [Deployment Guide](./deployment.md) - Production deployment and CI/CD
- [File Storage System](./file-storage.md) - Storage configuration and management

## 🔑 Key Concepts

### Hybrid Storage Model
The application uses a hybrid storage approach:
- **SQLite Database** (`server/documents.db`) - Stores document metadata (IDs, titles, paths, timestamps)
- **File System** (`server/documents/`) - Stores markdown content as `.md` files
- **User Uploads** (`server/uploads/<userId>/`) - Stores images and attachments per user

### Authentication
- Uses [Better Auth](https://www.better-auth.com/) for authentication
- Email/password authentication
- Session-based auth with SQLite storage
- All API routes require authentication

### Editor System
- Built with [Tiptap](https://tiptap.dev/) - a headless rich text editor
- Markdown-based content storage
- Supports images, files, tables, code blocks, and more
- Local-first file uploads (no external storage required)

## 📁 Related Documentation

- **Root README.md** - Project overview and quick start
- **server/README.md** - Database migration best practices
- **src/components/tiptap/README.md** - Tiptap-specific implementation details

## 🤝 Contributing

When adding new features or making changes:
1. Update relevant documentation files
2. Keep the architecture diagram current
3. Document API changes in [API Reference](./api-reference.md)
4. Update [Database Schema](./database-schema.md) for schema changes
5. Add migration notes in `server/README.md` for database changes

## 📝 Documentation Maintenance

This documentation should be kept up-to-date with the codebase. When making significant changes:
- Update the relevant documentation file
- Update this index if adding new documentation
- Ensure code examples are current and tested
- Keep architecture diagrams and flow charts accurate

---

**Last Updated**: Documentation is maintained alongside the codebase. Check git history for recent changes.
