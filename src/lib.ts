import { mkdirSync, existsSync } from 'fs';
import { createLogger } from './utils/logger';
import { ConfigManager } from './config/manager';
import { ProcessManager } from './process/manager';
import { ActivityMonitor } from './monitoring/activity-monitor';
import { Router } from './gateway/router';
import { ManagementAPI } from './api/management';

export class ServerlessGateway {
  private logger = createLogger();
  private configManager: ConfigManager;
  private processManager: ProcessManager;
  private activityMonitor: ActivityMonitor;
  private router: Router;
  private managementAPI: ManagementAPI;

  constructor() {
    // Ensure logs directory exists
    if (!existsSync('logs')) {
      mkdirSync('logs', { recursive: true });
    }

    // Initialize components
    this.configManager = new ConfigManager(
      process.env.CONFIG_PATH || 'config.json',
      this.logger
    );
    
    this.processManager = new ProcessManager(this.logger);
    
    this.activityMonitor = new ActivityMonitor(
      this.processManager,
      this.configManager,
      this.logger
    );
    
    this.router = new Router(
      this.processManager,
      this.configManager,
      this.logger
    );
    
    this.managementAPI = new ManagementAPI(
      this.processManager,
      this.configManager,
      this.activityMonitor,
      this.logger
    );
  }

  async start(): Promise<void> {
    try {
      // Initialize process manager
      await this.processManager.initialize();

      // Start activity monitoring
      this.activityMonitor.start();

      // Setup configuration change handler
      this.configManager.onConfigChange((config) => {
        this.logger.info('Configuration changed, updating log level', { 
          level: config.global.logLevel 
        });
        this.logger.level = config.global.logLevel;
      });

      // Register existing services from configuration
      const config = this.configManager.getConfig();
      for (const [name, serviceConfig] of Object.entries(config.services)) {
        await this.processManager.registerService(name, serviceConfig);
      }

      // Start the HTTP server
      const server = Bun.serve({
        port: config.global.port,
        hostname: config.global.host,
        fetch: this.handleRequest.bind(this),
        error: (error) => {
          this.logger.error('Server error', { 
            error: error.message 
          });
          return new Response('Internal Server Error', { status: 500 });
        }
      });

      this.logger.info(`🚀 Serverless Gateway started`, {
        host: config.global.host,
        port: config.global.port,
        url: `http://${config.global.host}:${config.global.port}`,
        services: Object.keys(config.services).length
      });

      // Setup graceful shutdown
      process.on('SIGINT', this.shutdown.bind(this));
      process.on('SIGTERM', this.shutdown.bind(this));

    } catch (error) {
      this.logger.error('Failed to start gateway', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      process.exit(1);
    }
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();

    // Add CORS headers
    const config = this.configManager.getConfig();
    const corsOptions = {
      origin: config.global.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': corsOptions.origin as string,
          'Access-Control-Allow-Methods': corsOptions.methods.join(', '),
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    let response: Response;

    try {
      // Route to management API if path starts with /api/
      if (url.pathname.startsWith('/api/')) {
        response = await this.managementAPI.handleRequest(request);
      } else {
        // Route to services
        response = await this.router.handleRequest(request);
      }

      // Add CORS headers to response
      if (config.global.cors.enabled) {
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', corsOptions.origin as string);
        headers.set('Access-Control-Allow-Credentials', 'true');
        
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }

    } catch (error) {
      this.logger.error('Unhandled request error', { 
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error) 
      });
      
      response = new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Log the request
    const duration = Date.now() - startTime;
    this.logger.info('Request processed', {
      method: request.method,
      path: url.pathname,
      status: response.status,
      duration: `${duration}ms`,
      userAgent: request.headers.get('user-agent')
    });

    return response;
  }

  private async shutdown(): Promise<void> {
    this.logger.info('🛑 Shutting down gateway...');

    try {
      // Stop activity monitor
      this.activityMonitor.stop();

      // Stop all running services
      const services = this.processManager.getAllServices();
      const runningServices = services.filter(s => s.status === 'running');
      
      this.logger.info(`Stopping ${runningServices.length} running services...`);
      
      await Promise.all(
        runningServices.map(async (service) => {
          try {
            await this.processManager.stopService(service.name);
            this.logger.info(`Stopped service: ${service.name}`);
          } catch (error) {
            this.logger.error(`Failed to stop service ${service.name}`, {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        })
      );

      // Disconnect from PM2
      await this.processManager.disconnect();

      this.logger.info('✅ Gateway shutdown complete');
      process.exit(0);

    } catch (error) {
      this.logger.error('Error during shutdown', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      process.exit(1);
    }
  }
}
