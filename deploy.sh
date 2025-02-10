#!/bin/bash

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (use sudo)"
  exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update
    apt-get install -y docker.io docker-compose
    systemctl enable docker
    systemctl start docker
fi

# Create and setup application directory
APP_DIR="/opt/network-monitor"
mkdir -p $APP_DIR/data
chmod 777 $APP_DIR/data

# Copy files to application directory
cp -r * $APP_DIR/

# Start services
cd $APP_DIR
docker-compose up --build -d

# Setup systemd service
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

# Enable and start service
systemctl daemon-reload
systemctl enable network-monitor
systemctl start network-monitor

echo "Deployment complete!"
echo "The web interface should be available at http://localhost:3000" 