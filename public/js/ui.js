let charts = {};
let currentDateRange = { days: 7 };
let currentMetricsPage = 1;
let currentTracesPage = 1;
const itemsPerPage = 20;

export function updateTimestamp() {
  document.getElementById('timestamp').textContent = new Date().toLocaleTimeString();
}

export function toggleTheme() {
  const body = document.body;
  const themeToggle = document.getElementById('theme-toggle');
  
  if (body.getAttribute('data-theme') === 'light') {
    body.removeAttribute('data-theme');
    themeToggle.innerHTML = '🌙 Dark';
    localStorage.setItem('theme', 'dark');
  } else {
    body.setAttribute('data-theme', 'light');
    themeToggle.innerHTML = '☀️ Light';
    localStorage.setItem('theme', 'light');
  }
}

export function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  const themeToggle = document.getElementById('theme-toggle');
  
  if (savedTheme === 'light') {
    document.body.setAttribute('data-theme', 'light');
    themeToggle.innerHTML = '☀️ Light';
  } else {
    themeToggle.innerHTML = '🌙 Dark';
  }
}

export function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  document.getElementById(tabName).classList.add('active');
  document.querySelector(`.tab-button[data-tab="${tabName}"]`).classList.add('active');
}

export function initializeDateFilters() {
  const presets = document.querySelectorAll('.filter-preset');
  const customInputs = document.getElementById('custom-date-inputs');
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  
  // Set default date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  startDateInput.value = startDate.toISOString().slice(0, 16);
  endDateInput.value = endDate.toISOString().slice(0, 16);
  
  presets.forEach(preset => {
    preset.addEventListener('click', () => {
      presets.forEach(p => p.classList.remove('active'));
      preset.classList.add('active');
      
      const range = preset.dataset.range;
      if (range === 'custom') {
        customInputs.style.display = 'flex';
      } else {
        customInputs.style.display = 'none';
        currentDateRange = { days: parseInt(range) };
        updateAnalytics();
      }
    });
  });
  
  document.getElementById('apply-filter').addEventListener('click', () => {
    const start = new Date(startDateInput.value);
    const end = new Date(endDateInput.value);
    currentDateRange = { start, end };
    updateAnalytics();
  });
}

export function updateMainMetrics(metrics, traces) {
  const sessionIds = [...new Set(metrics.map(m => m.sessionId))];
  const totalSessions = sessionIds.length;
  
  const toolMetrics = metrics.filter(m => m.name && (m.name.includes('tool') || m.attributes?.operation));
  const totalTools = toolMetrics.reduce((sum, m) => sum + m.value, 0);
  
  const tokenMetrics = metrics.filter(m => m.name && m.name.includes('token'));
  const inputTokens = tokenMetrics.filter(m => m.attributes?.type === 'input').reduce((sum, m) => sum + m.value, 0);
  const outputTokens = tokenMetrics.filter(m => m.attributes?.type === 'output').reduce((sum, m) => sum + m.value, 0);
  const cachedTokens = tokenMetrics.filter(m => m.attributes?.type === 'cached').reduce((sum, m) => sum + m.value, 0);
  const thoughtsTokens = tokenMetrics.filter(m => m.attributes?.type === 'thoughts').reduce((sum, m) => sum + m.value, 0);
  const totalTokens = inputTokens + outputTokens + cachedTokens + thoughtsTokens;
  
  const apiCalls = traces.reduce((sum, trace) => sum + trace.spans.filter(s => s.operationName.includes('gemini.api')).length, 0);
  const avgDuration = traces.length > 0 ? Math.round(traces.reduce((sum, trace) => {
    const apiSpans = trace.spans.filter(s => s.operationName.includes('gemini.api'));
    return sum + apiSpans.reduce((spanSum, span) => spanSum + span.duration, 0) / (apiSpans.length || 1);
  }, 0) / traces.length / 1000) : 0;

  document.getElementById('total-sessions').textContent = totalSessions;
  document.getElementById('sessions-week').textContent = totalSessions;
  document.getElementById('sessions-active').textContent = sessionIds.length > 0 ? '1' : '0';
  
  document.getElementById('total-tools').textContent = totalTools.toLocaleString();
  document.getElementById('tools-week').textContent = totalTools.toLocaleString();
  document.getElementById('tools-success').textContent = '100%';
  
  document.getElementById('total-tokens').textContent = totalTokens.toLocaleString();
  document.getElementById('tokens-input').textContent = inputTokens.toLocaleString();
  document.getElementById('tokens-output').textContent = outputTokens.toLocaleString();
  
  // Update cached and thoughts tokens if elements exist
  const cachedElement = document.getElementById('tokens-cached');
  const thoughtsElement = document.getElementById('tokens-thoughts');
  if (cachedElement) cachedElement.textContent = cachedTokens.toLocaleString();
  if (thoughtsElement) thoughtsElement.textContent = thoughtsTokens.toLocaleString();
  
  document.getElementById('total-apis').textContent = apiCalls.toLocaleString();
  document.getElementById('api-duration').textContent = `${avgDuration}ms`;
  document.getElementById('api-success').textContent = '100%';

  if (sessionIds.length > 0) {
    const currentSession = document.getElementById('current-session');
    currentSession.style.display = 'block';
    document.getElementById('session-detail').textContent = `Session ID: ${sessionIds[0].substring(0, 8)}...`;
  }
}

