import { ServerlessGateway } from "./lib";

// Start the gateway
const gateway = new ServerlessGateway();
gateway.start().catch((error) => {
    console.error('Failed to start gateway:', error);
    process.exit(1);
});