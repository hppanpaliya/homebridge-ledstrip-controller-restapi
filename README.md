# Homebridge LED Strip Controller

A Homebridge v2.0 plugin for controlling LED strips via a FastAPI backend that communicates with Bluetooth devices.

## Features

- **Basic Controls**: Power (on/off), brightness, and full RGB color
- **Music Mode**: Control music reactive modes (Classic, Vocal, Pop, Rock)
- **Microphone Settings**: Adjust microphone sensitivity and scaling
- **Real-time Updates**: Synchronize state across multiple clients via WebSockets
- **Reliable Connection**: Automatic reconnection if connection is lost

## Installation

```
npm install -g homebridge-ledstrip-controller-restapi
```

## Requirements

- Node.js 18 or later
- Homebridge v1.8.0 or later (including Homebridge v2.0)
- Running instance of the LED Controller API (FastAPI backend)

## Configuration

Configure the plugin through the Homebridge UI or add to your `config.json` manually:

```json
{
  "platforms": [
    {
      "name": "LED Strip Controller",
      "platform": "LEDStripController",
      "devices": [
        {
          "name": "Living Room LED Strip",
          "deviceAddress": "08:14:13:05:3B:A1",
          "apiUrl": "ws://192.168.0.225:8000",
          "enableMusicMode": true,
          "enableMicControls": true,
          "reconnectInterval": 5000
        }
      ]
    }
  ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | - | Name of the LED strip in HomeKit |
| `deviceAddress` | string | - | Bluetooth address of the LED strip |
| `apiUrl` | string | - | Base URL of the LED Controller API (without trailing slash) |
| `enableMusicMode` | boolean | false | Add music mode controls to HomeKit |
| `enableMicControls` | boolean | false | Add microphone sensitivity controls to HomeKit |
| `reconnectInterval` | number | 5000 | Time in ms to wait before reconnecting if WebSocket disconnects |

## HomeKit Integration

When configured with all features enabled, each LED strip will appear in HomeKit with:

1. **Primary Light**: RGB light with brightness control
2. **Music Mode Switches**: 
   - Master switch to enable/disable music mode
   - Individual switches for each music mode (Classic, Vocal, Pop, Rock)
3. **Microphone Controls**:
   - Mic Sensitivity: Controls how sensitive the microphone is (41-255)
   - Mic Scaling: Controls the intensity of the audio response (0-15)

## API Server

This plugin requires the FastAPI backend server included with this project. The server communicates with the Bluetooth LED devices and provides both REST API and WebSocket interfaces.

Make sure the server is running and accessible before configuring the plugin.

## Troubleshooting

### Common Issues

1. **Connection Problems**: 
   - Ensure the API server is running and accessible
   - Check that the correct device address is configured
   - Verify the API URL is correct and includes the protocol (e.g., http://)

2. **Controls Not Working**:
   - Check if the LED strip is powered on
   - Verify the Bluetooth connection is stable
   - Check the Homebridge logs for errors

### Debug Logging

Start Homebridge with the debug flag for more detailed logs:

```
homebridge -D
```

## License

Apache License 2.0