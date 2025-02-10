import psutil
import time
from flask import Flask, jsonify
import os
import platform
import socket
import requests
import distro
import netifaces

app = Flask(__name__)

def get_cpu_temperature():
    try:
        # Specific to Raspberry Pi
        with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
            temp = float(f.read()) / 1000.0
        return round(temp, 1)
    except:
        return None

def get_external_ip():
    try:
        response = requests.get('https://api.ipify.org?format=json', timeout=5)
        return response.json()['ip']
    except:
        return None

def get_isp_and_location():
    try:
        response = requests.get('http://ip-api.com/json', timeout=5)
        data = response.json()
        if data['status'] == 'success':
            return {
                'isp': data['isp'],
                'location': f"{data['city']}, {data['regionName']}, {data['country']}"
            }
    except:
        pass
    return {'isp': None, 'location': None}

def get_cpu_model():
    try:
        # Use lscpu to get CPU model name
        import subprocess
        output = subprocess.check_output(['lscpu'], universal_newlines=True)
        for line in output.split('\n'):
            if 'Model name:' in line:
                return line.split(':')[1].strip()
        return 'Unknown CPU'
    except:
        return 'Unknown CPU'

def get_system_model():
    try:
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if line.startswith('Model'):
                    return line.split(':')[1].strip()
        return 'Unknown System'
    except:
        return 'Unknown System'

def get_internal_ip():
    try:
        # Use ip command to get wlan0 IP address
        import subprocess
        cmd = "ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1"
        output = subprocess.check_output(cmd, shell=True, universal_newlines=True)
        ip = output.strip()
        if ip:
            print(f'Found wlan0 IP: {ip}')
            return ip
        print('No wlan0 IP found')
        return 'No wlan0 IP'
    except Exception as e:
        print(f'Error getting wlan0 IP: {str(e)}')
        return 'Error getting wlan0 IP'

def get_system_info():
    # Get CPU information
    cpu_info = {
        'model': platform.processor(),
        'cores': {
            'physical': psutil.cpu_count(logical=False),
            'logical': psutil.cpu_count(logical=True)
        }
    }

    # Get OS information
    if platform.system() == 'Linux':
        os_info = {
            'name': distro.name(pretty=True),
            'version': distro.version(pretty=True)
        }
    else:
        os_info = {
            'name': platform.system(),
            'version': platform.version()
        }

    # Get network information
    hostname = socket.gethostname()
    internal_ip = get_internal_ip()
    external_ip = get_external_ip()
    isp_location = get_isp_and_location()

    # Get existing metrics
    metrics = get_metrics()

    # Combine all information
    return {
        'system': {
            'name': hostname,
            'system_model': get_system_model(),
            'cpu_model': cpu_info['model'],
            'cpu_cores': cpu_info['cores'],
            'os_name': os_info['name'],
            'os_version': os_info['version'],
            'internal_ip': internal_ip,
            'external_ip': external_ip,
            'isp': isp_location['isp'],
            'location': isp_location['location']
        },
        'metrics': metrics
    }

def get_metrics():
    # Get CPU frequency and per-core usage
    cpu_freq = psutil.cpu_freq()
    freq_current = round(cpu_freq.current / 1000, 1) if cpu_freq else None
    cpu_percent_per_core = psutil.cpu_percent(interval=1, percpu=True)
    
    # Get GPU temperature (RPi specific)
    def get_gpu_temp():
        try:
            with open('/sys/class/thermal/thermal_zone1/temp', 'r') as f:
                return round(float(f.read()) / 1000.0, 1)
        except:
            return None

    # Get power consumption metrics (RPi specific)
    def get_power_metrics():
        try:
            with open('/sys/class/power_supply/vdd-3v3/power_now', 'r') as f:
                power_3v3 = int(f.read()) / 1000000  # Convert to watts
            with open('/sys/class/power_supply/vdd-5v/power_now', 'r') as f:
                power_5v = int(f.read()) / 1000000
            return {
                'total': round(power_3v3 + power_5v, 2),
                'v3': round(power_3v3, 2),
                'v5': round(power_5v, 2)
            }
        except:
            return None

    # Get fan speed (if available)
    def get_fan_speed():
        try:
            with open('/sys/class/hwmon/hwmon1/fan1_input', 'r') as f:
                return int(f.read())
        except:
            return None

    # Get memory information
    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()
    
    return {
        'cpu': {
            'percent': psutil.cpu_percent(interval=1),
            'cores': cpu_percent_per_core,
            'frequency': freq_current,
            'temperature': get_cpu_temperature()
        },
        'gpu': {
            'temperature': get_gpu_temp()
        },
        'power': get_power_metrics(),
        'fan': {
            'speed': get_fan_speed()  # RPM if available
        },
        'memory': {
            'total': round(memory.total / (1024**3), 1),
            'used': round(memory.used / (1024**3), 1),
            'percent': memory.percent,
            'swap': {
                'total': round(swap.total / (1024**3), 1),
                'used': round(swap.used / (1024**3), 1),
                'percent': swap.percent
            }
        },
        'disk': {
            'total': round(psutil.disk_usage('/').total / (1024**3), 1),
            'used': round(psutil.disk_usage('/').used / (1024**3), 1),
            'percent': psutil.disk_usage('/').percent
        },
        'network': {
            'bytes_sent': psutil.net_io_counters().bytes_sent,
            'bytes_recv': psutil.net_io_counters().bytes_recv
        }
    }

@app.route('/system')
def system_info():
    try:
        info = {
            'name': socket.gethostname(),
            'system_model': get_system_model(),
            'cpu_model': get_cpu_model(),
            'cpu_cores': {
                'physical': psutil.cpu_count(logical=False),
                'logical': psutil.cpu_count(logical=True)
            },
            'os_name': distro.name(pretty=True) if platform.system() == 'Linux' else platform.system(),
            'os_version': distro.version(pretty=True) if platform.system() == 'Linux' else platform.version(),
            'internal_ip': get_internal_ip(),
            'external_ip': get_external_ip(),
            'isp': get_isp_and_location()['isp'],
            'location': get_isp_and_location()['location']
        }
        print('Sending system info:', info)
        return jsonify(info)
    except Exception as e:
        print('Error in system_info:', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/metrics')
def metrics():
    try:
        data = get_metrics()
        print('Monitor sending metrics:', data)
        return jsonify(data)
    except Exception as e:
        print('Error in metrics:', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000) 