import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import WebSocket from 'ws';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { LEDStripAccessory } from './platformAccessory.js';
import { DeviceConfig, LEDState, WSCommand, WSResponse } from './types.js';

/**
 * LED Strip Platform
 * Handles device discovery, WebSocket connections, and communication with the LED controller API
 */
export class LEDStripPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  
  // Store active WebSocket connections
  private wsConnections: Map<string, WebSocket> = new Map();
  
  // Store device states
  private deviceStates: Map<string, LEDState> = new Map();
  
  // Store accessory instances by device address
  private accessoryInstances: Map<string, LEDStripAccessory> = new Map();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.debug('Initializing LED Strip Controller platform');

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  /**
   * Called when homebridge restores cached accessories from disk
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Discover and register devices from config
   */
  discoverDevices(): void {
    const devices = (this.config.devices || []) as DeviceConfig[];

    // Loop through configured devices
    for (const device of devices) {
      // Generate UUID based on device address
      const uuid = this.api.hap.uuid.generate(device.deviceAddress);
      
      // Check if an accessory with the same UUID already exists
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // Accessory already exists, restore it
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        
        // Update the accessory context
        existingAccessory.context.device = device;
        
        // Create the accessory handler
        const ledAccessory = new LEDStripAccessory(this, existingAccessory, device);
        this.accessoryInstances.set(device.deviceAddress, ledAccessory);
        
        // Setup WebSocket and initialize the state
        this.setupWebSocket(device);
      } else {
        // Create a new accessory
        this.log.info('Adding new accessory:', device.name);
        
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;
        
        // Create the accessory handler
        const ledAccessory = new LEDStripAccessory(this, accessory, device);
        this.accessoryInstances.set(device.deviceAddress, ledAccessory);
        
        // Setup WebSocket and initialize the state
        this.setupWebSocket(device);
        
        // Register the accessory
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }
    }

    // Remove accessories that are no longer configured
    this.cleanupAccessories(devices);
  }

  /**
   * Remove accessories that are no longer in the config
   */
  private cleanupAccessories(configuredDevices: DeviceConfig[]): void {
    const removedAccessories: PlatformAccessory[] = [];
    
    this.accessories.forEach(accessory => {
      const isConfigured = configuredDevices.some(
        device => this.api.hap.uuid.generate(device.deviceAddress) === accessory.UUID,
      );
      
      if (!isConfigured) {
        this.log.info('Removing accessory:', accessory.displayName);
        removedAccessories.push(accessory);
      }
    });
    
    if (removedAccessories.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removedAccessories);
    }
  }

  /**
   * Setup WebSocket connection for a device
   */
  setupWebSocket(device: DeviceConfig): void {
    // Create WebSocket URL
    const wsUrl = `${device.apiUrl.replace(/\/$/, '')}/ws`;
    
    // If already connected, don't reconnect
    if (this.wsConnections.get(wsUrl)?.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.log.debug(`Setting up WebSocket connection for ${device.name} at ${wsUrl}`);
    
    try {
      const ws = new WebSocket(wsUrl);
      
      // Handle WebSocket open event
      ws.on('open', () => {
        this.log.info(`WebSocket connected for ${device.name}`);
      });
      
      // Handle WebSocket messages
      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString()) as WSResponse;
          
          // Check if it's a state update
          if (response.type === 'state_update' && response.device_address && response.state) {
            // Store device state
            this.deviceStates.set(response.device_address, response.state);
            
            // Update accessory state
            const accessory = this.accessoryInstances.get(response.device_address);
            if (accessory) {
              accessory.updateFromState(response.state);
            }
            
            this.log.debug(`Received state update for ${device.name}`);
          }
        } catch (error) {
          this.log.error(`Error processing WebSocket message for ${device.name}:`, error);
        }
      });
      
      // Handle WebSocket errors
      ws.on('error', (error) => {
        this.log.error(`WebSocket error for ${device.name}:`, error);
      });
      
      // Handle WebSocket close
      ws.on('close', () => {
        this.log.info(`WebSocket closed for ${device.name}, attempting to reconnect...`);
        this.wsConnections.delete(wsUrl);
        
        // Try to reconnect after delay
        const reconnectInterval = device.reconnectInterval || 5000;
        setTimeout(() => this.setupWebSocket(device), reconnectInterval);
      });
      
      // Store the WebSocket connection
      this.wsConnections.set(wsUrl, ws);
      
    } catch (error) {
      this.log.error(`Failed to setup WebSocket for ${device.name}:`, error);
    }
  }

  /**
   * Send a command to a device via WebSocket
   */
  sendCommand(deviceAddress: string, command: WSCommand): void {
    const device = (this.config.devices as DeviceConfig[]).find(d => d.deviceAddress === deviceAddress);
    
    if (!device) {
      this.log.error(`Device with address ${deviceAddress} not found in config`);
      return;
    }
    
    const wsUrl = `${device.apiUrl.replace(/\/$/, '')}/ws`;
    const ws = this.wsConnections.get(wsUrl);
    
    if (ws?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        ...command,
        device_address: deviceAddress,
      });
      
      ws.send(message);
      this.log.debug(`Sent command to ${device.name}:`, command);
    } else {
      this.log.warn(`WebSocket not connected for ${device.name}, attempting to reconnect...`);
      
      // Try to reconnect
      this.setupWebSocket(device);
      
      // Retry sending the command after a short delay
      setTimeout(() => {
        const reconnectedWs = this.wsConnections.get(wsUrl);
        
        if (reconnectedWs?.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            ...command,
            device_address: deviceAddress,
          });
          
          reconnectedWs.send(message);
          this.log.debug(`Retried command to ${device.name} after reconnection:`, command);
        } else {
          this.log.error(`Failed to send command to ${device.name}, WebSocket not connected`);
        }
      }, 1000);
    }
  }

  /**
   * Get current state for a device
   */
  getDeviceState(deviceAddress: string): LEDState | undefined {
    return this.deviceStates.get(deviceAddress);
  }
}