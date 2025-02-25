# LED Controller Server Documentation

## Overview

This server provides a web interface, REST API, and WebSocket interface to control Bluetooth LED devices. It's designed to be resilient to connection issues and automatically handles reconnection when devices lose power or connection.

## Features

- Control multiple Bluetooth LED devices simultaneously
- Automatic reconnection if devices lose power or connection
- Both REST API and WebSocket interfaces
- Web interface for easy control
- Supports various LED features:
  - Power on/off
  - RGB color control
  - Brightness and intensity adjustment
  - Music mode selection
  - Microphone sensitivity adjustment

## Installation

### Prerequisites

- Python 3.8+
- FastAPI
- Bleak (Bluetooth Low Energy library)
- Uvicorn (ASGI server)
- WebSockets

### Setup

1. Install dependencies:
   ```bash
   pip install fastapi bleak uvicorn pydantic websockets
   ```

2. Create the `index.html` file for the web interface
3. Run the server:
   ```bash
   python fast.py
   ```

## API Documentation

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web interface |
| `/api/devices` | GET | List all connected devices |
| `/api/devices/{device_address}` | GET | Get device connection status |
| `/api/devices/{device_address}/connect` | POST | Connect to a device |
| `/api/devices/{device_address}` | DELETE | Disconnect from a device |
| `/api/power` | POST | Turn device on/off |
| `/api/color` | POST | Set device color |
| `/api/brightness` | POST | Set device brightness |
| `/api/music_mode` | POST | Set music mode |
| `/api/mic_sensitivity` | POST | Set microphone sensitivity |

### WebSocket Interface

Connect to `/ws` endpoint and send JSON commands.

## Data Formats

### REST API Request Bodies

#### Power Control

```json
{
  "device_address": "08:14:13:05:3B:A0",
  "state": "on"  // "on" or "off"
}
```

#### Color Control

```json
{
  "device_address": "08:14:13:05:3B:A0",
  "red": 255,    // 0-255
  "green": 0,    // 0-255
  "blue": 127    // 0-255
}
```

#### Brightness Control

```json
{
  "device_address": "08:14:13:05:3B:A0",
  "brightness": 200,  // 0-255
  "intensity": 10     // 0-15
}
```

#### Music Mode Control

```json
{
  "device_address": "08:14:13:05:3B:A0",
  "mode": 2  // 1-4
}
```

#### Mic Sensitivity Control

```json
{
  "device_address": "08:14:13:05:3B:A0",
  "sensitivity": 150,  // 41-255
  "scaling": 10        // 0-15
}
```

### WebSocket Command Format

```json
{
  "device_address": "08:14:13:05:3B:A0",
  "action": "power",  // "power", "color", "brightness", "music_mode", "mic_sensitivity"
  // Additional parameters based on action
  "state": "on"  // For power action
  // OR
  "red": 255, "green": 0, "blue": 127  // For color action
  // etc.
}
```

### Response Format

#### REST API Responses

```json
{
  "status": "success",
  "message": "Command details here"
}
```

#### WebSocket Responses

```json
{
  "status": "success",  // "success", "error", "retry"
  "message": "Command details or error information"
}
```

## Error Handling

The server handles various error conditions:

- If a device is not connected, it attempts to connect automatically
- If a device loses connection, it attempts to reconnect
- If a command fails due to connection issues, it tries to reconnect and informs the client to retry
- Input validation ensures valid parameters are provided
- Detailed error messages are provided when commands fail

## Example Usage

### REST API Examples

#### Connect to a Device

```bash
curl -X POST http://localhost:8000/api/devices/08:14:13:05:3B:A0/connect
```

#### Turn on a Device

```bash
curl -X POST http://localhost:8000/api/power \
  -H "Content-Type: application/json" \
  -d '{"device_address": "08:14:13:05:3B:A0", "state": "on"}'
```

#### Set Color to Red

```bash
curl -X POST http://localhost:8000/api/color \
  -H "Content-Type: application/json" \
  -d '{"device_address": "08:14:13:05:3B:A0", "red": 255, "green": 0, "blue": 0}'
```

### WebSocket Examples

Using JavaScript:

```javascript
const ws = new WebSocket("ws://localhost:8000/ws");

// Turn on the device
ws.send(JSON.stringify({
  device_address: "08:14:13:05:3B:A0",
  action: "power",
  state: "on"
}));

// Set color to green
ws.send(JSON.stringify({
  device_address: "08:14:13:05:3B:A0",
  action: "color",
  red: 0,
  green: 255,
  blue: 0
}));

// Listen for responses
ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log(response);
  
  // Handle retry status
  if (response.status === "retry") {
    // Resend the last command
  }
};
```

## Bluetooth LED Protocol

The server uses the following Bluetooth protocol for controlling LED devices:

| Command | Hex Format | Description |
|---------|------------|-------------|
| Power On | `5A0102FF` | Turn LED strip on |
| Power Off | `5A010200` | Turn LED strip off |
| Set Color | `5A0701RRGGBB` | Set RGB color (RR, GG, BB are hex values) |
| Set Brightness | `5A0301BBII` | Set brightness (BB) and intensity (II) |
| Set Music Mode | `5A09030M` | Set music mode (M=1-4) |
| Set Mic Sensitivity | `5A090101SSII` | Set mic sensitivity (SS) and scaling (II) |

## Troubleshooting

### Common Issues

1. **Device won't connect**
   - Ensure the device is powered on
   - Verify the Bluetooth address is correct
   - Check if another application is using the device

2. **Intermittent connection issues**
   - The server automatically attempts to reconnect
   - Commands that fail due to connection issues will trigger a reconnection attempt
   - If persistence is required, use the REST API with retry logic

3. **Server won't start**
   - Check if the required port (8000) is available
   - Ensure all dependencies are installed
   - Verify you have Bluetooth permissions (may require running as admin/sudo)

## Additional Tips

### Creating a Client Application

You can create client applications that communicate with this server using either the REST API or WebSockets:

1. **Mobile App**: Use the REST API for simpler implementations
2. **Web App**: Use WebSockets for real-time updates and control
3. **Home Automation**: Integrate with systems like Home Assistant using the REST API

### Performance Considerations

- The server maintains persistent connections to each LED device
- For large numbers of devices, consider monitoring system resources
- Connection attempts have timeouts to prevent hanging requests

### Security Considerations

- This server does not implement authentication or encryption
- Consider running it on a private network
- Add authentication middleware if exposing to untrusted networks