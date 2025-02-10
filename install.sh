#!/bin/bash

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "Installing Network Monitor System..."

# Install required system packages
echo "Installing system dependencies..."
apt-get update
apt-get install -y \
    docker.io \
    docker-compose \
    git

# Enable and start Docker service
systemctl enable docker
systemctl start docker

# Create application directory
APP_DIR="/opt/network-monitor"
mkdir -p $APP_DIR
cd $APP_DIR

# Copy application files from current directory
echo "Copying application files..."
cp -r * .

# Set correct permissions
chmod +x install.sh
chmod +x start.sh
chmod +x stop.sh

# Create data directory with correct permissions
mkdir -p data
chmod 777 data

# Build and start containers
echo "Building and starting services..."
docker-compose up --build -d

# Add systemd service for auto-start
echo "Creating systemd service..."
cat > /etc/systemd/system/network-monitor.service << EOL
[Unit]
Description=Network Monitor System
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOL

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable network-monitor
systemctl start network-monitor

echo "Installation complete!"
echo "The web interface should be available at http://localhost:3000" 