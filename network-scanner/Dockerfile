FROM python:3.9-slim

# Install nmap and other required system packages
RUN apt-get update && \
    apt-get install -y \
    nmap \
    python3-dev \
    gcc \
    libpython3-dev \
    sqlite3 \
    dnsutils \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install requirements first (for better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the source code
COPY src/ .

# Make the script executable
RUN chmod +x scanner.py

# Ensure data directory exists and has right permissions
RUN mkdir -p /data && chmod 777 /data

# Run as root for nmap capabilities
USER root

# Add database check to startup
CMD ["sh", "-c", "sqlite3 /data/network_scans.db '.tables' && python scanner.py"] 