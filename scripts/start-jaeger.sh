#!/bin/bash

# Container name
CONTAINER_NAME="gemini-jaeger"

# Stop any containers using our ports
echo "Cleaning up existing containers..."
docker ps --format "table {{.ID}}\t{{.Ports}}" | grep -E "(16686|14317)" | awk '{print $1}' | xargs -r docker stop > /dev/null 2>&1

# Remove our named container if it exists
docker rm $CONTAINER_NAME > /dev/null 2>&1

# Wait a moment for ports to be released
sleep 2

# Start new container with Gemini CLI compatible configuration
echo "Starting Jaeger container..."
if docker run --rm -d --name $CONTAINER_NAME \
    -p 16686:16686 \
    -p 14317:14317 \
    -p 4317:4317 \
    jaegertracing/all-in-one:latest; then
    echo "Jaeger started at http://localhost:16686"
else
    echo "Failed to start Jaeger. Checking for port conflicts..."
    lsof -i :16686,14317 2>/dev/null || echo "No processes found on ports 16686/14317"
    exit 1
fi