export function renderAnalyticsCharts(metrics, traces) {
  renderTokenChart(metrics);
  renderSessionsChart(metrics);
  renderResponseTimesChart(traces, metrics);
  renderToolsChart(metrics);
  
  // Update chart summaries
  const tokenMetrics = metrics.filter(m => m.name && m.name.includes('token'));
  const totalTokens = tokenMetrics.reduce((sum, m) => sum + m.value, 0);
  document.getElementById('total-tokens-chart').textContent = totalTokens.toLocaleString();
  
  const sessionIds = [...new Set(metrics.map(m => m.sessionId))];
  document.getElementById('total-sessions-chart').textContent = sessionIds.length;
  
  const toolMetrics = metrics.filter(m => m.name && (m.name.includes('tool') || m.attributes?.operation));
  const totalTools = toolMetrics.reduce((sum, m) => sum + m.value, 0);
  document.getElementById('total-tools-chart').textContent = totalTools.toLocaleString();
  
  // Calculate average response time from actual metrics
  const responseTimeMetrics = metrics.filter(m => m.name && m.name.includes('response_time'));
  const avgResponseTime = responseTimeMetrics.length > 0 
    ? Math.round(responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length)
    : 0;
  document.getElementById('avg-response-time').textContent = `${avgResponseTime}ms`;
}

export function renderTokenChart(metrics) {
  const tokenMetrics = metrics.filter(m => m.name && m.name.includes('token'));
  const inputTokens = tokenMetrics.filter(m => m.attributes?.type === 'input').reduce((sum, m) => sum + m.value, 0);
  const outputTokens = tokenMetrics.filter(m => m.attributes?.type === 'output').reduce((sum, m) => sum + m.value, 0);
  const cachedTokens = tokenMetrics.filter(m => m.attributes?.type === 'cached').reduce((sum, m) => sum + m.value, 0);
  const thoughtsTokens = tokenMetrics.filter(m => m.attributes?.type === 'thoughts').reduce((sum, m) => sum + m.value, 0);

  const ctx = document.getElementById('token-chart').getContext('2d');
  
  if (charts.tokenChart) {
    charts.tokenChart.destroy();
  }

  const chartData = [];
  const chartLabels = [];
  const backgroundColors = [];
  const borderColors = [];
  
  if (inputTokens > 0) {
    chartData.push(inputTokens);
    chartLabels.push('Input Tokens');
    backgroundColors.push('rgba(255, 99, 132, 0.8)');
    borderColors.push('rgba(255, 99, 132, 1)');
  }
  
  if (outputTokens > 0) {
    chartData.push(outputTokens);
    chartLabels.push('Output Tokens');
    backgroundColors.push('rgba(54, 162, 235, 0.8)');
    borderColors.push('rgba(54, 162, 235, 1)');
  }
  
  if (cachedTokens > 0) {
    chartData.push(cachedTokens);
    chartLabels.push('Cached Tokens');
    backgroundColors.push('rgba(75, 192, 192, 0.8)');
    borderColors.push('rgba(75, 192, 192, 1)');
  }
  
  if (thoughtsTokens > 0) {
    chartData.push(thoughtsTokens);
    chartLabels.push('Thoughts Tokens');
    backgroundColors.push('rgba(255, 206, 86, 0.8)');
    borderColors.push('rgba(255, 206, 86, 1)');
  }

  charts.tokenChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Token Usage',
        data: chartData,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#ffffff',
            font: { family: 'Monaco, monospace', size: 11 }
          }
        }
      }
    }
  });
}

export function renderSessionsChart(metrics) {
  const ctx = document.getElementById('sessions-chart').getContext('2d');
  
  if (charts.sessionsChart) {
    charts.sessionsChart.destroy();
  }

  // Group metrics by date
  const sessionsByDate = {};
  metrics.forEach(metric => {
    const date = new Date(metric.timestamp).toDateString();
    if (!sessionsByDate[date]) {
      sessionsByDate[date] = new Set();
    }
    sessionsByDate[date].add(metric.sessionId);
  });

  const dates = Object.keys(sessionsByDate).slice(-7);
  const sessionCounts = dates.map(date => sessionsByDate[date].size);

  charts.sessionsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Sessions',
        data: sessionCounts,
        backgroundColor: 'rgba(0, 206, 209, 0.8)',
        borderColor: 'rgba(0, 206, 209, 1)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff',
            font: { family: 'Monaco, monospace', size: 11 }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#ffffff' },
          grid: { color: '#333333' }
        },
        x: {
          ticks: { color: '#ffffff' },
          grid: { color: '#333333' }
        }
      }
    }
  });
}

