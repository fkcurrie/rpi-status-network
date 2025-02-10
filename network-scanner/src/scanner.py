import nmap
import sqlite3
import time
import socket
import subprocess
from datetime import datetime
import requests
import logging
from tzlocal import get_localzone
import netifaces

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_manufacturer(mac_address):
    try:
        # Use macvendors.co API to get manufacturer info
        response = requests.get(f'https://api.macvendors.com/{mac_address}', timeout=2)
        if response.status_code == 200:
            return response.text
    except:
        pass
    return None

def get_hostname(ip, dns_server='10.0.0.1'):
    """Get hostname using nslookup against local DNS server"""
    try:
        # First try nslookup
        result = subprocess.run(
            ['nslookup', ip, dns_server],
            capture_output=True,
            text=True,
            timeout=2
        )
        
        # Parse nslookup output
        for line in result.stdout.splitlines():
            if 'name = ' in line.lower():
                # Extract full name and remove trailing dot
                full_name = line.split('=')[1].strip().rstrip('.')
                # Get just the hostname (first part before any domain)
                hostname = full_name.split('.')[0]
                logging.debug(f"Found hostname for {ip}: {hostname}")
                return hostname
        
        # Fallback to socket if nslookup fails
        full_name = socket.gethostbyaddr(ip)[0]
        return full_name.split('.')[0]  # Return just the hostname part
        
    except (subprocess.SubprocessError, socket.herror, subprocess.TimeoutExpired) as e:
        logging.debug(f"Hostname lookup failed for {ip}: {str(e)}")
        return None

def get_local_ip():
    """Get the IP address of wlan0 interface"""
    try:
        # Try wlan0 first
        if 'wlan0' in netifaces.interfaces():
            addrs = netifaces.ifaddresses('wlan0')
            if netifaces.AF_INET in addrs:
                return addrs[netifaces.AF_INET][0]['addr']
        
        # Fallback to first non-loopback interface
        for iface in netifaces.interfaces():
            if iface != 'lo':  # Skip loopback
                addrs = netifaces.ifaddresses(iface)
                if netifaces.AF_INET in addrs:
                    return addrs[netifaces.AF_INET][0]['addr']
    except Exception as e:
        logging.error(f"Error getting local IP: {str(e)}")
    return None

def quick_device_scan(nm, host):
    """Get basic device information without detailed port scanning"""
    basic_info = {
        'ip_address': host,
        'hostname': None,
        'mac_address': None,
        'manufacturer': None,
        'os_info': 'Scanning...',
        'is_active': True
    }
    
    if 'addresses' in nm[host]:
        if 'mac' in nm[host]['addresses']:
            basic_info['mac_address'] = nm[host]['addresses']['mac']
            basic_info['manufacturer'] = get_manufacturer(basic_info['mac_address'])
        basic_info['hostname'] = get_hostname(host)
    
    return basic_info

