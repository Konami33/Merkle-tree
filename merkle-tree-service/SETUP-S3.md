# MinIO S3 Integration Setup Guide

This guide will help you set up MinIO on your EC2 instance and integrate it with the Merkle Tree Service.

## EC2 Instance Setup

### 1. Install Docker and Docker Compose

```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login again for group changes to take effect
```

### 2. Clone and Setup Project

```bash
# Clone your project
git clone <your-repo-url>
cd merkle-tree-service

# Install Node.js and npm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Install dependencies
npm install
```

### 3. Configure Environment

```bash
# Copy and edit environment file
cp .env.example .env
nano .env
```

**Edit `.env` file for S3 mode:**

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Merkle Tree Configuration
SCAN_INTERVAL_MINUTES=5
SOURCE_DIRECTORY=/home/ec2-user/data
BATCH_SIZE=100

# Enable S3 Storage
S3_ENABLED=true

# MinIO Configuration
S3_ENDPOINT=localhost
S3_PORT=9000
S3_USE_SSL=false
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=merkle-trees
S3_REGION=us-east-1

# Redis Configuration
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Logging
LOG_LEVEL=info
```

### 4. Start Services with Docker Compose

```bash
# Start MinIO and Redis
docker-compose up -d minio redis

# Check services are running
docker ps
```

### 5. Configure Security Groups

In AWS Console, configure your EC2 security group:

- **SSH (22)**: Your IP address
- **HTTP (3000)**: Your IP address (for API access)
- **MinIO (9000)**: Your IP address (for S3 API)
- **MinIO Console (9001)**: Your IP address (for web UI)
- **Redis (6379)**: Localhost only (or restrict as needed)

### 6. Create Data Directory

```bash
# Create source directory for files to be processed
mkdir -p /home/ec2-user/data
echo "test file content" > /home/ec2-user/data/test1.txt
echo "another test file" > /home/ec2-user/data/test2.txt
```

### 7. Start the Merkle Tree Service

```bash
# Test the service first
npm run test:redis

# Start the service
npm start

# Or use PM2 for production
npm install -g pm2
pm2 start server.js --name merkle-service
pm2 startup
pm2 save
```

## Verification

### 1. Check MinIO Console

Visit `http://your-ec2-public-ip:9001` and login with:
- **Username**: minioadmin
- **Password**: minioadmin

### 2. Test API Endpoints

```bash
# Health check
curl http://your-ec2-public-ip:3000/health

# Check storage mode
curl http://your-ec2-public-ip:3000/

# Trigger manual build
curl -X POST http://your-ec2-public-ip:3000/health/build

# Check cache status
curl http://your-ec2-public-ip:3000/health/cache
```

### 3. Verify S3 Storage

```bash
# List objects in MinIO using AWS CLI
aws s3 --endpoint-url http://your-ec2-public-ip:9000 ls s3://merkle-trees/
```

## Production Considerations

### 1. Security Hardening

```bash
# Change default MinIO credentials
# Edit docker-compose.yml:
# MINIO_ROOT_USER: your-secure-username
# MINIO_ROOT_PASSWORD: your-secure-password

# Use SSL in production
# S3_USE_SSL=true
# S3_PORT=443
```

### 2. Backup Strategy

```bash
# MinIO data is stored in Docker volume
# Set up regular backups
docker run --rm -v merkle-tree-service_minio_data:/data -v $(pwd):/backup alpine tar czf /backup/minio-backup-$(date +%Y%m%d).tar.gz /data
```

### 3. Monitoring

```bash
# Monitor with PM2
pm2 monit

# Check Docker container logs
docker logs merkle-minio
docker logs merkle-redis

# Monitor MinIO metrics
curl http://your-ec2-public-ip:9000/metrics
```

### 4. Scaling Considerations

- **MinIO Clustering**: For high availability, set up MinIO in cluster mode
- **Load Balancing**: Use ALB if running multiple service instances
- **Separate Redis**: Consider using AWS ElastiCache for Redis
- **External S3**: Switch to AWS S3 by changing endpoint configuration

## Migration from PostgreSQL

If migrating from existing PostgreSQL setup:

### 1. Export Existing Data

```bash
# Create migration script to export PostgreSQL data to S3
node scripts/migrate-pg-to-s3.js
```

### 2. Switch Storage Mode

```bash
# Update .env file
S3_ENABLED=true

# Restart service
pm2 restart merkle-service
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   sudo chown -R ec2-user:ec2-user /home/ec2-user/merkle-tree-service
   ```

2. **MinIO Not Accessible**
   ```bash
   # Check if container is running
   docker ps
   
   # Check logs
   docker logs merkle-minio
   ```

3. **Bucket Creation Fails**
   ```bash
   # Create bucket manually using MinIO console or AWS CLI
   aws s3 --endpoint-url http://localhost:9000 mb s3://merkle-trees
   ```

4. **Service Won't Start**
   ```bash
   # Check application logs
   pm2 logs merkle-service
   
   # Check system resources
   free -h
   df -h
   ```

## Performance Testing

```bash
# Test S3 performance
npm run test:redis:perf

# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health

# Create curl-format.txt:
echo "     time_namelookup:  %{time_namelookup}\n      time_connect:  %{time_connect}\n   time_appconnect:  %{time_appconnect}\n  time_pretransfer:  %{time_pretransfer}\n     time_redirect:  %{time_redirect}\n    time_starttransfer:  %{time_starttransfer}\n                     ----------\n        time_total:  %{time_total}\n" > curl-format.txt
```

This setup provides a robust, scalable solution using MinIO as your S3-compatible storage backend on EC2.
