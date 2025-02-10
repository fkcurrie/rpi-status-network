import React from 'react';
import {
  Chart,
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function MetricsChart({ data = [], label, color, yAxisLabel, tooltipLabel, additionalLabels = [] }) {
  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];
  
  const chartData = {
    labels: Array(safeData.length).fill(''),
    datasets: [{
      label: label,
      data: safeData,
      borderColor: color,
      backgroundColor: color + '20',
      fill: true,
      tension: 0.4
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        right: 100  // Add padding for legend
      }
    },
    plugins: {
      legend: {
        position: 'right',
        align: 'center',
        labels: {
          boxWidth: 12,
          padding: 8,
          font: {
            size: 11
          },
          generateLabels: function(chart) {
            const defaultLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
            return [
              ...defaultLabels,
              ...additionalLabels
                .filter(label => label.text)
                .map(label => ({
                  text: label.text,
                  fillStyle: label.color,
                  strokeStyle: label.color,
                  lineWidth: 0,
                  hidden: false,
                  index: null,
                  fontColor: 'var(--raspberry-dark)'
                }))
            ];
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = tooltipLabel || '';
            return `${label}: ${context.parsed.y.toFixed(1)}${label.includes('%') ? '%' : ''}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        position: 'left',
        title: {
          display: true,
          text: yAxisLabel
        }
      },
      x: {
        display: false
      }
    }
  };

  return (
    <div className="metrics-chart">
      <Line data={chartData} options={options} />
    </div>
  );
}

export default MetricsChart; 