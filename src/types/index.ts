import { z } from 'zod';

// Configuration schemas
export const ServiceConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  port: z.number().min(1000).max(65535),
  timeout: z.number().min(10000).default(300000), // 5 minutes default
  healthCheck: z.string().default('/health'),
  env: z.record(z.string()).optional(),
  instances: z.number().min(1).max(10).default(1),
  autorestart: z.boolean().default(false),
  maxRestarts: z.number().min(0).default(0)
});

export const GlobalConfigSchema = z.object({
  port: z.number().min(1000).max(65535).default(8080),
  host: z.string().default('localhost'),
  defaultTimeout: z.number().min(10000).default(300000),
  healthCheckInterval: z.number().min(1000).default(30000),
  cleanupInterval: z.number().min(10000).default(60000),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  cors: z.object({
    enabled: z.boolean().default(true),
    origin: z.string().or(z.array(z.string())).default('*')
  }).default({})
});

export const ConfigSchema = z.object({
  global: GlobalConfigSchema.default({}),
  services: z.record(ServiceConfigSchema)
});

// Type exports
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// Service status types
export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ServiceInstance {
  name: string;
  config: ServiceConfig;
  status: ServiceStatus;
  pid?: number;
  port: number;
  lastActivity: Date;
  startTime?: Date;
  requestCount: number;
  errorCount: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'timeout';
  responseTime: number;
  error?: string;
}

export interface ProcessManagerEvents {
  serviceStarted: (service: ServiceInstance) => void;
  serviceStopped: (serviceName: string) => void;
  serviceError: (serviceName: string, error: Error) => void;
  healthCheckFailed: (serviceName: string, result: HealthCheckResult) => void;
}