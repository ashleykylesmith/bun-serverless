const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3002;

// Simple in-memory data store
let dataStore = {
  items: [],
  stats: {
    totalRequests: 0,
    totalItems: 0,
    startTime: new Date()
  }
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  dataStore.stats.totalRequests++;

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (path === '/status' || path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'data-processor',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      stats: dataStore.stats
    }));
    return;
  }

  // Data processing endpoints
  if (path === '/process' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Simulate data processing
        const processedData = {
          id: Date.now(),
          original: data,
          processed: {
            ...data,
            processedAt: new Date().toISOString(),
            wordCount: typeof data.text === 'string' ? data.text.split(' ').length : 0,
            hash: Buffer.from(JSON.stringify(data)).toString('base64')
          }
        };

        dataStore.items.push(processedData);
        dataStore.stats.totalItems++;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          result: processedData.processed,
          message: 'Data processed successfully'
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON data' }));
      }
    });
    return;
  }

  if (path === '/items' && method === 'GET') {
    const limit = parseInt(parsedUrl.query.limit) || 10;
    const offset = parseInt(parsedUrl.query.offset) || 0;
    
    const items = dataStore.items.slice(offset, offset + limit);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items,
      total: dataStore.items.length,
      limit,
      offset
    }));
    return;
  }

  if (path === '/stats' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...dataStore.stats,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }));
    return;
  }

  // Service info
  if (path === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: 'data-processor',
      version: '1.0.0',
      description: 'A data processing service with in-memory storage',
      endpoints: [
        { path: '/status', method: 'GET', description: 'Health check' },
        { path: '/process', method: 'POST', description: 'Process data' },
        { path: '/items', method: 'GET', description: 'List processed items' },
        { path: '/stats', method: 'GET', description: 'Service statistics' },
        { path: '/info', method: 'GET', description: 'Service information' }
      ]
    }));
    return;
  }

  // 404 for unknown paths
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`Data Processor service listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/status`);
  console.log(`Process endpoint: http://localhost:${PORT}/process`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Data Processor service shut down');
    process.exit(0);
  });
});