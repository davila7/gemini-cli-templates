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
      const tmpDirs = fs.readdirSync(geminiTmpPath)
        .map(dir => ({ name: dir, path: path.join(geminiTmpPath, dir) }))
        .filter(dir => fs.statSync(dir.path).isDirectory())
        .sort((a, b) => fs.statSync(b.path).mtime.getTime() - fs.statSync(a.path).mtime.getTime());

      for (const dir of tmpDirs) {
        const collectorLogPath = path.join(dir.path, 'otel', 'collector.log');
        if (fs.existsSync(collectorLogPath)) {
          logFile = collectorLogPath;
          break; // Found the latest one
        }
      }
    }
    
    if (!logFile) {
      return res.json({ metrics: [], message: 'No collector log found' });
    }
    
    // Read recent metrics from log
    const logContent = fs.readFileSync(logFile, 'utf8');
    const lines = logContent.split('\n'); // Read all lines
    
    const metrics = [];
    const tokenEvents = [];
    let currentMetric = {};
    let currentLogRecord = {};
    let inDataPoint = false;
    let inLogRecord = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        // Start of a new metric
        if (line.includes('Metric #')) {
          currentMetric = { attributes: {} };
          inDataPoint = false;
          inLogRecord = false;
        }
        
        // Start of a new log record - first complete any previous tool call record
        if (line.includes('LogRecord #')) {
          // Complete previous tool call log record if it exists
          if (inLogRecord && currentLogRecord.isToolCall && currentLogRecord.sessionId && currentLogRecord.timestamp && currentLogRecord.functionName) {
            tokenEvents.push({
              name: 'gemini_cli.tool.usage',
              description: 'Tool call executed',
              sessionId: currentLogRecord.sessionId,
              timestamp: currentLogRecord.timestamp,
              value: 1,
              attributes: { 
                operation: currentLogRecord.functionName,
                success: currentLogRecord.success ? 'true' : 'false',
                duration_ms: currentLogRecord.durationMs || 0
              },
              type: 'counter'
            });
          }
          
          currentLogRecord = { attributes: {} };
          inLogRecord = true;
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
          
          // Token type from description
          if (currentMetric.name && currentMetric.name.includes('gemini.token.count')) {
            if (currentMetric.description && currentMetric.description.toLowerCase().includes('input')) {
              currentMetric.attributes.type = 'input';
            } else if (currentMetric.description && currentMetric.description.toLowerCase().includes('output')) {
              currentMetric.attributes.type = 'output';
            }
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
        
        // Extract timestamp for metrics
        if (line.includes('Timestamp:') && !line.includes('StartTimestamp') && !inLogRecord) {
          const timestampMatch = line.match(/Timestamp: (.+) UTC$/);
          if (timestampMatch) currentMetric.timestamp = timestampMatch[1];
        }
        
        // Extract timestamp for log records
        if (line.includes('Timestamp:') && !line.includes('StartTimestamp') && !line.includes('ObservedTimestamp') && inLogRecord) {
          const timestampMatch = line.match(/Timestamp: (.+) UTC$/);
          if (timestampMatch) currentLogRecord.timestamp = timestampMatch[1];
        }
        
        // Parse data from log record attributes
        if (inLogRecord && line.includes('-> ')) {
          // Session ID for log records
          if (line.includes('session.id: Str(')) {
            const sessionMatch = line.match(/session\.id: Str\(([^)]+)\)/);
            if (sessionMatch) currentLogRecord.sessionId = sessionMatch[1];
          }
          
          // Event name to identify API response logs
          if (line.includes('event.name: Str(') && line.includes('gemini_cli.api_response')) {
            currentLogRecord.isApiResponse = true;
          }
          
          // Event name to identify tool call logs
          if (line.includes('event.name: Str(') && line.includes('gemini_cli.tool_call')) {
            currentLogRecord.isToolCall = true;
          }
          
          // Model information
          if (line.includes('model: Str(')) {
            const modelMatch = line.match(/model: Str\(([^)]+)\)/);
            if (modelMatch) currentLogRecord.model = modelMatch[1];
          }
          
          // Function name for tool calls
          if (line.includes('function_name: Str(')) {
            const funcMatch = line.match(/function_name: Str\(([^)]+)\)/);
            if (funcMatch) currentLogRecord.functionName = funcMatch[1];
          }
          
          // Duration (context-aware)
          if (line.includes('duration_ms: Int(')) {
            const durationMatch = line.match(/duration_ms: Int\((\d+)\)/);
            if (durationMatch) {
              const duration = parseInt(durationMatch[1]);
              if (currentLogRecord.isApiResponse) {
                currentLogRecord.apiDurationMs = duration;
              } else if (currentLogRecord.isToolCall) {
                currentLogRecord.durationMs = duration;
              }
            }
          }
          
          // Success status for tool calls
          if (line.includes('success: Bool(')) {
            const successMatch = line.match(/success: Bool\(([^)]+)\)/);
            if (successMatch) currentLogRecord.success = successMatch[1] === 'true';
          }
          
          // Token counts
          if (line.includes('input_token_count: Int(')) {
            const tokenMatch = line.match(/input_token_count: Int\((\d+)\)/);
            if (tokenMatch) currentLogRecord.inputTokens = parseInt(tokenMatch[1]);
          }
          
          if (line.includes('output_token_count: Int(')) {
            const tokenMatch = line.match(/output_token_count: Int\((\d+)\)/);
            if (tokenMatch) currentLogRecord.outputTokens = parseInt(tokenMatch[1]);
          }
          
          if (line.includes('cached_content_token_count: Int(')) {
            const tokenMatch = line.match(/cached_content_token_count: Int\((\d+)\)/);
            if (tokenMatch) currentLogRecord.cachedTokens = parseInt(tokenMatch[1]);
          }
          
          if (line.includes('thoughts_token_count: Int(')) {
            const tokenMatch = line.match(/thoughts_token_count: Int\((\d+)\)/);
            if (tokenMatch) currentLogRecord.thoughtsTokens = parseInt(tokenMatch[1]);
          }
          
          if (line.includes('total_token_count: Int(')) {
            const tokenMatch = line.match(/total_token_count: Int\((\d+)\)/);
            if (tokenMatch) currentLogRecord.totalTokens = parseInt(tokenMatch[1]);
          }
        }
        
        
        // Complete log record and extract token metrics
        if (inLogRecord && currentLogRecord.isApiResponse && currentLogRecord.sessionId && currentLogRecord.timestamp) {
          if (currentLogRecord.inputTokens !== undefined) {
            tokenEvents.push({
              name: 'gemini_cli.token.usage',
              description: 'Input tokens used in API call',
              sessionId: currentLogRecord.sessionId,
              timestamp: currentLogRecord.timestamp,
              value: currentLogRecord.inputTokens,
              attributes: { type: 'input', model: currentLogRecord.model },
              type: 'counter'
            });
          }
          
          if (currentLogRecord.outputTokens !== undefined) {
            tokenEvents.push({
              name: 'gemini_cli.token.usage',
              description: 'Output tokens generated in API call',
              sessionId: currentLogRecord.sessionId,
              timestamp: currentLogRecord.timestamp,
              value: currentLogRecord.outputTokens,
              attributes: { type: 'output', model: currentLogRecord.model },
              type: 'counter'
            });
          }
          
          if (currentLogRecord.cachedTokens !== undefined) {
            tokenEvents.push({
              name: 'gemini_cli.token.usage',
              description: 'Cached tokens used in API call',
              sessionId: currentLogRecord.sessionId,
              timestamp: currentLogRecord.timestamp,
              value: currentLogRecord.cachedTokens,
              attributes: { type: 'cached', model: currentLogRecord.model },
              type: 'counter'
            });
          }
          
          if (currentLogRecord.thoughtsTokens !== undefined) {
            tokenEvents.push({
              name: 'gemini_cli.token.usage',
              description: 'Thoughts tokens used in API call',
              sessionId: currentLogRecord.sessionId,
              timestamp: currentLogRecord.timestamp,
              value: currentLogRecord.thoughtsTokens,
              attributes: { type: 'thoughts', model: currentLogRecord.model },
              type: 'counter'
            });
          }
          
          // Create API response time metric if we have duration data
          if (currentLogRecord.apiDurationMs !== undefined) {
            tokenEvents.push({
              name: 'gemini_cli.api.response_time',
              description: 'API response time in milliseconds',
              sessionId: currentLogRecord.sessionId,
              timestamp: currentLogRecord.timestamp,
              value: currentLogRecord.apiDurationMs,
              attributes: { 
                model: currentLogRecord.model,
                duration_ms: currentLogRecord.apiDurationMs
              },
              type: 'gauge'
            });
          }
          
          // Reset for next log record
          currentLogRecord = { attributes: {} };
          inLogRecord = false;
        }
        
        // Complete log record and extract tool call metrics
        if (inLogRecord && currentLogRecord.isToolCall && currentLogRecord.sessionId && currentLogRecord.timestamp && currentLogRecord.functionName) {
          tokenEvents.push({
            name: 'gemini_cli.tool.usage',
            description: 'Tool call executed',
            sessionId: currentLogRecord.sessionId,
            timestamp: currentLogRecord.timestamp,
            value: 1,
            attributes: { 
              operation: currentLogRecord.functionName,
              success: currentLogRecord.success ? 'true' : 'false',
              duration_ms: currentLogRecord.durationMs || 0
            },
            type: 'counter'
          });
          
          // Reset for next log record
          currentLogRecord = { attributes: {} };
          inLogRecord = false;
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
    
    // Complete any remaining tool call log record
    if (inLogRecord && currentLogRecord.isToolCall && currentLogRecord.sessionId && currentLogRecord.timestamp && currentLogRecord.functionName) {
      tokenEvents.push({
        name: 'gemini_cli.tool.usage',
        description: 'Tool call executed',
        sessionId: currentLogRecord.sessionId,
        timestamp: currentLogRecord.timestamp,
        value: 1,
        attributes: { 
          operation: currentLogRecord.functionName,
          success: currentLogRecord.success ? 'true' : 'false',
          duration_ms: currentLogRecord.durationMs || 0
        },
        type: 'counter'
      });
    }
    
    // Combine regular metrics with token events
    const allMetrics = [...metrics, ...tokenEvents];
    
    // Deduplicate and sort by timestamp
    const uniqueMetrics = allMetrics
      .filter((metric, index, arr) => 
        arr.findIndex(m => m.timestamp === metric.timestamp && m.sessionId === metric.sessionId && m.name === metric.name && JSON.stringify(m.attributes) === JSON.stringify(metric.attributes)) === index
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100); // Last 100 metrics (increased to show more token data)
    
    // Log token and tool metrics for debugging
    const tokenMetrics = uniqueMetrics.filter(m => m.name && m.name.includes('token'));
    const toolMetrics = uniqueMetrics.filter(m => m.name && m.name.includes('tool'));
    console.log('Token metrics found:', tokenMetrics.length);
    console.log('Tool metrics found:', toolMetrics.length);

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