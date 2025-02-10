const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const app = express();
const port = 4000;

const MONITOR_URL = process.env.MONITOR_URL || 'http://localhost:5000';

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('/data/network_scans.db');

// Initialize database
db.serialize(() => {
  // Network scan history
  db.run(`CREATE TABLE IF NOT EXISTS network_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Devices table with more detailed information
  db.run(`CREATE TABLE IF NOT EXISTS devices (
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
  )`);

  // Port scan results
  db.run(`CREATE TABLE IF NOT EXISTS port_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER,
    scan_id INTEGER,
    port_number INTEGER,
    protocol TEXT,
    service TEXT,
    version TEXT,
    FOREIGN KEY(device_id) REFERENCES devices(id),
    FOREIGN KEY(scan_id) REFERENCES network_scans(id)
  )`);
});

// Get static system information
app.get('/api/system-info', async (req, res) => {
  try {
    const response = await fetch(`${MONITOR_URL}/system`);
    const data = await response.json();
    console.log('System info from monitor:', data);
    res.json(data);
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ error: 'Failed to fetch system information' });
  }
});

// Get dynamic metrics
app.get('/api/metrics', async (req, res) => {
  try {
    const response = await fetch(`${MONITOR_URL}/metrics`);
    const data = await response.json();
    console.log('Backend received metrics:', data);
    res.json(data);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Get network scan results with port information
app.get('/api/network-scan', async (req, res) => {
  db.all(`
    SELECT 
      ns.id,
      ns.ip_address,
      ns.hostname,
      ns.status,
      ns.timestamp,
      GROUP_CONCAT(
        json_object(
          'port', ps.port_number,
          'protocol', ps.protocol,
          'state', ps.state,
          'service', ps.service
        )
      ) as ports
    FROM network_scans ns
    LEFT JOIN port_scans ps ON ns.id = ps.scan_id
    GROUP BY ns.id
    ORDER BY ns.timestamp DESC
    LIMIT 100
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Parse the ports JSON string for each row
    const results = rows.map(row => ({
      ...row,
      ports: row.ports ? row.ports.split(',').map(p => JSON.parse(p)) : []
    }));
    
    res.json(results);
  });
});

// Get network devices with their latest information
app.get('/api/network-devices', async (req, res) => {
  console.log('Fetching network devices...');
  try {
    // First, let's check what's in our tables
    db.all("SELECT COUNT(*) as count FROM network_scans", [], (err, rows) => {
      console.log("Number of scans:", rows[0].count);
    });

    db.all("SELECT COUNT(*) as count FROM devices", [], (err, rows) => {
      console.log("Number of devices:", rows[0].count);
    });

    db.all("SELECT * FROM devices", [], (err, rows) => {
      console.log("Raw device data:", rows);
    });

    // Simplified query to just get devices first
    db.all(`
      SELECT 
        d.ip_address,
        d.hostname,
        d.mac_address,
        d.manufacturer,
        d.os_info,
        d.first_seen,
        d.last_seen,
        d.is_active
      FROM devices d
      ORDER BY d.ip_address DESC
    `, (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      try {
        console.log(`Found ${rows.length} devices`);
        console.log('Active devices:', rows.filter(d => d.is_active).length);
        res.json(rows);
      } catch (parseError) {
        console.error('Error parsing device data:', parseError);
        res.status(500).json({ error: 'Error processing device data' });
      }
    });
  } catch (error) {
    console.error('Error in network-devices endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
}); 