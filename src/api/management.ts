import { ProcessManager } from '../process/manager.js';
import { ConfigManager } from '../config/manager.js';
import { ActivityMonitor } from '../monitoring/activity-monitor.js';
import { Logger } from '../utils/logger.js';

export class ManagementAPI {
  private processManager: ProcessManager;
  private configManager: ConfigManager;
  private activityMonitor: ActivityMonitor;
  private logger: Logger;

  constructor(
    processManager: ProcessManager,
    configManager: ConfigManager,
    activityMonitor: ActivityMonitor,
    logger: Logger
  ) {
    this.processManager = processManager;
    this.configManager = configManager;
    this.activityMonitor = activityMonitor;
    this.logger = logger;
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Route management API requests
      if (path === '/api/health' && method === 'GET') {
        return this.getHealth();
      }
      
      if (path === '/api/services' && method === 'GET') {
        return this.getServices();
      }
      
      if (path.startsWith('/api/services/') && method === 'POST') {
        const serviceName = path.split('/')[3];
        const action = path.split('/')[4];
        return this.handleServiceAction(serviceName, action);
      }
      
      if (path === '/api/stats' && method === 'GET') {
        return this.getStats();
      }
      
      if (path === '/api/config' && method === 'GET') {
        return this.getConfig();
      }

      return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      this.logger.error('Management API error', {
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error)
      });

      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async getHealth(): Promise<Response> {
    const stats = this.activityMonitor.getStats();
    const uptime = process.uptime();
    
    return new Response(JSON.stringify({
      status: 'healthy',
      uptime,
      timestamp: new Date().toISOString(),
      services: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async getServices(): Promise<Response> {
    const services = this.processManager.getAllServices().map(service => ({
      name: service.name,
      status: service.status,
      port: service.port,
      pid: service.pid,
      lastActivity: service.lastActivity,
      startTime: service.startTime,
      requestCount: service.requestCount,
      errorCount: service.errorCount,
      config: {
        command: service.config.command,
        timeout: service.config.timeout,
        healthCheck: service.config.healthCheck
      }
    }));

    return new Response(JSON.stringify({ services }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleServiceAction(serviceName: string, action: string): Promise<Response> {
    if (!serviceName) {
      return new Response(JSON.stringify({ error: 'Service name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      switch (action) {
        case 'start':
          const startedService = await this.processManager.startService(serviceName);
          return new Response(JSON.stringify({ 
            message: `Service ${serviceName} started`,
            service: startedService
          }), {
            headers: { 'Content-Type': 'application/json' }
          });

        case 'stop':
          await this.processManager.stopService(serviceName);
          return new Response(JSON.stringify({ 
            message: `Service ${serviceName} stopped`
          }), {
            headers: { 'Content-Type': 'application/json' }
          });

        case 'restart':
          await this.processManager.stopService(serviceName);
          await new Promise(resolve => setTimeout(resolve, 1000));
          const restartedService = await this.processManager.startService(serviceName);
          return new Response(JSON.stringify({ 
            message: `Service ${serviceName} restarted`,
            service: restartedService
          }), {
            headers: { 'Content-Type': 'application/json' }
          });

        case 'health':
          const healthResult = await this.processManager.healthCheck(serviceName);
          return new Response(JSON.stringify({
            service: serviceName,
            health: healthResult
          }), {
            headers: { 'Content-Type': 'application/json' }
          });

        default:
          return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async getStats(): Promise<Response> {
    const stats = this.activityMonitor.getStats();
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async getConfig(): Promise<Response> {
    const config = this.configManager.getConfig();
    return new Response(JSON.stringify(config), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}