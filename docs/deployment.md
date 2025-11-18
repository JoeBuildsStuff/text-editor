# Deployment Guide

This guide covers deploying the Text Editor application to production, including CI/CD setup, Docker configuration, and optimization strategies.

## Overview

The application is designed to be deployed using Docker containers. The recommended approach uses GitHub Actions for CI/CD, building Docker images in the cloud and deploying to a VPS or cloud provider.

## Deployment Architecture

### Recommended: CI/CD with Container Registry

```
Developer pushes code
    │
    └─► GitHub Actions (CI)
            │
            ├─► Build Docker Image
            │
            ├─► Push to Registry (ghcr.io)
            │
            └─► Deploy to VPS
                    │
                    ├─► Pull Image
                    │
                    └─► Restart Services
```

**Benefits**:
- Fast deployments (~30 seconds on VPS)
- Consistent builds
- Lower VPS resource usage
- Easy rollbacks

### Alternative: VPS Build

Build everything directly on the VPS (simpler but slower).

## Prerequisites

### Server Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended)
- **CPU**: 2+ cores
- **RAM**: 2+ GB
- **Disk**: 20+ GB (for databases, files, and images)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+

### Required Software

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## Environment Configuration

### Production Environment Variables

Create `.env` file on your server:

```env
# Application
NODE_ENV=production
NEXT_PUBLIC_BETTER_AUTH_URL=https://your-domain.com
BETTER_AUTH_URL=https://your-domain.com
BETTER_AUTH_SECRET=<generate-secure-secret>
PORT=3000
NEXT_TELEMETRY_DISABLED=1

# File Storage (optional)
FILE_STORAGE_DIR=/app/server/uploads

# Database Paths (optional)
DOCUMENTS_SQLITE_PATH=/app/server/documents.db
AUTH_SQLITE_PATH=/app/server/auth.sqlite

# Build Configuration (optional)
SKIP_TYPE_CHECK=false  # Set to 'true' for memory-constrained builds
```

**Generate Auth Secret**:
```bash
openssl rand -hex 32
```

### Security Considerations

- **Never commit** `.env` files
- Use strong, unique secrets
- Rotate secrets periodically
- Use HTTPS in production
- Set secure cookie flags

## Docker Configuration

### Dockerfile

The project includes a `Dockerfile` that:
1. Uses Node.js base image
2. Installs dependencies
3. Builds the Next.js application
4. Runs the production server

### Docker Compose

`docker-compose.yml` defines:
- Application service
- Volume mounts for persistent data
- Environment variables
- Port mappings

**Production Override** (`docker-compose.override.yml`):
- Uses pre-built image from registry
- Overrides build configuration

## CI/CD Setup

### GitHub Actions Workflow

The workflow (`.github/workflows/deploy.yml`) includes:

1. **Build Job**:
   - Checks out code
   - Builds Docker image
   - Pushes to GitHub Container Registry
   - Uses Docker layer caching

2. **Deploy Job**:
   - SSH to VPS
   - Pulls latest image
   - Restarts services

### GitHub Container Registry Setup

#### For Public Repositories

No setup needed! Images are public by default.

#### For Private Repositories

1. **Create Personal Access Token**:
   - GitHub Settings → Developer settings → Personal access tokens
   - Create token with `read:packages` and `write:packages` permissions

2. **Add GitHub Secret**:
   - Repository Settings → Secrets and variables → Actions
   - Name: `GHCR_TOKEN`
   - Value: Your PAT

3. **Add VPS Secret** (for pulling):
   - Add `GHCR_TOKEN` to your VPS environment or use SSH key

### SSH Setup

The workflow needs SSH access to your VPS:

1. **Generate SSH Key** (if needed):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions"
   ```

2. **Add Public Key to VPS**:
   ```bash
   ssh-copy-id user@your-vps-ip
   ```

3. **Add SSH Key to GitHub Secrets**:
   - Repository Settings → Secrets and variables → Actions
   - Name: `VPS_SSH_KEY`
   - Value: Private key content

4. **Add VPS Details**:
   - `VPS_HOST`: Your VPS IP or domain
   - `VPS_USER`: SSH username
   - `VPS_PORT`: SSH port (default: 22)

## Deployment Process

### Automated Deployment

1. **Push to main branch**:
   ```bash
   git push origin main
   ```

2. **GitHub Actions runs**:
   - Builds Docker image
   - Pushes to registry
   - Deploys to VPS

3. **VPS updates**:
   - Pulls new image
   - Restarts container
   - Application is live

### Manual Deployment

If you need to deploy manually:

```bash
# Build and push image
docker build -t ghcr.io/YOUR_USERNAME/text-editor:latest .
docker push ghcr.io/YOUR_USERNAME/text-editor:latest

# On VPS, pull and restart
docker pull ghcr.io/YOUR_USERNAME/text-editor:latest
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d --force-recreate
```

## VPS Setup

### Initial Server Setup

1. **Create directories**:
   ```bash
   mkdir -p /opt/text-editor
   cd /opt/text-editor
   ```

2. **Clone repository** (or copy files):
   ```bash
   git clone <repository-url> .
   ```

3. **Create `.env` file**:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

4. **Create data directories**:
   ```bash
   mkdir -p server/documents server/uploads
   ```

5. **Initialize databases** (first time only):
   ```bash
   docker-compose run --rm app pnpm db:init
   ```

### Docker Compose Configuration

Create or update `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/YOUR_USERNAME/text-editor:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    volumes:
      - ./server:/app/server
    restart: unless-stopped
