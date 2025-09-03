import { ProcessManager } from '../process/manager';
import { ConfigManager } from '../config/manager';
import { Logger } from '../utils/logger';
import { RoutingRule } from '../types/index';

export class Router {
  private processManager: ProcessManager;
  private configManager: ConfigManager;
  private logger: Logger;

  constructor(processManager: ProcessManager, configManager: ConfigManager, logger: Logger) {
    this.processManager = processManager;
    this.configManager = configManager;
    this.logger = logger;
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Find matching routing rule
      const route = this.findRoute(url.pathname, method);
      if (!route) {
        return new Response(JSON.stringify({ error: 'Route not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get or start the service
      const service = await this.ensureServiceRunning(route.service);
      if (!service) {
        return new Response(JSON.stringify({ error: 'Service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update activity tracking
      this.processManager.updateActivity(service.name);

      // Prepare the target URL
      const targetPath = route.stripPath 
        ? url.pathname.replace(new RegExp(`^${route.path}`), '')
        : url.pathname;
      
      const targetUrl = `http://localhost:${service.port}${targetPath}${url.search}`;

      // Forward the request
      const headers = new Headers(request.headers);
      if (!route.preserveHost) {
        headers.set('Host', `localhost:${service.port}`);
      }
      headers.set('X-Forwarded-For', 'gateway');
      headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1));

      this.logger.debug(`Forwarding request`, {
        service: service.name,
        method: request.method,
        originalPath: url.pathname,
        targetUrl: targetUrl
      });

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      // Return the response with added headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('X-Gateway-Service', service.name);
      responseHeaders.set('X-Gateway-Request-ID', crypto.randomUUID());

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });

    } catch (error) {
      this.logger.error('Request handling error', {
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return new Response(JSON.stringify({ error: 'Gateway timeout' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private findRoute(path: string, method: string): RoutingRule | null {
    const config = this.configManager.getConfig();
    
    for (const rule of config.routing) {
      if (rule.method !== 'ALL' && rule.method !== method) {
        continue;
      }

      // Simple path matching - could be enhanced with patterns
      if (path.startsWith(rule.path)) {
        return rule;
      }
    }

    // If no explicit routing rule, try to match service by path
    const serviceName = path.split('/')[1];
    if (serviceName && config.services[serviceName]) {
      return {
        path: `/${serviceName}`,
        service: serviceName,
        method: 'ALL',
        stripPath: true,
        preserveHost: true
      };
    }

    return null;
  }

  private async ensureServiceRunning(serviceName: string) {
    let service = this.processManager.getService(serviceName);
    
    if (!service) {
      const config = this.configManager.getConfig();
      const serviceConfig = config.services[serviceName];
      
      if (!serviceConfig) {
        this.logger.error(`Service configuration not found: ${serviceName}`);
        return null;
      }

      await this.processManager.registerService(serviceName, serviceConfig);
      service = this.processManager.getService(serviceName);
    }

    if (service && service.status !== 'running') {
      try {
        await this.processManager.startService(serviceName);
        // Wait a moment for the service to fully start
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.processManager.getService(serviceName);
      } catch (error) {
        this.logger.error(`Failed to start service ${serviceName}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }
    }

    return service;
  }
}