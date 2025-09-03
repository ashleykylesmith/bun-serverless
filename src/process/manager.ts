import pm2 from 'pm2';
import { promisify } from 'util';
import { ServiceInstance, ServiceConfig, ServiceStatus, HealthCheckResult } from '../types';
import { Logger } from '../utils/logger';

export class ProcessManager {
  private services: Map<string, ServiceInstance> = new Map();
  private logger: Logger;
  private pm2Connected = false;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    if (this.pm2Connected) return;

    try {
      await promisify(pm2.connect.bind(pm2))();
      this.pm2Connected = true;
      this.logger.info('PM2 connection established');
    } catch (error) {
      this.logger.error('Failed to connect to PM2', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pm2Connected) return;

    try {
      await promisify(pm2.disconnect.bind(pm2))();
      this.pm2Connected = false;
      this.logger.info('PM2 connection closed');
    } catch (error) {
      this.logger.error('Error disconnecting from PM2', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  async registerService(name: string, config: ServiceConfig): Promise<void> {
    if (this.services.has(name)) {
      this.logger.warn(`Service ${name} is already registered`);
      return;
    }

    const instance: ServiceInstance = {
      name,
      config,
      status: 'stopped',
      port: config.port,
      lastActivity: new Date(),
      requestCount: 0,
      errorCount: 0
    };

    this.services.set(name, instance);
    this.logger.info(`Service ${name} registered`, { port: config.port });
  }

  async startService(name: string): Promise<ServiceInstance> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }

    if (service.status === 'running' || service.status === 'starting') {
      return service;
    }

    try {
      service.status = 'starting';
      this.logger.info(`Starting service ${name}`, { command: service.config.command });

      const pm2Config = {
        name,
        script: service.config.command.split(' ')[0],
        args: service.config.command.split(' ').slice(1),
        instances: service.config.instances,
        autorestart: service.config.autorestart,
        max_restarts: service.config.maxRestarts,
        env: {
          PORT: service.config.port.toString(),
          ...service.config.env
        },
        error_file: `logs/${name}-error.log`,
        out_file: `logs/${name}-out.log`,
        log_file: `logs/${name}-combined.log`
      };

      await promisify<typeof pm2Config>(pm2.start.bind(pm2))(pm2Config);

      service.status = 'running';
      service.startTime = new Date();
      service.lastActivity = new Date();

      this.logger.info(`Service ${name} started successfully`, { pid: service.pid });
      return service;
    } catch (error) {
      service.status = 'error';
      service.errorCount++;
      this.logger.error(`Failed to start service ${name}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async stopService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }

    if (service.status === 'stopped' || service.status === 'stopping') {
      return;
    }

    try {
      service.status = 'stopping';
      this.logger.info(`Stopping service ${name}`);

      await promisify(pm2.stop.bind(pm2))(name);
      await promisify(pm2.delete.bind(pm2))(name);

      service.status = 'stopped';
      service.pid = undefined;
      service.startTime = undefined;

      this.logger.info(`Service ${name} stopped successfully`);
    } catch (error) {
      service.status = 'error';
      service.errorCount++;
      this.logger.error(`Failed to stop service ${name}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async healthCheck(serviceName: string): Promise<HealthCheckResult> {
    const service = this.services.get(serviceName);
    if (!service || service.status !== 'running') {
      return {
        status: 'unhealthy',
        responseTime: 0,
        error: 'Service not running'
      };
    }

    const startTime = Date.now();
    try {
      const response = await fetch(`http://localhost:${service.port}${service.config.healthCheck}`, {
        method: 'GET',
        headers: { 'User-Agent': 'Gateway-Health-Check/1.0' },
        signal: AbortSignal.timeout(5000)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { status: 'healthy', responseTime };
      } else {
        return { 
          status: 'unhealthy', 
          responseTime,
          error: `HTTP ${response.status}` 
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  updateActivity(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.lastActivity = new Date();
      service.requestCount++;
    }
  }

  getService(name: string): ServiceInstance | undefined {
    return this.services.get(name);
  }

  getAllServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  getInactiveServices(timeoutMs: number): ServiceInstance[] {
    const cutoff = new Date(Date.now() - timeoutMs);
    return this.getAllServices().filter(
      service => service.status === 'running' && service.lastActivity < cutoff
    );
  }
}