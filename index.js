const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Manual proxy for Jaeger API
app.get('/api/services', (req, res) => {
  const jaegerUrl = `http://localhost:16686/api/services`;
  console.log('Fetching services:', jaegerUrl);
  
  http.get(jaegerUrl, (jaegerRes) => {
    let data = '';
    jaegerRes.on('data', (chunk) => {
      data += chunk;
    });
    jaegerRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    });
  }).on('error', (err) => {
    console.error('Jaeger API error:', err.message);
    res.status(500).json({ error: 'Failed to fetch from Jaeger: ' + err.message });
  });
});

app.get('/api/traces', (req, res) => {
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const jaegerUrl = `http://localhost:16686/api/traces${queryString ? '?' + queryString : ''}`;
  console.log('Fetching traces:', jaegerUrl);
  
  http.get(jaegerUrl, (jaegerRes) => {
    let data = '';
    jaegerRes.on('data', (chunk) => {
      data += chunk;
    });
    jaegerRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    });
  }).on('error', (err) => {
    console.error('Jaeger API error:', err.message);
    res.status(500).json({ error: 'Failed to fetch from Jaeger: ' + err.message });
  });
});

// Get Gemini CLI metrics from collector logs
app.get('/api/metrics', (req, res) => {
  try {
    const homeDir = os.homedir();
    const geminiTmpPath = path.join(homeDir, '.gemini', 'tmp');
    
    // Find the latest collector log file
    let logFile = null;
    if (fs.existsSync(geminiTmpPath)) {
      const tmpDirs = fs.readdirSync(geminiTmpPath);
      for (const dir of tmpDirs) {
        const collectorLogPath = path.join(geminiTmpPath, dir, 'otel', 'collector.log');
        if (fs.existsSync(collectorLogPath)) {
          logFile = collectorLogPath;
          break;
        }
      }
    }
    
    if (!logFile) {
      return res.json({ metrics: [], message: 'No collector log found' });
    }
    
    // Read recent metrics from log
    const logContent = fs.readFileSync(logFile, 'utf8');
    const lines = logContent.split('\n').slice(-1000); // Last 1000 lines
    
    const metrics = [];
    let currentMetric = {};
    let inDataPoint = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        // Start of a new metric
        if (line.includes('Metric #')) {
          currentMetric = { attributes: {} };
          inDataPoint = false;
        }
        
        // Extract metric name
        if (line.includes('-> Name:')) {
          const nameMatch = line.match(/-> Name: (.+)$/);
          if (nameMatch) currentMetric.name = nameMatch[1].trim();
        }
        
        // Extract description
        if (line.includes('-> Description:')) {
          const descMatch = line.match(/-> Description: (.+)$/);
          if (descMatch) currentMetric.description = descMatch[1].trim();
        }
        
        // Start of a data point
        if (line.includes('NumberDataPoints #')) {
          inDataPoint = true;
          // Reset attributes for new data point
          if (currentMetric.name) {
            currentMetric.attributes = {};
          }
        }
        
        // Extract all attributes
        if (inDataPoint && line.includes('-> ')) {
          // Session ID
          if (line.includes('session.id: Str(')) {
            const sessionMatch = line.match(/session\.id: Str\(([^)]+)\)/);
            if (sessionMatch) currentMetric.attributes.sessionId = sessionMatch[1];
          }
          
          // Model
          if (line.includes('model: Str(')) {
            const modelMatch = line.match(/model: Str\(([^)]+)\)/);
            if (modelMatch) currentMetric.attributes.model = modelMatch[1];
          }
          
          // Type (input/output for tokens)
          if (line.includes('type: Str(')) {
            const typeMatch = line.match(/type: Str\(([^)]+)\)/);
            if (typeMatch) currentMetric.attributes.type = typeMatch[1];
          }
          
          // Operation (for file operations)
          if (line.includes('operation: Str(')) {
            const opMatch = line.match(/operation: Str\(([^)]+)\)/);
            if (opMatch) currentMetric.attributes.operation = opMatch[1];
          }
          
          // Lines (for file operations)
          if (line.includes('lines: Int(')) {
            const linesMatch = line.match(/lines: Int\(([^)]+)\)/);
            if (linesMatch) currentMetric.attributes.lines = parseInt(linesMatch[1]);
          }
          
          // Mimetype
          if (line.includes('mimetype: Str(')) {
            const mimetypeMatch = line.match(/mimetype: Str\(([^)]+)\)/);
            if (mimetypeMatch) currentMetric.attributes.mimetype = mimetypeMatch[1];
          }
          
          // Extension
          if (line.includes('extension: Str(')) {
            const extMatch = line.match(/extension: Str\(([^)]+)\)/);
            if (extMatch) currentMetric.attributes.extension = extMatch[1];
          }
        }
        
        // Extract timestamp
        if (line.includes('Timestamp:') && !line.includes('StartTimestamp')) {
          const timestampMatch = line.match(/Timestamp: (.+) UTC$/);
          if (timestampMatch) currentMetric.timestamp = timestampMatch[1];
        }
        
        // Extract value and complete the metric
        if (line.includes('Value:')) {
          const valueMatch = line.match(/Value: (\d+)$/);
          if (valueMatch) {
            currentMetric.value = parseInt(valueMatch[1]);
            
            // Complete metric found, add to array
            if (currentMetric.name && currentMetric.attributes.sessionId && currentMetric.timestamp) {
              metrics.push({
                name: currentMetric.name,
                description: currentMetric.description || '',
                sessionId: currentMetric.attributes.sessionId,
                timestamp: currentMetric.timestamp,
                value: currentMetric.value,
                attributes: { ...currentMetric.attributes },
                type: 'counter'
              });
            }
            inDataPoint = false; // Reset for next data point
          }
        }
      } catch (e) {
        // Skip invalid lines
      }
    }
    
    // Deduplicate and sort by timestamp
    const uniqueMetrics = metrics
      .filter((metric, index, arr) => 
        arr.findIndex(m => m.timestamp === metric.timestamp && m.sessionId === metric.sessionId) === index
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50); // Last 50 metrics
    
    console.log(`Found ${uniqueMetrics.length} metrics`);
    res.json({ metrics: uniqueMetrics, total: uniqueMetrics.length });
    
  } catch (error) {
    console.error('Error reading metrics:', error.message);
    res.status(500).json({ error: 'Failed to read metrics: ' + error.message });
  }
});

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

app.listen(3337, () => {
  console.log('Gemini CLI Dashboard listening on port 3337');
  console.log('Open http://localhost:3337 in your browser');
});