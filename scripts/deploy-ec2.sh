#!/bin/bash
set -e

# ============================================================
# Napzzak EC2 Deployment Script
# Run this ON the EC2 instance after transferring the project
# ============================================================

echo "=== Napzzak EC2 Setup ==="

# 1. System packages
echo "[1/6] Installing system packages..."
sudo dnf update -y -q
sudo dnf install -y -q git nginx gcc-c++ make

# 2. Node.js 20 LTS
echo "[2/6] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo dnf install -y -q nodejs
fi
echo "  Node $(node -v), npm $(npm -v)"

# 3. ffmpeg & yt-dlp
echo "[3/6] Installing ffmpeg & yt-dlp..."
if ! command -v ffmpeg &> /dev/null; then
  cd /tmp
  curl -sL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz -o ffmpeg.tar.xz
  tar xf ffmpeg.tar.xz
  sudo cp ffmpeg-*-arm64-static/ffmpeg /usr/local/bin/
  sudo cp ffmpeg-*-arm64-static/ffprobe /usr/local/bin/
  rm -rf ffmpeg.tar.xz ffmpeg-*-arm64-static
  cd -
fi
# yt-dlp: use 2024.11.18 (last version supporting Python 3.9)
# AL2023 ships Python 3.9; yt-dlp 2025+ requires Python 3.10+
YTDLP_VERSION="2024.11.18"
if ! command -v yt-dlp &> /dev/null || ! yt-dlp --version 2>/dev/null | grep -q "$YTDLP_VERSION"; then
  sudo curl -sL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" -o /usr/local/bin/yt-dlp
  sudo chmod a+rx /usr/local/bin/yt-dlp
fi

# 4. PM2
echo "[4/6] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

# 5. App setup
echo "[5/6] Setting up application..."
cd /home/ec2-user/napzzak

# Create .env.local (uses IAM role — no AWS_PROFILE needed)
cat > .env.local <<'EOF'
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=637423378549
S3_BUCKET_NAME=napzzak-videos-637423378549
DYNAMODB_TABLE_NAME=napzzak-jobs-637423378549
EOF

npm install
npm run build

# Start with PM2
pm2 delete napzzak 2>/dev/null || true
pm2 start npm --name napzzak -- start
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user | tail -1 | sudo bash

# 6. Nginx reverse proxy
echo "[6/6] Configuring Nginx..."
sudo tee /etc/nginx/conf.d/napzzak.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 500M;

    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Remove default server block if it conflicts
sudo rm -f /etc/nginx/conf.d/default.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo ""
echo "=== Deployment Complete ==="
echo "App is running at http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo ""
echo "Useful commands:"
echo "  pm2 logs napzzak    — View app logs"
echo "  pm2 restart napzzak — Restart app"
echo "  pm2 monit           — Monitor resources"
