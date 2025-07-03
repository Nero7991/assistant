#!/bin/bash

# Load environment variables
source .env

# Export all variables
export $(cat .env | grep -v '^#' | xargs)

# Run the WhatsApp tests
echo "Running WhatsApp integration tests..."
npx vitest run tests/test-whatsapp-integration.test.ts tests/test-whatsapp-twilio-integration.test.ts --reporter=verbose