export function renderResponseTimesChart(traces, metrics = []) {
  const ctx = document.getElementById('response-times-chart').getContext('2d');
  
  if (charts.responseChart) {
    charts.responseChart.destroy();
  }

  // Use actual API response time metrics if available, otherwise fallback to traces
  const responseTimeMetrics = metrics.filter(m => m.name && m.name.includes('response_time'));
  
  let responseTimes = [];
  if (responseTimeMetrics.length > 0) {
    // Use actual API response time data from metrics
    responseTimes = responseTimeMetrics
      .slice(-20)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((metric, index) => ({
        x: index + 1,
        y: metric.value,
        timestamp: metric.timestamp
      }));
  } else if (traces && traces.length > 0) {
    // Fallback to trace data
    responseTimes = traces.slice(-20).map((trace, index) => {
      if (trace.spans && trace.spans.length > 0) {
        const maxDuration = Math.max(...trace.spans.map(s => s.duration || 0));
        return {
          x: index + 1,
          y: maxDuration / 1000
        };
      }
      return { x: index + 1, y: 0 };
    });
  } else {
    // No data available - show placeholder
    responseTimes = [
      {x: 1, y: 0},
      {x: 2, y: 0},
      {x: 3, y: 0}
    ];
  }

  charts.responseChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Response Time (ms)',
        data: responseTimes,
        borderColor: 'rgba(255, 20, 147, 1)',
        backgroundColor: 'rgba(255, 20, 147, 0.2)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff',
            font: { family: 'Monaco, monospace', size: 11 }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#ffffff' },
          grid: { color: '#333333' }
        },
        x: {
          ticks: { color: '#ffffff' },
          grid: { color: '#333333' }
        }
      }
    }
  });
}

export function renderToolsChart(metrics) {
  const ctx = document.getElementById('tools-chart').getContext('2d');
  
  if (charts.toolsChart) {
    charts.toolsChart.destroy();
  }

  const toolMetrics = metrics.filter(m => m.name && m.name.includes('tool'));
  const toolsByType = {};
  
  toolMetrics.forEach(metric => {
    const operation = metric.attributes?.operation || 'unknown';
    toolsByType[operation] = (toolsByType[operation] || 0) + metric.value;
  });

  const labels = Object.keys(toolsByType);
  const data = Object.values(toolsByType);
  const colors = [
    'rgba(30, 144, 255, 0.8)',
    'rgba(138, 43, 226, 0.8)',
    'rgba(255, 20, 147, 0.8)',
    'rgba(0, 206, 209, 0.8)',
    'rgba(255, 206, 86, 0.8)'
  ];

  charts.toolsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tool Usage',
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff',
            font: { family: 'Monaco, monospace', size: 11 }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#ffffff' },
          grid: { color: '#333333' }
        },
        x: {
          ticks: { color: '#ffffff' },
          grid: { color: '#333333' }
        }
      }
    }
  });
}

