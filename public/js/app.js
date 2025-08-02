import { fetchMetrics, fetchServices, fetchTraces } from './api.js';
import { 
  updateTimestamp, 
  toggleTheme, 
  loadTheme, 
  showTab, 
  updateMainMetrics, 
  renderAnalyticsCharts,
  renderMetricsLogs,
  renderTracesLogs,
  initializeDateFilters,
  setupPagination
} from './ui.js';

let metricsData = [];
let tracesData = [];
let currentDateRange = { days: 7 };
let currentMetricsPage = 1;
let currentTracesPage = 1;

async function loadMetrics() {
  try {
    const data = await fetchMetrics();
    metricsData = data.metrics || [];
    updateMainMetrics(metricsData, tracesData);
  } catch (error) {
    console.error('Error loading metrics:', error);
  }
}

async function loadTraces() {
  try {
    const services = await fetchServices();
    if (services.length === 0) {
      tracesData = [];
      return;
    }

    const targetService = services.find(s => s.includes('gemini')) || 
                         services.find(s => !s.includes('jaeger')) || 
                         services[0];
    
    const data = await fetchTraces(targetService);
    tracesData = data.data || [];
    updateMainMetrics(metricsData, tracesData);
  } catch (error) {
    console.error('Error loading traces:', error);
    tracesData = [];
  }
}

async function updateAnalytics() {
  await loadMetrics();
  await loadTraces();
  
  // Filter data based on date range
  let filteredMetrics = metricsData;
  let filteredTraces = tracesData;
  
  if (currentDateRange.days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - currentDateRange.days);
    
    filteredMetrics = metricsData.filter(m => new Date(m.timestamp) >= cutoffDate);
    filteredTraces = tracesData.filter(t => {
      // Traces don't have direct timestamps, so we'll keep them all for now
      return true;
    });
  } else if (currentDateRange.start && currentDateRange.end) {
    filteredMetrics = metricsData.filter(m => {
      const timestamp = new Date(m.timestamp);
      return timestamp >= currentDateRange.start && timestamp <= currentDateRange.end;
    });
    
    filteredTraces = tracesData.filter(t => {
      // Traces don't have direct timestamps, so we'll keep them all for now
      return true;
    });
  }
  
  renderAnalyticsCharts(filteredMetrics, filteredTraces);
}

async function loadMetricsLogs() {
  try {
    const data = await fetchMetrics();
    const filter = document.getElementById('metrics-filter').value;
    renderMetricsLogs(data, filter, currentMetricsPage);
  } catch (error) {
    const metricsDiv = document.getElementById('metrics-logs-content');
    metricsDiv.innerHTML = `
      <div class="empty-state">
        <h3>❌ Error loading metrics</h3>
        <p style="color: #ff6666;">${error.message}</p>
        <button onclick="loadMetricsLogs()" class="btn">🔄 Try Again</button>
      </div>
    `;
  }
}

async function loadTracesLogs() {
  try {
    const services = await fetchServices();
    if (services.length === 0) {
      const tracesDiv = document.getElementById('traces-logs-content');
      tracesDiv.innerHTML = `
        <div class="empty-state">
          <h3>⚠️ No telemetry services detected</h3>
          <p>To see Gemini CLI traces:</p>
          <ol>
            <li><strong>Enable telemetry:</strong><br>
                <code>gemini --telemetry "analyze this project"</code></li>
            <li><strong>Or start telemetry service:</strong><br>
                <code>cd gemini-cli && npm run telemetry</code></li>
            <li><strong>Refresh this page</strong></li>
          </ol>
          <p><strong>Jaeger UI:</strong> <a href="http://localhost:16686" target="_blank" style="color: var(--gemini-cyan);">http://localhost:16686</a></p>
        </div>
      `;
      return;
    }

    const targetService = services.find(s => s.includes('gemini')) || 
                         services.find(s => !s.includes('jaeger')) || 
                         services[0];
    
    const data = await fetchTraces(targetService);
    const filter = document.getElementById('traces-filter').value;
    renderTracesLogs(data.data || [], filter, currentTracesPage);
  } catch (error) {
    const tracesDiv = document.getElementById('traces-logs-content');
    tracesDiv.innerHTML = `
      <div class="empty-state">
        <h3>❌ Error loading traces</h3>
        <p style="color: #ff6666;">${error.message}</p>
        <button onclick="loadTracesLogs()" class="btn">🔄 Try Again</button>
      </div>
    `;
  }
}

function refreshData() {
  updateTimestamp();
  const activeTab = document.querySelector('.tab-content.active');
  
  if (activeTab && activeTab.id === 'analytics') {
    updateAnalytics();
  } else if (activeTab && activeTab.id === 'metrics') {
    loadMetricsLogs();
  } else if (activeTab && activeTab.id === 'traces') {
    loadTracesLogs();
  }
}

function exportData() {
  const data = {
    metrics: metricsData,
    traces: tracesData,
    timestamp: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gemini-cli-data-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Make functions globally available
window.updateAnalytics = updateAnalytics;
window.loadMetricsLogs = loadMetricsLogs;
window.loadTracesLogs = loadTracesLogs;
window.currentDateRange = currentDateRange;
window.currentMetricsPage = currentMetricsPage;
window.currentTracesPage = currentTracesPage;

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  updateTimestamp();
  initializeDateFilters();
  setupPagination();
  
  // Initial load
  updateAnalytics();

  // Event listeners
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('refresh-btn').addEventListener('click', refreshData);
  document.getElementById('export-btn').addEventListener('click', exportData);

  // Tab switching
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      showTab(tab);
      
      // Load appropriate data for the tab
      if (tab === 'analytics') {
        updateAnalytics();
      } else if (tab === 'metrics') {
        currentMetricsPage = 1;
        loadMetricsLogs();
      } else if (tab === 'traces') {
        currentTracesPage = 1;
        loadTracesLogs();
      }
    });
  });

  // Refresh buttons for individual tabs
  document.getElementById('refresh-metrics').addEventListener('click', () => {
    currentMetricsPage = 1;
    loadMetricsLogs();
  });
  
  document.getElementById('refresh-traces').addEventListener('click', () => {
    currentTracesPage = 1;
    loadTracesLogs();
  });

  // Auto-refresh every 30 seconds for active tab
  setInterval(() => {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'analytics') {
      updateAnalytics();
    } else if (activeTab && activeTab.id === 'metrics') {
      loadMetricsLogs();
    } else if (activeTab && activeTab.id === 'traces') {
      loadTracesLogs();
    }
    updateTimestamp();
  }, 30000);
});