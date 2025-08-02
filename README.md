# Gemini CLI Analytics Dashboard

This project provides an analytics dashboard for the Gemini CLI, allowing you to monitor real-time metrics, track token usage, and visualize telemetry data.

<img width="946" height="639" alt="Screenshot 2025-08-02 at 12 17 27" src="https://github.com/user-attachments/assets/3d62830c-8ba0-46e5-ba75-b2f3e16a1b05" />

## Quick Start

### Prerequisites

*   [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed
*   Node.js 18+
*   Docker (for the Jaeger telemetry backend)

### 1. Install Gemini CLI

```bash
npm install -g @google/gemini-cli
```

### 2. Run Gemini with Telemetry

For the dashboard to receive data, you need to run your `gemini` commands with the `--telemetry -- --target=local` flag.

```bash
gemini --telemetry -- --target=local
```

### 3. Launch the Analytics Dashboard

You can launch the dashboard using `npx` (recommended) or by cloning the repository locally.

**Option A: Using npx**

This command will run the latest version of the dashboard without needing to clone the repository.

```bash
npx gemini-cli-templates@latest --analytics
```

**Option B: Clone and run locally**

```bash
git clone https://github.com/davila7/gemini-cli-templates.git
cd gemini-cli-templates
npm install
npm start
```

### 4. View Analytics

Once the dashboard is running, open [http://localhost:3337](http://localhost:3337) in your browser to see the analytics interface.

## Features

*   **Real-time Metrics:** Track sessions, tool usage, token consumption, and API calls.
*   **Interactive Charts:** Visualize token usage, session activity, and API response times.
*   **Data Filtering:** Analyze data by date range (last 7, 30, 90 days, or custom).
*   **Log Viewer:** Inspect detailed, paginated logs for metrics and traces.
*   **Data Export:** Download analytics data as a JSON file.

## Contributing

Contributions are welcome. Please follow these steps:

1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/your-feature`).
3.  Commit your changes (`git commit -m 'Add your feature'`).
4.  Push to the branch (`git push origin feature/your-feature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
