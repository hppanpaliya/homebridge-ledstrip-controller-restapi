// src/platform.ts
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import WebSocket from 'ws';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { LEDStripAccessory } from './platformAccessory.js';
import { DeviceConfig } from './types.js';

export class LEDStripPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private wsConnections: Map<string, WebSocket> = new Map();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices(): void {
    const devices = (this.config.devices || []) as DeviceConfig[];

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.deviceAddress);
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        this.setupWebSocket(device.apiUrl);
        new LEDStripAccessory(this, existingAccessory, device);
      } else {
        this.log.info('Adding new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;
        this.setupWebSocket(device.apiUrl);
        new LEDStripAccessory(this, accessory, device);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove platforms that are no longer configured
    this.accessories.forEach(accessory => {
      const device = devices.find(d => this.api.hap.uuid.generate(d.deviceAddress) === accessory.UUID);
      if (!device) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    });
  }

  setupWebSocket(apiUrl: string): void {
    if (this.wsConnections.get(apiUrl)?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(apiUrl);

    ws.on('open', () => {
      this.log.info('WebSocket connected to:', apiUrl);
    });

    ws.on('error', (error) => {
      this.log.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      this.log.info('WebSocket closed, attempting to reconnect...');
      this.wsConnections.delete(apiUrl);
      setTimeout(() => this.setupWebSocket(apiUrl), 5000);
    });

    this.wsConnections.set(apiUrl, ws);
  }

  sendCommand(deviceAddress: string, command: Record<string, unknown>): void {
    const device = (this.config.devices as DeviceConfig[]).find(d => d.deviceAddress === deviceAddress);
    if (!device) {
      this.log.error('Device not found:', deviceAddress);
      return;
    }

    const ws = this.wsConnections.get(device.apiUrl);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        device_address: deviceAddress,
        ...command,
      }));
    } else {
      this.log.error('WebSocket not connected for device:', deviceAddress);
    }
  }
}