def detailed_device_scan(nm, host, cursor, scan_id, device_id):
    """Perform detailed port and OS scan for a device"""
    logging.info(f"Starting detailed scan for {host}")
    try:
        port_scan = nm.scan(
            host, 
            arguments='-sS -sV -O --osscan-guess --version-intensity 5 -p 21-23,25,53,80,110,139,443,445,3306,3389,5000,8080'
        )
        host_data = port_scan['scan'].get(host, {})
        
        # Get OS info
        os_info = 'Unknown'
        if 'osmatch' in host_data and len(host_data['osmatch']) > 0:
            os_info = host_data['osmatch'][0]['name']
            logging.info(f"OS detected: {os_info}")

        # Update device OS info
        cursor.execute('''
            UPDATE devices 
            SET os_info = ?
            WHERE id = ?
        ''', (os_info, device_id))

        # Store port scan results
        if 'tcp' in host_data:
            for port, port_data in host_data['tcp'].items():
                cursor.execute('''
                    INSERT INTO port_scans (
                        device_id, scan_id, port_number, protocol,
                        service, version
                    ) VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    device_id, scan_id, port,
                    'tcp', port_data.get('name', ''),
                    port_data.get('version', '')
                ))
        
        cursor.connection.commit()
        logging.info(f"Detailed scan completed for {host}")
        
    except Exception as e:
        logging.error(f"Error during detailed scan of {host}: {str(e)}")

def scan_network():
    logging.info("Starting new network scan...")
    try:
        nm = nmap.PortScanner()
        
        # Get local IP
        local_ip = get_local_ip()
        if local_ip:
            logging.info(f"Local IP address: {local_ip}")
            # Get subnet from local IP (assuming /24)
            subnet = '.'.join(local_ip.split('.')[:-1]) + '.0/24'
        else:
            logging.warning("Could not determine local IP, using default subnet")
            subnet = '10.0.0.0/24'
        
        # Connect to database
        conn = sqlite3.connect('/data/network_scans.db')
        cursor = conn.cursor()
        logging.info("Connected to database successfully")

        # Get local timezone
        local_tz = get_localzone()
        current_time = datetime.now(local_tz).isoformat()
        logging.info(f"Current local time: {current_time}")

        # Debug: Check if tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        logging.info(f"Existing tables: {tables}")

        # Create new scan record
        cursor.execute('INSERT INTO network_scans DEFAULT VALUES')
        scan_id = cursor.lastrowid
        logging.info(f"Created new scan record with ID: {scan_id}")

        # Initial quick scan for device discovery
        logging.info(f"Starting network discovery scan on {subnet}...")
        nm.scan(hosts=subnet, arguments='-sn -PR -PS22,80,443 --max-retries 2 --min-parallelism 10')
        
        discovered_hosts = nm.all_hosts()
        logging.info(f"Discovered {len(discovered_hosts)} hosts")
        
        # Add local system to discovered hosts if not already present
        if local_ip and local_ip not in discovered_hosts:
            discovered_hosts.append(local_ip)
            logging.info(f"Added local system ({local_ip}) to scan list")

        # First pass: Quick scan and basic info storage
        devices_added = 0
        for host in discovered_hosts:
            try:
                basic_info = quick_device_scan(nm, host)
                if basic_info['mac_address']:  # Only store devices with MAC addresses
                    cursor.execute('''
                        INSERT INTO devices (
                            ip_address, hostname, mac_address, manufacturer, os_info,
                            first_seen, last_seen, is_active, last_scan_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                        ON CONFLICT(mac_address) DO UPDATE SET
                            ip_address=?,
                            hostname=COALESCE(?, hostname),
                            manufacturer=COALESCE(?, manufacturer),
                            last_seen=?,
                            is_active=1,
                            last_scan_id=?
                    ''', (
                        basic_info['ip_address'], basic_info['hostname'],
                        basic_info['mac_address'], basic_info['manufacturer'],
                        basic_info['os_info'], current_time, current_time, scan_id,
                        # Values for UPDATE
                        basic_info['ip_address'], basic_info['hostname'],
                        basic_info['manufacturer'], current_time, scan_id
                    ))
                    conn.commit()
                    devices_added += 1
                    logging.info(f"Stored basic info for {host} (MAC: {basic_info['mac_address']})")

            except Exception as e:
                logging.error(f"Error processing basic info for {host}: {str(e)}")
                continue

        logging.info(f"Added/updated {devices_added} devices in this scan")

        # Debug: Check current device count
        cursor.execute("SELECT COUNT(*) FROM devices")
        device_count = cursor.fetchone()[0]
        logging.info(f"Total devices in database: {device_count}")

        # Second pass: Detailed scanning
        for host in discovered_hosts:
            try:
                # Get device ID for the current host
                cursor.execute('''
                    SELECT id FROM devices 
                    WHERE ip_address = ? AND last_scan_id = ?
                ''', (host, scan_id))
                result = cursor.fetchone()
                if result:
                    device_id = result[0]
                    detailed_device_scan(nm, host, cursor, scan_id, device_id)
                
            except Exception as e:
                logging.error(f"Error during detailed scan phase for {host}: {str(e)}")
                continue

        # Mark inactive devices
        cursor.execute('''
            UPDATE devices 
            SET is_active = 0 
            WHERE last_scan_id != ? AND is_active = 1
        ''', (scan_id,))
        conn.commit()
        logging.info("Updated inactive devices")

    except Exception as e:
        logging.error(f"Critical error in scan_network: {str(e)}")
        if 'conn' in locals():
            conn.rollback()
    finally:
        if 'conn' in locals():
            conn.close()
            logging.info("Database connection closed")

def test_nmap():
    try:
        nm = nmap.PortScanner()
        logging.info("Nmap initialized successfully")
        return True
    except Exception as e:
        logging.error(f"Failed to initialize nmap: {str(e)}")
        return False

def main():
    logging.info("Network scanner starting up...")
    
    # Test nmap functionality
    if not test_nmap():
        logging.error("Critical: Nmap test failed, exiting")
        return
    
    print("Initializing network scanner...")
    # Ensure database tables exist
    conn = sqlite3.connect('/data/network_scans.db')
    cursor = conn.cursor()
    
    # Create tables if they don't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS network_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_time DATETIME DEFAULT (datetime('now', 'localtime'))
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT,
        hostname TEXT,
        mac_address TEXT UNIQUE,
        manufacturer TEXT,
        os_info TEXT,
        first_seen DATETIME,
        last_seen DATETIME,
        is_active BOOLEAN DEFAULT 1,
        device_type TEXT,
        open_ports TEXT,
        last_scan_id INTEGER,
        FOREIGN KEY(last_scan_id) REFERENCES network_scans(id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS port_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER,
        scan_id INTEGER,
        port_number INTEGER,
        protocol TEXT,
        service TEXT,
        version TEXT,
        FOREIGN KEY(device_id) REFERENCES devices(id),
        FOREIGN KEY(scan_id) REFERENCES network_scans(id)
    )
    ''')
    
    conn.commit()
    conn.close()
    
    print("Database tables initialized")
    
    while True:
        try:
            scan_network()
        except Exception as e:
            print(f"Error during scan: {str(e)}")
        
        # Wait 1 minute before next scan
        time.sleep(60)

if __name__ == '__main__':
    main() 