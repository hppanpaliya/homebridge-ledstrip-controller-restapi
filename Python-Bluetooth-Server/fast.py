from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from bleak import BleakClient
import asyncio
import json
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

# Define Pydantic models for the REST API
class PowerCommand(BaseModel):
    device_address: str
    state: str = Field(..., description="'on' or 'off'")

class ColorCommand(BaseModel):
    device_address: str
    red: int = Field(..., ge=0, le=255, description="Red value (0-255)")
    green: int = Field(..., ge=0, le=255, description="Green value (0-255)")
    blue: int = Field(..., ge=0, le=255, description="Blue value (0-255)")

class BrightnessCommand(BaseModel):
    device_address: str
    brightness: int = Field(..., ge=0, le=255, description="Brightness value (0-255)")
    intensity: int = Field(..., ge=0, le=15, description="Intensity value (0-15)")

class MusicModeCommand(BaseModel):
    device_address: str
    mode: int = Field(..., ge=1, le=4, description="Music mode (1-4)")

class MicSensitivityCommand(BaseModel):
    device_address: str
    sensitivity: int = Field(..., ge=41, le=255, description="Mic sensitivity (41-255)")
    scaling: int = Field(..., ge=0, le=15, description="Scaling value (0-15)")

class DeviceState(BaseModel):
    power: bool = False
    red: int = 255
    green: int = 255
    blue: int = 255
    brightness: int = 255
    intensity: int = 15
    music_mode: Optional[int] = None
    mic_sensitivity: Optional[int] = None
    mic_scaling: Optional[int] = None
    connected: bool = False
    last_updated: float = 0

