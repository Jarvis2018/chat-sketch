#!/bin/bash
# Start both the web panel dev server and the Sketch plugin

echo "🚀 Starting Chat Sketch Development Environment"
echo ""
echo "1. Starting Vite dev server for web panel..."
echo "   URL: http://localhost:3000"
echo ""
echo "2. Make sure the plugin is built and linked:"
echo "   npm run build"
echo ""
echo "3. Open Sketch and run: Plugins → Chat Sketch → Open Panel"
echo ""

# Start the Vite dev server in the background
cd "$(dirname "$0")"
npm run dev
