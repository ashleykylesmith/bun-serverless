# Bun Serverless Gateway

A lightweight Bun server that functions as an API gateway and process manager, mimicking serverless architecture for infrequently used services. The gateway automatically starts services on-demand and stops them after periods of inactivity.

## Features

- **API Gateway**: Routes requests to services by service name in the URL path
- **Process Management**: Uses PM2 to start, stop, and monitor services programmatically
- **Auto-scaling**: Automatically starts services on-demand and stops inactive services
- **Health Monitoring**: Built-in health checks and service monitoring
- **Configuration Management**: Hot-reloadable JSON configuration
- **Management API**: RESTful API for service management and monitoring
- **TypeScript**: Full type safety and modern development experience

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Start the gateway:**
   ```bash
   bun run dev
   ```

3. **Test the services:**
   ```bash
  # Hello World service
  curl http://localhost:8080/hello-world/hello?name=World

  # Data processing service
  curl -X POST http://localhost:8080/data-processor/process \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello World", "type": "greeting"}'
   ```
OR

**Use as a package:**
```typescript
// Start the gateway
import { ServerlessGateway } from 'bun-serverless';

const gateway = new ServerlessGateway();
gateway.start().catch((error) => {
  console.error('Failed to start gateway:', error);
  process.exit(1);
});
```

## Configuration

The gateway uses a `config.json` file for configuration. Routes are inferred from the first path segment, which must match a service name. Here's the structure:

```json
{
  "global": {
    "port": 8080,
    "host": "localhost", 
    "defaultTimeout": 300000,
    "healthCheckInterval": 30000,
    "cleanupInterval": 60000,
    "logLevel": "info"
  },
  "services": {
    "service-name": {
      "name": "service-name",
      "command": "node ./path/to/service.js",
      "port": 3001,
      "timeout": 300000,
      "healthCheck": "/health",
      "env": {},
      "instances": 1,
      "autorestart": false
    }
  }
}
```

### Configuration Options

#### Global Settings
- `port`: Gateway server port (default: 8080)
- `host`: Gateway server host (default: localhost)
- `defaultTimeout`: Default service timeout in ms (default: 300000 - 5 minutes)
- `healthCheckInterval`: How often to check service health (default: 30000ms)
- `cleanupInterval`: How often to check for inactive services (default: 60000ms)
- `logLevel`: Logging level (error, warn, info, debug)

#### Service Configuration
- `name`: Service identifier
- `command`: Command to start the service
- `port`: Port the service will listen on
- `timeout`: Inactivity timeout before stopping (default: global setting)
- `healthCheck`: Health check endpoint path (default: /health)
- `env`: Environment variables for the service
- `instances`: Number of instances to run (default: 1)
- `autorestart`: Whether to automatically restart failed services

#### Routing
- Requests are routed by the first path segment as the service name.
- Example: `/hello-world/hello` forwards to the `hello-world` service with path `/hello`.
- Example: `/data-processor/process` forwards to `data-processor` with path `/process`.

## Management API

The gateway provides a RESTful management API:

### Health Check
```bash
GET /api/health
```

### List Services
```bash
GET /api/services
```

### Service Actions
```bash
POST /api/services/{serviceName}/start
POST /api/services/{serviceName}/stop  
POST /api/services/{serviceName}/restart
GET /api/services/{serviceName}/health
```

### Statistics
```bash
GET /api/stats
```

### Configuration
```bash
GET /api/config
```

## Example Usage

### 1. Create a Simple Service

Create `my-service/index.js`:
```javascript
const http = require('http');
const PORT = process.env.PORT || 3003;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from my service!' }));
});

server.listen(PORT, () => {
  console.log(`My service listening on port ${PORT}`);
});
```

### 2. Add to Configuration

Add to `config.json`:
```json
{
  "services": {
    "my-service": {
      "name": "my-service",
      "command": "node ./my-service/index.js",
      "port": 3003,
      "timeout": 300000,
      "healthCheck": "/health"
    }
  }
}
```

### 3. Test Your Service

```bash
# Service starts automatically on first request
curl http://localhost:8080/my-service

# Check service status
curl http://localhost:8080/api/services

# Service will stop automatically after 5 minutes of inactivity
```

## Development

### File Structure
```
src/
├── types/           # TypeScript type definitions
├── utils/           # Utility functions (logger, etc.)
├── config/          # Configuration management
├── process/         # PM2 process management
├── monitoring/      # Activity monitoring and cleanup
├── gateway/         # Request routing logic  
├── api/             # Management API endpoints
└── index.ts         # Main server entry point
```

### Scripts
- `bun run dev` - Start development server with hot reloading
- `bun run start` - Start production server
- `bun run build` - Build TypeScript to JavaScript
- `bun run type-check` - Run TypeScript compiler check

### Logging

Logs are written to:
- Console (with colors)
- `logs/gateway.log` (all logs)
- `logs/error.log` (errors only)

## Environment Variables

- `CONFIG_PATH` - Path to configuration file (default: config.json)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Override log level (error, warn, info, debug)

## Production Deployment

1. Build the project:
   ```bash
   bun run build
   ```

2. Set environment variables:
   ```bash
   export NODE_ENV=production
   export CONFIG_PATH=/path/to/production/config.json
   ```

3. Start with PM2:
   ```bash
   pm2 start dist/index.js --name gateway
   ```

## Best Practices

1. **Service Health Checks**: Always implement `/health` endpoints in your services
2. **Graceful Shutdown**: Handle SIGTERM in services for clean shutdowns
3. **Resource Limits**: Set appropriate timeouts based on service usage patterns
4. **Monitoring**: Use the management API to monitor service health and performance
5. **Configuration**: Use environment-specific config files
6. **Logging**: Implement structured logging in your services

## Troubleshooting

### Services Not Starting
- Check service command and working directory
- Verify port availability
- Review service logs in `logs/` directory
- Check PM2 process list: `pm2 list`

### High Memory Usage
- Adjust service timeouts to stop unused services sooner
- Monitor service memory usage via management API
- Implement proper cleanup in services

### Request Timeouts
- Check service health endpoints
- Increase gateway timeout in configuration
- Monitor service response times

## License

MIT