app = FastAPI(
    title="LED Controller API",
    description="Control Bluetooth LED devices via WebSocket and REST API with state management",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LEDController:
    """Enhanced LED Controller with additional features and state management"""
    
    UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
    UART_RX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
    
    def __init__(self, device_address):
        self.device_address = device_address
        self.client = None
        self.last_command = None
        self.state = DeviceState()
        self.state.connected = False
        
    async def connect(self):
        try:
            self.client = BleakClient(self.device_address)
            await self.client.connect()
            self.state.connected = True
            self.state.last_updated = asyncio.get_event_loop().time()
            print(f"Successfully connected to {self.device_address}")
        except Exception as e:
            self.state.connected = False
            print(f"Connection error with {self.device_address}: {e}")
            raise ConnectionError(f"Failed to connect to {self.device_address}: {str(e)}")
    
    async def disconnect(self):
        if self.client and await self.is_connected():
            try:
                await self.client.disconnect()
                self.state.connected = False
                self.state.last_updated = asyncio.get_event_loop().time()
                print(f"Disconnected from {self.device_address}")
            except Exception as e:
                print(f"Error while disconnecting from {self.device_address}: {e}")
    
    async def is_connected(self):
        """Check if the client is connected and return a boolean"""
        if self.client is None:
            return False
        
        # Use the property if available, otherwise call the method
        try:
            # For newer versions of Bleak
            if hasattr(self.client, "is_connected") and isinstance(self.client.is_connected, bool):
                connected = self.client.is_connected
            else:
                # For older versions, convert the result to a boolean
                connected = bool(await self.client.is_connected())
        except Exception as e:
            print(f"Error checking connection status: {e}")
            connected = False
        
        self.state.connected = connected
        return connected
    
    async def ensure_connected(self):
        if not await self.is_connected():
            await self.connect()
            return True  # Reconnected
        return False  # Already connected
            
    async def _write_command(self, data: bytes):
        try:
            if not await self.is_connected():
                print(f"Attempting to reconnect to {self.device_address}...")
                await self.connect()
            await self.client.write_gatt_char(self.UART_RX_CHAR_UUID, data)
            # Store last command for potential retry
            self.last_command = data
            self.state.last_updated = asyncio.get_event_loop().time()
        except Exception as e:
            raise ConnectionError(f"Failed to communicate with LED strip: {str(e)}")
    
    # Power Controls
    async def turn_off(self):
        await self._write_command(bytes.fromhex('5A010200'))
        self.state.power = False
        
    async def turn_on(self):
        await self._write_command(bytes.fromhex('5A0102FF'))
        self.state.power = True
    
    # Color Controls
    async def set_color(self, red: int, green: int, blue: int):
        command = bytes.fromhex(f'5A0701{red:02X}{green:02X}{blue:02X}')
        await self._write_command(command)
        self.state.red = red
        self.state.green = green
        self.state.blue = blue
    
    # Brightness Controls
    async def set_brightness(self, brightness: int, intensity: int):
        """
        Set LED brightness and intensity
        brightness: 0-255
        intensity: 0-15
        """
        command = bytes.fromhex(f'5A0301{brightness:02X}{intensity:02X}')
        await self._write_command(command)
        self.state.brightness = brightness
        self.state.intensity = intensity
    
    # Music Mode Controls
    async def set_music_mode(self, mode: int):
        """
        Set music mode (1-4)
        1: Classic
        2: Vocal
        3: Pop
        4: Rock
        """
        if not 1 <= mode <= 4:
            raise ValueError("Mode must be between 1 and 4")
        command = bytes.fromhex(f'5A09030{mode}')
        await self._write_command(command)
        self.state.music_mode = mode
    
    # Mic Sensitivity Controls
    async def set_mic_sensitivity(self, sensitivity: int, scaling: int):
        """
        Set microphone sensitivity
        sensitivity: 41-255 (29-FF hex)
        scaling: 0-15 (0-F hex)
        """
        command = bytes.fromhex(f'5A0901{sensitivity:02X}{scaling:02X}')
        await self._write_command(command)
        self.state.mic_sensitivity = sensitivity
        self.state.mic_scaling = scaling
    
    def get_state(self) -> Dict[str, Any]:
        """Return the current state as a dictionary"""
        return {
            "power": self.state.power,
            "color": {
                "red": self.state.red,
                "green": self.state.green,
                "blue": self.state.blue
            },
            "brightness": self.state.brightness,
            "intensity": self.state.intensity,
            "music_mode": self.state.music_mode,
            "mic_sensitivity": self.state.mic_sensitivity,
            "mic_scaling": self.state.mic_scaling,
            "connected": self.state.connected,
            "last_updated": self.state.last_updated
        }

# Store active controller instances
controllers: Dict[str, LEDController] = {}

# Helper function to get an existing controller or create a new one
async def get_controller(device_address: str) -> LEDController:
    if device_address not in controllers:
        controllers[device_address] = LEDController(device_address)
    
    controller = controllers[device_address]
    
    # Check if the controller is connected, reconnect if necessary
    try:
        if not await controller.is_connected():
            print(f"Device {device_address} disconnected, attempting to reconnect...")
            try:
                await controller.disconnect()  # Clean up just in case
            except Exception:
                pass
            
            # Connect
            await controller.connect()
    except Exception as e:
        print(f"Error checking connection status: {e}")
        # Attempt to reconnect anyway
        try:
            await controller.disconnect()
        except Exception:
            pass
        
        # Recreate controller and reconnect
        controllers[device_address] = LEDController(device_address)
        controller = controllers[device_address]
        await controller.connect()
    
    return controller

# Websocket client connections tracking
ws_clients = set()

@app.get("/", response_class=HTMLResponse)
async def get_html():
    try:
        with open("index.html", "r") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("<html><body><h1>LED Controller API</h1><p>API documentation available at <a href='/docs'>/docs</a></p></body></html>")

# REST API endpoints
@app.get("/api/devices", summary="Get all devices")
async def get_devices():
    """
    Retrieve a list of all LED devices and their state.
    """
    return {
        "devices": [
            {
                "address": addr,
                "state": controller.get_state()
            }
            for addr, controller in controllers.items()
        ]
    }

@app.get("/api/devices/{device_address}", summary="Get device status")
async def get_device_status(device_address: str):
    """
    Get the state of a specific device.
    """
    if device_address not in controllers:
        return {
            "address": device_address,
            "connected": False,
            "message": "Device not connected, connect first"
        }
    
    controller = controllers[device_address]
    connected = await controller.is_connected()
    
    return {
        "address": device_address,
        "state": controller.get_state()
    }

@app.post("/api/devices/{device_address}/connect", summary="Connect to a device")
async def connect_device(device_address: str):
    """
    Connect to an LED device by its Bluetooth address.
    """
    try:
        controller = await get_controller(device_address)
        return {
            "status": "success",
            "message": f"Connected to {device_address}",
            "state": controller.get_state()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/devices/{device_address}", summary="Disconnect from a device")
async def disconnect_device(device_address: str):
    """
    Disconnect from an LED device.
    """
    if device_address not in controllers:
        return {
            "status": "success",
            "message": "Device not connected"
        }
    
    try:
        await controllers[device_address].disconnect()
        state = controllers[device_address].get_state()
        del controllers[device_address]
        return {
            "status": "success",
            "message": f"Disconnected from {device_address}",
            "state": state
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/power", summary="Turn device on/off")
async def power_control(command: PowerCommand):
    """
    Turn an LED device on or off.
    """
    try:
        controller = await get_controller(command.device_address)
        
        if command.state.lower() == "on":
            await controller.turn_on()
        elif command.state.lower() == "off":
            await controller.turn_off()
        else:
            raise HTTPException(status_code=400, detail="State must be 'on' or 'off'")
        
        # Broadcast state update to all connected WebSocket clients
        await broadcast_state_update(command.device_address)
        
        return {
            "status": "success",
            "message": f"Power set to {command.state}",
            "state": controller.get_state()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/color", summary="Set device color")
async def color_control(command: ColorCommand):
    """
    Set the color of an LED device.
    """
    try:
        controller = await get_controller(command.device_address)
        await controller.set_color(command.red, command.green, command.blue)
        
        # Broadcast state update to all connected WebSocket clients
        await broadcast_state_update(command.device_address)
        
        return {
            "status": "success", 
            "message": f"Color set to RGB({command.red}, {command.green}, {command.blue})",
            "state": controller.get_state()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/brightness", summary="Set device brightness")
async def brightness_control(command: BrightnessCommand):
    """
    Set the brightness and intensity of an LED device.
    """
    try:
        controller = await get_controller(command.device_address)
        await controller.set_brightness(command.brightness, command.intensity)
        
        # Broadcast state update to all connected WebSocket clients
        await broadcast_state_update(command.device_address)
        
        return {
            "status": "success", 
            "message": f"Brightness set to {command.brightness}, intensity {command.intensity}",
            "state": controller.get_state()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/music_mode", summary="Set music mode")
async def music_mode_control(command: MusicModeCommand):
    """
    Set the music mode of an LED device.
    """
    try:
        controller = await get_controller(command.device_address)
        await controller.set_music_mode(command.mode)
        
        # Broadcast state update to all connected WebSocket clients
        await broadcast_state_update(command.device_address)
        
        return {
            "status": "success",
            "message": f"Music mode set to {command.mode}",
            "state": controller.get_state()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/mic_sensitivity", summary="Set microphone sensitivity")
async def mic_sensitivity_control(command: MicSensitivityCommand):
    """
    Set the microphone sensitivity and scaling of an LED device.
    """
    try:
        controller = await get_controller(command.device_address)
        await controller.set_mic_sensitivity(command.sensitivity, command.scaling)
        
        # Broadcast state update to all connected WebSocket clients
        await broadcast_state_update(command.device_address)
        
        return {
            "status": "success", 
            "message": f"Mic sensitivity set to {command.sensitivity}, scaling {command.scaling}",
            "state": controller.get_state()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def broadcast_state_update(device_address: str):
    """Broadcast device state updates to all connected WebSocket clients"""
    if device_address in controllers:
        try:
            state_update = {
                "type": "state_update",
                "device_address": device_address,
                "state": controllers[device_address].get_state()
            }
            
            # Convert to JSON string
            message = json.dumps(state_update)
            
            # Broadcast to all connected clients
            for ws in ws_clients:
                try:
                    await ws.send_text(message)
                except Exception as e:
                    print(f"Error broadcasting state update: {e}")
        except Exception as e:
            print(f"Error preparing state update: {e}")

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)
    device_address = None  # Initialize outside the try block
    
    try:
        # Send initial state for all devices
        for addr, controller in controllers.items():
            try:
                await websocket.send_text(json.dumps({
                    "type": "state_update",
                    "device_address": addr,
                    "state": controller.get_state()
                }))
            except Exception as e:
                print(f"Error sending initial state for {addr}: {e}")
        
        # Main message loop
        while True:
            try:
                # Use a timeout to prevent blocking indefinitely if client disconnects
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                # Process the received data
                try:
                    command = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_text(json.dumps({
                        "status": "error",
                        "message": "Invalid JSON format"
                    }))
                    continue
                
                device_address = command.get('device_address')
                action = command.get('action')
                
                if not device_address:
                    await websocket.send_text(json.dumps({
                        "status": "error",
                        "message": "Missing device address in command"
                    }))
                    continue
                
                try:
                    controller = await get_controller(device_address)
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "status": "error",
                        "message": f"Failed to connect to {device_address}: {str(e)}"
                    }))
                    continue  # Skip to next iteration if connection fails
                
                try:
                    response_data = {"status": "success"}
                    
                    if action == 'power':
                        if command['state'] == 'on':
                            await controller.turn_on()
                            response_data["message"] = "Power turned on"
                        else:
                            await controller.turn_off()
                            response_data["message"] = "Power turned off"
                            
                    elif action == 'color':
                        await controller.set_color(
                            int(command['red']),
                            int(command['green']),
                            int(command['blue'])
                        )
                        response_data["message"] = f"Color set to RGB({command['red']}, {command['green']}, {command['blue']})"
                        
                    elif action == 'brightness':
                        await controller.set_brightness(
                            int(command['brightness']),
                            int(command['intensity'])
                        )
                        response_data["message"] = f"Brightness set to {command['brightness']}, intensity {command['intensity']}"
                        
                    elif action == 'music_mode':
                        await controller.set_music_mode(int(command['mode']))
                        response_data["message"] = f"Music mode set to {command['mode']}"
                        
                    elif action == 'mic_sensitivity':
                        await controller.set_mic_sensitivity(
                            int(command['sensitivity']),
                            int(command['scaling'])
                        )
                        response_data["message"] = f"Mic sensitivity set to {command['sensitivity']}, scaling {command['scaling']}"
                    
                    # Add state to response
                    response_data["state"] = controller.get_state()
                    
                    # Use try-except for sending response in case the client disconnected
                    try:
                        await websocket.send_text(json.dumps(response_data))
                    except Exception as send_error:
                        print(f"Error sending response: {send_error}")
                        break  # Exit the loop if we can't send
                    
                    # Broadcast state update to all other clients
                    for ws in ws_clients:
                        if ws != websocket:  # Skip the client that sent the command
                            try:
                                await ws.send_text(json.dumps({
                                    "type": "state_update",
                                    "device_address": device_address,
                                    "state": controller.get_state()
                                }))
                            except Exception:
                                # Just skip if we can't send to this client
                                pass
                    
                except Exception as e:
                    print(f"Error executing command {action}: {e}")
                    # Try to reconnect if it's a connection error
                    if "Not connected" in str(e) or "Failed to communicate" in str(e):
                        try:
                            await controller.disconnect()
                            await controller.connect()
                            # Retry the command after reconnection
                            try:
                                await websocket.send_text(json.dumps({
                                    "status": "retry",
                                    "message": "Connection re-established, please retry your command"
                                }))
                            except Exception:
                                # If we can't send, the client probably disconnected
                                break
                        except Exception as reconnect_error:
                            try:
                                await websocket.send_text(json.dumps({
                                    "status": "error",
                                    "message": f"Reconnection failed: {str(reconnect_error)}"
                                }))
                            except Exception:
                                break
                    else:
                        # For non-connection errors, just report the error
                        try:
                            await websocket.send_text(json.dumps({
                                "status": "error",
                                "message": str(e)
                            }))
                        except Exception:
                            break
                
            except asyncio.TimeoutError:
                # Send a ping to check if connection is still alive
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    # Connection is probably closed
                    print("WebSocket ping failed, client probably disconnected")
                    break
            
            except WebSocketDisconnect:
                # Client disconnected normally
                print("WebSocket client disconnected")
                break
                
            except Exception as e:
                # Any other error during receive_text()
                print(f"Error processing WebSocket message: {e}")
                break
                
    except Exception as e:
        print(f"WebSocket error: {e}")
    
    finally:
        # Always clean up properly
        if websocket in ws_clients:
            ws_clients.remove(websocket)
        print("WebSocket connection closed and cleaned up")

async def broadcast_other_clients(current_websocket: WebSocket, device_address: str, controller: LEDController):
    """Broadcast state update to all clients except the current one"""
    try:
        message = json.dumps({
            "type": "state_update",
            "device_address": device_address,
            "state": controller.get_state()
        })
        
        for ws in ws_clients:
            if ws != current_websocket:  # Skip the client that sent the command
                try:
                    await ws.send_text(message)
                except Exception:
                    pass
    except Exception as e:
        print(f"Error broadcasting to other clients: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up all device connections when the server shuts down"""
    for device_address, controller in list(controllers.items()):
        try:
            print(f"Disconnecting from {device_address} during shutdown")
            await controller.disconnect()
        except Exception as e:
            print(f"Error disconnecting from {device_address} during shutdown: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)