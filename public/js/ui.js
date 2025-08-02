let chart = null;

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
  document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');
}

export function updateMainMetrics(metrics, traces) {
  const sessionIds = [...new Set(metrics.map(m => m.sessionId))];
  const totalSessions = sessionIds.length;
  
  const toolMetrics = metrics.filter(m => m.name && m.name.includes('tool'));
  const totalTools = toolMetrics.reduce((sum, m) => sum + m.value, 0);
  
  const tokenMetrics = metrics.filter(m => m.name && m.name.includes('token'));
  const inputTokens = tokenMetrics.filter(m => m.attributes?.type === 'input').reduce((sum, m) => sum + m.value, 0);
  const outputTokens = tokenMetrics.filter(m => m.attributes?.type === 'output').reduce((sum, m) => sum + m.value, 0);
  const totalTokens = inputTokens + outputTokens;
  
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
  
  document.getElementById('total-apis').textContent = apiCalls.toLocaleString();
  document.getElementById('api-duration').textContent = `${avgDuration}ms`;
  document.getElementById('api-success').textContent = '100%';

  if (sessionIds.length > 0) {
    const currentSession = document.getElementById('current-session');
    currentSession.style.display = 'block';
    document.getElementById('session-detail').textContent = `Session ID: ${sessionIds[0].substring(0, 8)}...`;
  }
}

export function renderMetrics(data) {
  const metricsDiv = document.getElementById('metrics-content');
  if (!data.metrics || data.metrics.length === 0) {
    metricsDiv.innerHTML = `
      <div class="empty-state">
        <h3>📊 No metrics detected</h3>
        <p>Execute Gemini CLI commands with telemetry enabled:</p>
        <code>echo "Hello World" | gemini --telemetry --model gemini-2.5-flash</code>
        <br><br>
        <button onclick="window.location.reload()" class="btn">
          🔄 Refresh Metrics
        </button>
      </div>
    `;
    return;
  }
  
  let html = `<div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <span class="status-badge">● ${data.total} metrics found</span>
    </div>
    <button onclick="window.location.reload()" class="btn">🔄 Refresh</button>
  </div>`;
  
  const metricsByName = {};
  data.metrics.forEach(metric => {
    if (!metricsByName[metric.name]) {
      metricsByName[metric.name] = [];
    }
    metricsByName[metric.name].push(metric);
  });
  
  for (const [name, metrics] of Object.entries(metricsByName)) {
    const uniqueMetrics = [];
    metrics.forEach(metric => {
      const key = JSON.stringify(metric.attributes || {});
      if (!uniqueMetrics.find(m => JSON.stringify(m.attributes || {}) === key)) {
        uniqueMetrics.push(metric);
      }
    });
    
    html += `<div class="section">`;
    html += `<h3 style="margin: 0 0 10px 0; color: var(--terminal-text); text-transform: uppercase;">${name}</h3>`;
    html += `<p style="margin: 0 0 15px 0; color: var(--dim-text); font-size: 14px;">${metrics[0].description}</p>`;
    
    uniqueMetrics.forEach(metric => {
      const attrs = metric.attributes || {};
      let attributeText = '';
      
      Object.keys(attrs).forEach(key => {
        if (key !== 'sessionId') {
          attributeText += `<span class="status-badge" style="margin: 2px;">${key}: ${attrs[key]}</span> `;
        }
      });
      
      html += `
        <div class="metric-item">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div class="metric-value">${metric.value.toLocaleString()}</div>
              <div style="margin: 8px 0;">${attributeText}</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: var(--dim-text);">
              <div style="color: var(--terminal-text);">Session: ${metric.sessionId.substring(0, 8)}...</div>
              <div>${new Date(metric.timestamp).toLocaleString()}</div>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
  }
  
  metricsDiv.innerHTML = html;
}

export function renderTraces(traces, service) {
  const tracesDiv = document.getElementById('traces-content');
  tracesDiv.innerHTML = '';

  if (!traces || traces.length === 0) {
    tracesDiv.innerHTML = `<div class="empty-state"><p>No traces found${service ? ` for ${service} service` : ''}</p></div>`;
    return;
  }

  let html = `<div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <span class="status-badge">● ${traces.length} traces found</span>
      <span style="margin-left: 10px; color: var(--dim-text);">Service: ${service}</span>
    </div>
    <button onclick="window.location.reload()" class="btn">🔄 Refresh</button>
  </div>`;

  for (const trace of traces) {
    html += `
      <div class="trace-item">
        <h4 style="color: var(--accent-text); margin-bottom: 10px; font-size: 1em;">
          🔗 Trace ID: <span class="trace-id">${trace.traceID.substring(0, 16)}...</span>
        </h4>
        <div style="margin-left: 0;">
          ${trace.spans.map(span => `
            <div class="span-item">
              <div class="span-operation">${span.operationName}</div>
              <div class="span-duration">${(span.duration / 1000).toFixed(2)}ms</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  tracesDiv.innerHTML = html;
}

export function renderTokenChart(metrics) {
  console.log('Rendering token chart with metrics:', metrics);
  const tokenMetrics = metrics.filter(m => m.name && m.name.includes('token'));
  const inputTokens = tokenMetrics.filter(m => m.attributes?.type === 'input').reduce((sum, m) => sum + m.value, 0);
  const outputTokens = tokenMetrics.filter(m => m.attributes?.type === 'output').reduce((sum, m) => sum + m.value, 0);

  const ctx = document.getElementById('token-chart').getContext('2d');
  
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Input Tokens', 'Output Tokens'],
      datasets: [{
        label: 'Token Usage',
        data: [inputTokens, outputTokens],
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Token Usage Distribution'
        }
      }
    }
  });
}