```

### Starting Services

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

## Reverse Proxy

The application can be deployed behind a reverse proxy. Two common options are Traefik (recommended for Docker deployments) and Nginx.

### Traefik (Recommended for Docker)

If using Docker with Traefik, configure the service with Traefik labels in `docker-compose.yml`:

```yaml
services:
  text-editor:
    # ... other configuration
    networks:
      - traefik_proxy
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik_proxy"
      - "traefik.http.routers.text-editor.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.text-editor.entrypoints=web"
      - "traefik.http.routers.text-editor-secure.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.text-editor-secure.entrypoints=websecure"
      - "traefik.http.routers.text-editor-secure.tls=true"
      - "traefik.http.routers.text-editor-secure.tls.certresolver=letsencrypt"
      - "traefik.http.services.text-editor.loadbalancer.server.port=3000"

networks:
  traefik_proxy:
    external: true
```

**Requirements**:
- Traefik must be running and accessible
- External network `traefik_proxy` must exist
- Traefik must be configured with Let's Encrypt certificate resolver

### Nginx (Alternative)

Set up Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL/TLS Setup

#### With Traefik

Traefik automatically handles SSL certificates via Let's Encrypt when configured with a certificate resolver. No manual setup required.

#### With Nginx

Use Let's Encrypt for free SSL:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already configured)
sudo certbot renew --dry-run
```

## Data Persistence

### Volumes

The Docker Compose configuration mounts:
- `./server` → `/app/server` (databases, documents, uploads)

### Backup Strategy

1. **Database Backups**:
   ```bash
   # Backup documents database
   cp server/documents.db server/documents.db.backup

   # Backup auth database
   cp server/auth.sqlite server/auth.sqlite.backup
   ```

2. **File Backups**:
   ```bash
   # Backup documents
   tar -czf documents-backup.tar.gz server/documents/

   # Backup uploads
   tar -czf uploads-backup.tar.gz server/uploads/
   ```

3. **Automated Backups**:
   ```bash
   # Add to crontab
   0 2 * * * /opt/text-editor/backup.sh
   ```

### Restore from Backup

```bash
# Restore database
cp server/documents.db.backup server/documents.db

# Restore files
tar -xzf documents-backup.tar.gz -C server/
```

## Monitoring

### Health Checks

Add health check endpoint (optional):

```typescript
// src/app/api/health/route.ts
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
```

### Logging

- **Application logs**: `docker-compose logs -f app`
- **System logs**: `journalctl -u docker`
- **Reverse proxy logs**:
  - **Traefik**: Check Traefik dashboard or logs (`docker logs traefik`)
  - **Nginx** (if using): `/var/log/nginx/access.log` and `error.log`

### Resource Monitoring

```bash
# Container stats
docker stats

# Disk usage
df -h

# Memory usage
free -h
```

## Performance Optimization

### Build Optimization

The CI/CD workflow uses:
- Docker layer caching
- Multi-stage builds
- Build cache from GitHub Actions

### Runtime Optimization

- **Next.js**: Production build with optimizations
- **SQLite**: WAL mode enabled for better concurrency
- **File serving**: Streaming for large files
- **Caching**: Consider adding Redis for session caching

### Scaling Considerations

For higher traffic:
- Use load balancer with multiple instances
- Move to PostgreSQL for database
- Use object storage (S3) for files
- Add CDN for static assets
- Implement Redis for caching

## Troubleshooting

### Container Won't Start

1. **Check logs**:
   ```bash
   docker-compose logs app
   ```

2. **Verify environment variables**:
   ```bash
   docker-compose config
   ```

3. **Check disk space**:
   ```bash
   df -h
   ```

### Database Errors

1. **Check database files exist**:
   ```bash
   ls -la server/*.db server/*.sqlite
   ```

2. **Verify permissions**:
   ```bash
   chmod 644 server/*.db
   ```

3. **Reinitialize if needed**:
   ```bash
   docker-compose run --rm app pnpm db:init
   ```

### Image Pull Fails

1. **Check authentication**:
   ```bash
   echo $GHCR_TOKEN
   ```

2. **Login manually**:
   ```bash
   echo $GHCR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

3. **Verify image exists**:
   - Check GitHub Container Registry
   - Verify image name matches

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

## Rollback

### Rollback to Previous Version

1. **Find previous image tag**:
   ```bash
   docker images ghcr.io/YOUR_USERNAME/text-editor
   ```

2. **Update docker-compose.yml**:
   ```yaml
   image: ghcr.io/YOUR_USERNAME/text-editor:main-<previous-sha>
   ```

3. **Restart**:
   ```bash
   docker-compose up -d --force-recreate
   ```

### Emergency Rollback

```bash
# Stop current container
docker-compose down

# Start previous version
docker-compose -f docker-compose.yml -f docker-compose.rollback.yml up -d
```

## Security Checklist

- [ ] Strong `BETTER_AUTH_SECRET` generated
- [ ] HTTPS enabled (SSL certificate)
- [ ] Environment variables secured
- [ ] Database files have proper permissions
- [ ] Firewall configured (only necessary ports open)
- [ ] Regular security updates
- [ ] Backups configured
- [ ] Monitoring in place
- [ ] Rate limiting considered
- [ ] File upload limits configured

## Related Documentation

- [Development Guide](./development-guide.md) - Local development setup
- [Architecture Overview](./architecture.md) - System design
- [File Storage System](./file-storage.md) - File upload configuration
- [Database Schema](./database-schema.md) - Database structure

## Additional Resources

- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Docker Documentation](https://docs.docker.com/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Nginx Documentation](https://nginx.org/en/docs/)

