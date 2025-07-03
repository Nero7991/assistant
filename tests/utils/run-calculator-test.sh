#!/bin/bash

echo "🧪 Calculator Web Server Agent Test"
echo "=================================="
echo ""
echo "This script will guide you through testing the agent's ability"
echo "to create a calculator web server."
echo ""
echo "Prerequisites:"
echo "- Kona server running on port 5001"
echo "- Test user credentials ready"
echo ""
read -p "Press Enter to start the WebSocket CLI tester..."

# Start the CLI tester
echo ""
echo "Starting WebSocket CLI Tester..."
echo "Please login with your test credentials when prompted."
echo ""
cd "$(dirname "$0")"
npx tsx websocket-cli-tester.ts

# The script ends when the user exits the CLI tester