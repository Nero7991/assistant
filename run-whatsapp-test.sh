#!/bin/bash

# Load environment variables from .env file
export $(grep -v '^#' .env | xargs)

# Run the WhatsApp integration test with server config
npx vitest run --config vitest.server.config.ts tests/test-whatsapp-integration.test.ts