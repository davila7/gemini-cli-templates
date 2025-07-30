# Gemini CLI Dashboard

This project provides a simple web-based dashboard to visualize real-time analytics from the Gemini CLI.

## Requirements

You need to have **Gemini CLI** installed and the official telemetry setup running.

## Quick Start

1. **Start the official Gemini CLI telemetry environment:**
   ```bash
   cd /path/to/gemini-cli
   npm run telemetry -- --target=local
   ```

2. **Launch the dashboard:**
   ```bash
   npx gemini-cli-dashboard@latest --analytics
   ```

3. **Use Gemini CLI to generate telemetry data:**
   ```bash
   cd /path/to/gemini-cli
   gemini "Analyze this project"
   gemini "What files are in this directory?"
   ```

4. **View the dashboard:**
   Open `http://localhost:3337` to see the analytics dashboard.

## How it Works

The dashboard connects to the official Gemini CLI telemetry setup:
- **Gemini CLI** sends telemetry data to an OpenTelemetry Collector (port 4317)
- **OpenTelemetry Collector** processes and forwards data to Jaeger (port 14317) 
- **Jaeger UI** runs on port 16686
- **This dashboard** provides a simplified view by connecting to the Jaeger API