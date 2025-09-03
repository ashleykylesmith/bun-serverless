import { ProcessManager } from '../process/manager';
import { ConfigManager } from '../config/manager';
import { Logger } from '../utils/logger';

export class ActivityMonitor {
  private processManager: ProcessManager;
  private configManager: ConfigManager;
  private logger: Logger;
  private cleanupInterval?: Timer;
  private healthCheckInterval?: Timer;

  constructor(processManager: ProcessManager, configManager: ConfigManager, logger: Logger) {
    this.processManager = processManager;
    this.configManager = configManager;
    this.logger = logger;
  }

  start(): void {
    const config = this.configManager.getConfig();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, config.global.cleanupInterval);

    // Start health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, config.global.healthCheckInterval);

    this.logger.info('Activity monitor started', {
      cleanupInterval: config.global.cleanupInterval,
      healthCheckInterval: config.global.healthCheckInterval
    });
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.logger.info('Activity monitor stopped');
  }

  private async performCleanup(): Promise<void> {
    const config = this.configManager.getConfig();
    const services = this.processManager.getAllServices();

    for (const service of services) {
      if (service.status !== 'running') continue;

      const timeout = service.config.timeout || config.global.defaultTimeout;
      const inactive = this.processManager.getInactiveServices(timeout);

      if (inactive.find(s => s.name === service.name)) {
        this.logger.info(`Stopping inactive service ${service.name}`, {
          lastActivity: service.lastActivity,
          timeout: timeout
        });

        try {
          await this.processManager.stopService(service.name);
        } catch (error) {
          this.logger.error(`Failed to stop inactive service ${service.name}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  private async performHealthChecks(): Promise<void> {
    const services = this.processManager.getAllServices();
    const runningServices = services.filter(s => s.status === 'running');

    await Promise.all(
      runningServices.map(async (service) => {
        try {
          const result = await this.processManager.healthCheck(service.name);
          
          if (result.status === 'healthy') {
            this.logger.debug(`Health check passed for ${service.name}`, {
              responseTime: result.responseTime
            });
          } else {
            this.logger.warn(`Health check failed for ${service.name}`, result);
            service.errorCount++;
          }
        } catch (error) {
          this.logger.error(`Health check error for ${service.name}`, {
            error: error instanceof Error ? error.message : String(error)
          });
          service.errorCount++;
        }
      })
    );
  }

  getStats() {
    const services = this.processManager.getAllServices();
    return {
      totalServices: services.length,
      runningServices: services.filter(s => s.status === 'running').length,
      stoppedServices: services.filter(s => s.status === 'stopped').length,
      errorServices: services.filter(s => s.status === 'error').length,
      totalRequests: services.reduce((sum, s) => sum + s.requestCount, 0),
      totalErrors: services.reduce((sum, s) => sum + s.errorCount, 0)
    };
  }
}