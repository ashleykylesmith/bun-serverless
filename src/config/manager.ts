import { readFileSync, watchFile, existsSync } from 'fs';
import { resolve } from 'path';
import { Config, ConfigSchema } from '../types/index';
import { Logger } from '../utils/logger';

export class ConfigManager {
    private config: Config;
    private configPath: string;
    private logger: Logger;
    private callbacks: Array<(config: Config) => void> = [];

    constructor(configPath: string, logger: Logger) {
        this.configPath = resolve(configPath);
        this.logger = logger;
        this.config = this.loadConfig();
        this.watchConfigFile();
    }

    private loadConfig(): Config {
        if (!existsSync(this.configPath)) {
            this.logger.warn(`Configuration file not found at ${this.configPath}, using defaults`);
            return ConfigSchema.parse({
                global: {},
                services: {}
            });
        }

        try {
            const content = readFileSync(this.configPath, 'utf-8');

            const parsed = JSON.parse(content);
            const config = ConfigSchema.parse(parsed);
            this.logger.info('Configuration loaded successfully', { configPath: this.configPath });
            return config;

        } catch (error) {
            this.logger.error('Failed to load configuration', {
                error: error instanceof Error ? error.message : String(error),
                configPath: this.configPath
            });
            throw error;
        }
    }

    private watchConfigFile(): void {
        if (existsSync(this.configPath)) {
            watchFile(this.configPath, (curr, prev) => {
                if (curr.mtime !== prev.mtime) {
                    this.logger.info('Configuration file changed, reloading...');
                    try {
                        this.config = this.loadConfig();
                        this.notifyCallbacks();
                    } catch (error) {
                        this.logger.error('Failed to reload configuration', {
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            });
        }
    }

    private notifyCallbacks(): void {
        this.callbacks.forEach(callback => {
            try {
                callback(this.config);
            } catch (error) {
                this.logger.error('Error in config change callback', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
    }

    getConfig(): Config {
        return this.config;
    }

    onConfigChange(callback: (config: Config) => void): void {
        this.callbacks.push(callback);
    }

    updateConfig(updates: Partial<Config>): void {
        try {
            const newConfig = ConfigSchema.parse({ ...this.config, ...updates });
            this.config = newConfig;
            this.notifyCallbacks();
            this.logger.info('Configuration updated programmatically');
        } catch (error) {
            this.logger.error('Failed to update configuration', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    static createDefaultConfig(): Config {
        return ConfigSchema.parse({
            global: {
                port: 8080,
                host: 'localhost',
                defaultTimeout: 300000,
                healthCheckInterval: 30000,
                cleanupInterval: 60000,
                logLevel: 'info'
            },
            services: {}
        });
    }
}