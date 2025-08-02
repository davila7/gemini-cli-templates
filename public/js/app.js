import { fetchMetrics, fetchServices, fetchTraces } from './api.js';
import { 
  updateTimestamp, 
  toggleTheme, 
  loadTheme, 
  showTab, 
  updateMainMetrics, 
  renderMetrics, 
  renderTraces, 
  renderTokenChart 
} from './ui.js';

let metricsData = [];
let tracesData = [];

async function loadMetrics() {
  try {
    const data = await fetchMetrics();
    metricsData = data.metrics || [];
    updateMainMetrics(metricsData, tracesData);
    renderMetrics(data);
    renderTokenChart(metricsData);
  } catch (error) {
    const metricsDiv = document.getElementById('metrics-content');
    metricsDiv.innerHTML = `
      <div class="empty-state">
        <h3>❌ Error loading metrics</h3>
        <p style="color: #ff6666;">${error.message}</p>
        <button onclick="window.location.reload()" class="btn">
          🔄 Try Again
        </button>
      </div>
    `;
  }
}

async function loadTraces() {
  const services = await fetchServices();
  const tracesDiv = document.getElementById('traces-content');
  
  if (services.length === 0) {
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
  
  try {
    const data = await fetchTraces(targetService);
    tracesData = data.data || [];
    renderTraces(tracesData, targetService);
    updateMainMetrics(metricsData, tracesData);
  } catch (error) {
    tracesDiv.innerHTML = `
      <div class="empty-state">
        <h3>❌ Error loading traces</h3>
        <p style="color: #ff6666;">${error.message}</p>
        <button onclick="window.location.reload()" class="btn">🔄 Try Again</button>
      </div>
    `;
  }
}

function refreshData() {
  updateTimestamp();
  loadMetrics();
  loadTraces();
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

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  updateTimestamp();
  loadMetrics();
  loadTraces();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('refresh-btn').addEventListener('click', refreshData);
  document.getElementById('export-btn').addEventListener('click', exportData);

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      showTab(tab);
      if (tab === 'overview') {
        loadMetrics();
      } else if (tab === 'traces') {
        loadTraces();
      }
    });
  });

  setInterval(() => {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'overview') {
      loadMetrics();
    } else if (activeTab && activeTab.id === 'traces') {
      loadTraces();
    }
    updateTimestamp();
  }, 30000);
});