export function renderMetricsLogs(data, filter = 'all', page = 1) {
  const metricsDiv = document.getElementById('metrics-logs-content');
  const metrics = data.metrics || [];
  
  let filteredMetrics = metrics;
  if (filter !== 'all') {
    filteredMetrics = metrics.filter(m => m.name && m.name.includes(filter));
  }
  
  const totalPages = Math.ceil(filteredMetrics.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageMetrics = filteredMetrics.slice(startIndex, endIndex);
  
  if (pageMetrics.length === 0) {
    metricsDiv.innerHTML = `
      <div class="empty-state">
        <h3>📋 No metrics found</h3>
        <p>No metrics match the current filter criteria.</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  pageMetrics.forEach(metric => {
    const badges = [];
    if (metric.name.includes('token')) badges.push('<span class="log-badge token">Token</span>');
    if (metric.name.includes('session')) badges.push('<span class="log-badge session">Session</span>');
    if (metric.name.includes('tool')) badges.push('<span class="log-badge tool">Tool</span>');
    
    html += `
      <div class="log-item">
        <div class="log-item-header">
          <div class="log-item-title">${metric.name}</div>
          <div class="log-item-timestamp">${new Date(metric.timestamp).toLocaleString()}</div>
        </div>
        <div class="log-item-details">
          <div class="log-detail">
            <span class="log-detail-label">Value:</span>
            <span class="log-detail-value">${metric.value.toLocaleString()}</span>
          </div>
          <div class="log-detail">
            <span class="log-detail-label">Session:</span>
            <span class="log-detail-value">${metric.sessionId.substring(0, 8)}...</span>
          </div>
          ${Object.entries(metric.attributes || {}).map(([key, value]) => `
            <div class="log-detail">
              <span class="log-detail-label">${key}:</span>
              <span class="log-detail-value">${value}</span>
            </div>
          `).join('')}
        </div>
        <div class="log-badges">${badges.join('')}</div>
      </div>
    `;
  });
  
  metricsDiv.innerHTML = html;
  
  // Update pagination
  updatePagination('metrics', page, totalPages);
  
  // Update stats
  document.getElementById('metrics-count').textContent = `${filteredMetrics.length} metrics`;
  document.getElementById('metrics-timestamp').textContent = new Date().toLocaleTimeString();
}

export function renderTracesLogs(traces, filter = 'all', page = 1) {
  const tracesDiv = document.getElementById('traces-logs-content');
  
  let filteredTraces = traces;
  if (filter !== 'all') {
    filteredTraces = traces.filter(trace => 
      trace.spans.some(span => span.operationName.includes(filter))
    );
  }
  
  const totalPages = Math.ceil(filteredTraces.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageTraces = filteredTraces.slice(startIndex, endIndex);
  
  if (pageTraces.length === 0) {
    tracesDiv.innerHTML = `
      <div class="empty-state">
        <h3>🔍 No traces found</h3>
        <p>No traces match the current filter criteria.</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  pageTraces.forEach(trace => {
    const badges = [];
    if (trace.spans.some(s => s.operationName.includes('api'))) badges.push('<span class="log-badge api">API</span>');
    if (trace.spans.some(s => s.operationName.includes('tool'))) badges.push('<span class="log-badge tool">Tool</span>');
    
    const totalDuration = Math.max(...trace.spans.map(s => s.duration)) / 1000;
    
    html += `
      <div class="log-item">
        <div class="log-item-header">
          <div class="log-item-title">Trace ${trace.traceID.substring(0, 16)}...</div>
          <div class="log-item-timestamp">${totalDuration.toFixed(2)}ms</div>
        </div>
        <div class="log-item-details">
          <div class="log-detail">
            <span class="log-detail-label">Spans:</span>
            <span class="log-detail-value">${trace.spans.length}</span>
          </div>
          <div class="log-detail">
            <span class="log-detail-label">Operations:</span>
            <span class="log-detail-value">${[...new Set(trace.spans.map(s => s.operationName))].length}</span>
          </div>
        </div>
        <div class="log-badges">${badges.join('')}</div>
        <div style="margin-top: 12px;">
          ${trace.spans.slice(0, 3).map(span => `
            <div style="font-size: 0.8em; color: var(--dim-text); margin: 4px 0;">
              ${span.operationName} - ${(span.duration / 1000).toFixed(2)}ms
            </div>
          `).join('')}
          ${trace.spans.length > 3 ? `<div style="font-size: 0.8em; color: var(--dim-text);">... and ${trace.spans.length - 3} more spans</div>` : ''}
        </div>
      </div>
    `;
  });
  
  tracesDiv.innerHTML = html;
  
  // Update pagination
  updatePagination('traces', page, totalPages);
  
  // Update stats
  document.getElementById('traces-count').textContent = `${filteredTraces.length} traces`;
  document.getElementById('traces-timestamp').textContent = new Date().toLocaleTimeString();
}

function updatePagination(type, currentPage, totalPages) {
  const prevBtn = document.getElementById(`${type}-prev`);
  const nextBtn = document.getElementById(`${type}-next`);
  const pageInfo = document.getElementById(`${type}-page-info`);
  
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

export function setupPagination() {
  document.getElementById('metrics-prev').addEventListener('click', () => {
    if (currentMetricsPage > 1) {
      currentMetricsPage--;
      loadMetricsLogs();
    }
  });
  
  document.getElementById('metrics-next').addEventListener('click', () => {
    currentMetricsPage++;
    loadMetricsLogs();
  });
  
  document.getElementById('traces-prev').addEventListener('click', () => {
    if (currentTracesPage > 1) {
      currentTracesPage--;
      loadTracesLogs();
    }
  });
  
  document.getElementById('traces-next').addEventListener('click', () => {
    currentTracesPage++;
    loadTracesLogs();
  });
  
  document.getElementById('metrics-filter').addEventListener('change', (e) => {
    currentMetricsPage = 1;
    loadMetricsLogs();
  });
  
  document.getElementById('traces-filter').addEventListener('change', (e) => {
    currentTracesPage = 1;
    loadTracesLogs();
  });
}

// Export functions that will be called from app.js
window.updateAnalytics = async function() {
  // This will be implemented in app.js
};

window.loadMetricsLogs = async function() {
  // This will be implemented in app.js
};

window.loadTracesLogs = async function() {
  // This will be implemented in app.js
};