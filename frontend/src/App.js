import React, { useState, useEffect } from 'react';
import './App.css';
import MetricsChart from './components/MetricsChart';
import { Line } from 'react-chartjs-2';
import ErrorBoundary from './components/ErrorBoundary';

function getMetricColor(value) {
  if (value <= 30) return 'var(--metric-good)';
  if (value <= 60) return 'var(--metric-normal)';
  if (value <= 80) return 'var(--metric-warning)';
  return 'var(--metric-critical)';
}

function SystemInfo({ data }) {
  console.log('SystemInfo render with data:', data);
  
  const metrics = {
    cpu: {
      percent: 0,
      cores: [],
      frequency: null,
      temperature: null,
      ...data?.cpu
    },
    memory: {
      total: 0,
      used: 0,
      percent: 0,
      swap: null,
      ...data?.memory
    },
    disk: {
      total: 0,
      used: 0,
      percent: 0,
      ...data?.disk
    },
    network: {
      bytes_sent: 0,
      bytes_recv: 0,
      prev_bytes_sent: 0,
      prev_bytes_recv: 0,
      ...data?.network
    },
    gpu: {
      temperature: null,
      ...data?.gpu
    },
    fan: {
      speed: null,
      ...data?.fan
    },
    power: {
      total: null,
      v3: null,
      v5: null,
      ...data?.power
    }
  };

  // Calculate network speed in MB/s
  const networkSpeed = {
    sent: ((metrics.network.bytes_sent - (metrics.network.prev_bytes_sent || 0)) / 2) / (1024 * 1024),
    received: ((metrics.network.bytes_recv - (metrics.network.prev_bytes_recv || 0)) / 2) / (1024 * 1024)
  };

  return (
    <div className="system-info">
      <div className="metrics-display">
        {/* CPU Section */}
        <div className="metric">
          <span className="metric-label">CPU</span>
          <div className="metric-row">
            <span className="metric-value" style={{ color: getMetricColor(metrics.cpu.percent) }}>
              {metrics.cpu.percent}%
            </span>
            <span className="metric-subtext">{metrics.cpu.frequency}GHz</span>
          </div>
          <div className="core-metrics">
            {metrics.cpu.cores.map((usage, index) => (
              <div key={index} className="core-usage">
                <span className="core-label">C{index}</span>
                <span className="core-value" style={{ color: getMetricColor(usage) }}>
                  {usage}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="metric-divider" />

        {/* Memory Section */}
        <div className="metric">
          <span className="metric-label">Memory</span>
          <div className="metric-row">
            <div className="memory-type">
              <span className="metric-value" style={{ color: getMetricColor(metrics.memory.percent) }}>
                {metrics.memory.percent}%
              </span>
              <span className="metric-subtext">RAM: {metrics.memory.used}/{metrics.memory.total}GB</span>
            </div>
            <div className="memory-type">
              <span className="metric-value" style={{ color: getMetricColor(metrics.memory.swap?.percent || 0) }}>
                {metrics.memory.swap?.percent || 0}%
              </span>
              <span className="metric-subtext">Swap</span>
            </div>
          </div>
        </div>

        <div className="metric-divider" />

        {/* Network Section */}
        <div className="metric">
          <span className="metric-label">Network</span>
          <div className="metric-row">
            <span className="metric-value">↑{networkSpeed.sent.toFixed(1)}</span>
            <span className="metric-value">↓{networkSpeed.received.toFixed(1)}</span>
            <span className="metric-subtext">MB/s</span>
          </div>
        </div>

        <div className="metric-divider" />

        {/* Thermals Section */}
        <div className="metric">
          <span className="metric-label">Thermals</span>
          <div className="metric-row">
            <span className="metric-value">{metrics.cpu.temperature}°C</span>
            {metrics.gpu?.temperature && (
              <span className="metric-value">{metrics.gpu.temperature}°C</span>
            )}
            {metrics.fan?.speed && (
              <span className="metric-subtext">{metrics.fan.speed}RPM</span>
            )}
          </div>
        </div>

        {metrics.power && (
          <>
            <div className="metric-divider" />
            <div className="metric">
              <span className="metric-label">Power</span>
              <div className="metric-row">
                <span className="metric-value">{metrics.power.total}W</span>
                <span className="metric-subtext">
                  3.3V:{metrics.power.v3}W 5V:{metrics.power.v5}W
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NetworkDevicesTable({ devices }) {
  console.log('NetworkDevicesTable render with devices:', devices);
  
  // Ensure devices is an array
  const safeDevices = Array.isArray(devices) ? devices : [];
  console.log('Safe devices array:', safeDevices);
  
  const [sortConfig, setSortConfig] = useState({
    key: 'ip_address',
    direction: 'desc'
  });

  const sortedDevices = React.useMemo(() => {
    let sortedItems = [...safeDevices];
    sortedItems.sort((a, b) => {
      if (!a || !b) return 0;
      
      if (sortConfig.key === 'ip_address') {
        // Special sorting for IP addresses
        const ipA = (a[sortConfig.key] || '').split('.').map(num => parseInt(num, 10));
        const ipB = (b[sortConfig.key] || '').split('.').map(num => parseInt(num, 10));
        for (let i = 0; i < 4; i++) {
          if (ipA[i] !== ipB[i]) {
            return sortConfig.direction === 'asc' ? ipA[i] - ipB[i] : ipB[i] - ipA[i];
          }
        }
        return 0;
      } else if (sortConfig.key.includes('seen')) {
        // Sort dates
        const dateA = new Date(a[sortConfig.key] || 0);
        const dateB = new Date(b[sortConfig.key] || 0);
        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        // Default string sorting
        const valA = a[sortConfig.key] || '';
        const valB = b[sortConfig.key] || '';
        if (valA < valB) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      }
    });
    return sortedItems;
  }, [safeDevices, sortConfig]);

  const requestSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  // Helper function to check if device is stale
  const isDeviceStale = (lastSeen) => {
    if (!lastSeen) return true;
    const lastSeenTime = new Date(lastSeen);
    const currentTime = new Date();
    // If last seen is more than 2 minutes ago, consider it stale
    return (currentTime - lastSeenTime) > 2 * 60 * 1000;
  };

  return (
    <div className="network-scans">
      <h2>Network Devices ({safeDevices.length})</h2>
      {safeDevices.length === 0 ? (
        <div className="no-devices">No network devices found</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th onClick={() => requestSort('ip_address')} className="sortable">
                IP Address {getSortIcon('ip_address')}
              </th>
              <th onClick={() => requestSort('mac_address')} className="sortable">
                MAC Address {getSortIcon('mac_address')}
              </th>
              <th onClick={() => requestSort('manufacturer')} className="sortable">
                Manufacturer {getSortIcon('manufacturer')}
              </th>
              <th onClick={() => requestSort('hostname')} className="sortable">
                Hostname {getSortIcon('hostname')}
              </th>
              <th onClick={() => requestSort('os_info')} className="sortable">
                Operating System {getSortIcon('os_info')}
              </th>
              <th onClick={() => requestSort('first_seen')} className="sortable">
                First Seen {getSortIcon('first_seen')}
              </th>
              <th onClick={() => requestSort('last_seen')} className="sortable">
                Last Seen {getSortIcon('last_seen')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDevices.map((device, index) => (
              <tr 
                key={device.mac_address || index}
                className={isDeviceStale(device.last_seen) ? 'stale-device' : ''}
              >
                <td>{device.ip_address || 'Unknown'}</td>
                <td>{device.mac_address || 'Unknown'}</td>
                <td>{device.manufacturer || 'Unknown'}</td>
                <td>{device.hostname || 'Unknown'}</td>
                <td>{device.os_info || 'Unknown'}</td>
                <td>{device.first_seen ? new Date(device.first_seen).toLocaleString() : 'Unknown'}</td>
                <td>{device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SystemHeader({ data }) {
  console.log('SystemHeader data:', data);

  if (!data) return null;
  
  return (
    <div className="system-header">
      {data.system_model && (
        <div className="system-model">
          {data.system_model}
        </div>
      )}
      <div className="system-details">
        <div className="detail-group">
          <h3>CPU</h3>
          <p>{data.cpu_model || 'Unknown'}</p>
          <p>{data.cpu_cores?.physical || 0} Physical Cores ({data.cpu_cores?.logical || 0} Logical)</p>
        </div>
        <div className="detail-group">
          <h3>Operating System</h3>
          <p>{data.os_name || 'Unknown'}</p>
          <p>Version: {data.os_version || 'Unknown'}</p>
        </div>
        <div className="detail-group">
          <h3>Network</h3>
          <p>Internal IP: {data.internal_ip || 'Unknown'}</p>
          <p>External IP: {data.external_ip || 'Unknown'}</p>
        </div>
        <div className="detail-group">
          <h3>Location</h3>
          <p>ISP: {data.isp || 'Unknown'}</p>
          <p>Location: {data.location || 'Unknown'}</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [systemInfo, setSystemInfo] = useState(null);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [networkDevices, setNetworkDevices] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState({
    system: true,
    metrics: true,
    network: true
  });

  // Dynamic metrics updates
  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch('http://localhost:4000/api/metrics');
        const metrics = await response.json();
        setSystemMetrics(metrics);
        setError(null);
      } catch (err) {
        console.error('Error fetching metrics:', err);
        setError('Failed to fetch metrics');
      } finally {
        setLoading(prev => ({ ...prev, metrics: false }));
      }
    }

    fetchMetrics();
    const metricsInterval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(metricsInterval);
  }, []);

  // System info updates
  useEffect(() => {
    async function fetchSystemInfo() {
      try {
        const response = await fetch('http://localhost:4000/api/system-info');
        const data = await response.json();
        setSystemInfo(data.system || data);
      } catch (error) {
        console.error('Error fetching system info:', error);
        setError('Failed to load system information');
      } finally {
        setLoading(prev => ({ ...prev, system: false }));
      }
    }

    fetchSystemInfo();
    const systemInfoInterval = setInterval(fetchSystemInfo, 60000);
    return () => clearInterval(systemInfoInterval);
  }, []);

  // Network devices updates
  useEffect(() => {
    async function fetchDevices() {
      try {
        const response = await fetch('http://localhost:4000/api/network-devices');
        const devices = await response.json();
        console.log('Received network devices:', devices);
        setNetworkDevices(devices || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching network devices:', err);
        setError('Failed to fetch network devices');
      } finally {
        setLoading(prev => ({ ...prev, network: false }));
      }
    }

    fetchDevices();
    const networkInterval = setInterval(fetchDevices, 30000);
    return () => clearInterval(networkInterval);
  }, []);

  // Only show loading when all components are loading
  if (loading.system && loading.metrics && loading.network) {
    return (
      <div className="App">
        <div className="loading">Loading system information...</div>
      </div>
    );
  }

  return (
    <>
      <div className="App">
        {error && <div className="error-message">{error}</div>}
        <ErrorBoundary>
          {!loading.metrics && <SystemInfo data={systemMetrics} />}
        </ErrorBoundary>
        <ErrorBoundary>
          {!loading.network && <NetworkDevicesTable devices={networkDevices} />}
        </ErrorBoundary>
      </div>
      <div className="system-footer">
        <div className="system-footer-content">
          <h1>System Information</h1>
          <ErrorBoundary>
            {!loading.system && <SystemHeader data={systemInfo} />}
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}

export default App; 