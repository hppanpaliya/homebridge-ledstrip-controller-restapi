import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceConfig, LEDState, HSVColor, RGBColor } from './types.js';
import { MANUFACTURER, MODEL, FIRMWARE_VERSION, MusicMode, MIC_SENSITIVITY, MIC_SCALING } from './settings.js';
import type { LEDStripPlatform } from './platform.js';

/**
 * LED Strip Accessory
 * Implements the HomeKit accessory for LED strip controller
 */
export class LEDStripAccessory {
  // Services
  private lightbulbService: Service;
  private musicModeService?: Service;
  private musicModeSwitches: Map<number, Service> = new Map();
  private micSensitivityService?: Service;
  private micScalingService?: Service;

  // Current state
  private state = {
    on: false,
    brightness: 100,
    hue: 0,
    saturation: 0,
    musicMode: MusicMode.OFF,
    micSensitivity: MIC_SENSITIVITY.DEFAULT,
    micScaling: MIC_SCALING.DEFAULT,
  };

  constructor(
    private readonly platform: LEDStripPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DeviceConfig,
  ) {
    // Setup accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, MODEL)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceAddress)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, FIRMWARE_VERSION);

    // Create the lightbulb service as the PRIMARY service
    this.lightbulbService = this.accessory.getService(this.platform.Service.Lightbulb) ||
                          this.accessory.addService(this.platform.Service.Lightbulb, device.name, 'main-light');
    
    this.lightbulbService.setCharacteristic(this.platform.Characteristic.Name, device.name);
    // Mark as primary service
    this.lightbulbService.setPrimaryService(true);

    // Configure lightbulb characteristics
    this.lightbulbService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))
      .onGet(this.getBrightness.bind(this));

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this))
      .onGet(this.getHue.bind(this));

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setSaturation.bind(this))
      .onGet(this.getSaturation.bind(this));

    // Setup additional features if enabled
    if (device.enableMusicMode) {
      this.setupMusicMode();
    }

    if (device.enableMicControls) {
      this.setupMicControls();
    }
  }

  /**
   * Setup music mode services
   */
  private setupMusicMode(): void {
    // Create main music mode switch
    const musicModeServiceName = 'Music Mode';
    this.musicModeService = this.accessory.getService(musicModeServiceName) ||
                          this.accessory.addService(this.platform.Service.Switch, musicModeServiceName, 'music-mode');
    
    this.musicModeService.setCharacteristic(this.platform.Characteristic.Name, musicModeServiceName);
    
    // If ConfiguredName characteristic exists (newer HomeKit versions)
    if (this.platform.Characteristic.ConfiguredName) {
      this.musicModeService.setCharacteristic(this.platform.Characteristic.ConfiguredName, musicModeServiceName);
    }
    
    this.musicModeService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setMusicModeEnabled.bind(this))
      .onGet(this.getMusicModeEnabled.bind(this));

    // Link to primary service
    this.lightbulbService.addLinkedService(this.musicModeService);

    // Create individual mode switches
    this.setupMusicModeSwitch(MusicMode.CLASSIC, 'Classic Mode');
    this.setupMusicModeSwitch(MusicMode.VOCAL, 'Vocal Mode');
    this.setupMusicModeSwitch(MusicMode.POP, 'Pop Mode');
    this.setupMusicModeSwitch(MusicMode.ROCK, 'Rock Mode');
  }

  /**
   * Setup individual music mode switch
   */
  private setupMusicModeSwitch(mode: MusicMode, name: string): void {
    const subtype = `music-mode-${mode}`;
    const service = this.accessory.getService(name) ||
                  this.accessory.addService(this.platform.Service.Switch, name, subtype);
    
    service.setCharacteristic(this.platform.Characteristic.Name, name);
    
    // Set ConfiguredName if available
    if (this.platform.Characteristic.ConfiguredName) {
      service.setCharacteristic(this.platform.Characteristic.ConfiguredName, name);
    }
    
    service.getCharacteristic(this.platform.Characteristic.On)
      .onSet((value) => this.setMusicMode(mode, value as boolean))
      .onGet(() => this.getMusicMode(mode));
    
    // Link to the main music mode service
    if (this.musicModeService) {
      this.musicModeService.addLinkedService(service);
    }
    
    this.musicModeSwitches.set(mode, service);
  }

  /**
   * Setup microphone control services
   */
  private setupMicControls(): void {
    // Create mic sensitivity service (using Lightbulb service with brightness)
    const micSensitivityName = 'Mic Sensitivity';
    this.micSensitivityService = this.accessory.getService(micSensitivityName) ||
                                this.accessory.addService(this.platform.Service.Lightbulb, micSensitivityName, 'mic-sensitivity');
    
    this.micSensitivityService.setCharacteristic(this.platform.Characteristic.Name, micSensitivityName);
    
    // Set ConfiguredName if available
    if (this.platform.Characteristic.ConfiguredName) {
      this.micSensitivityService.setCharacteristic(this.platform.Characteristic.ConfiguredName, micSensitivityName);
    }
    
    this.micSensitivityService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setMicSensitivityEnabled.bind(this))
      .onGet(this.getMicSensitivityEnabled.bind(this));
    
    this.micSensitivityService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setMicSensitivity.bind(this))
      .onGet(this.getMicSensitivity.bind(this));

    // Link to primary service
    this.lightbulbService.addLinkedService(this.micSensitivityService);

    // Create mic scaling service (using Lightbulb service with brightness)
    const micScalingName = 'Mic Scaling';
    this.micScalingService = this.accessory.getService(micScalingName) ||
                            this.accessory.addService(this.platform.Service.Lightbulb, micScalingName, 'mic-scaling');
    
    this.micScalingService.setCharacteristic(this.platform.Characteristic.Name, micScalingName);
    
    // Set ConfiguredName if available
    if (this.platform.Characteristic.ConfiguredName) {
      this.micScalingService.setCharacteristic(this.platform.Characteristic.ConfiguredName, micScalingName);
    }
    
    this.micScalingService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setMicScalingEnabled.bind(this))
      .onGet(this.getMicScalingEnabled.bind(this));
    
    this.micScalingService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setMicScaling.bind(this))
      .onGet(this.getMicScaling.bind(this));

    // Link to primary service
    this.lightbulbService.addLinkedService(this.micScalingService);
  }

  /**
   * Update the accessory state from a device state
   */
  updateFromState(state: LEDState): void {
    // Update power state
    if (state.power !== undefined) {
      this.state.on = state.power;
      this.lightbulbService.updateCharacteristic(this.platform.Characteristic.On, this.state.on);
    }

    // Update brightness
    if (state.brightness !== undefined) {
      // Convert 0-255 to 0-100 scale
      this.state.brightness = Math.round((state.brightness / 255) * 100);
      this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Brightness, this.state.brightness);
    }

    // Update color
    if (state.color) {
      const { red, green, blue } = state.color;
      const { hue, saturation } = this.RGBtoHSV(red, green, blue);
      
      this.state.hue = hue;
      this.state.saturation = saturation;
      
      this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Hue, this.state.hue);
      this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Saturation, this.state.saturation);
    }

    // Update music mode
    if (state.music_mode !== undefined && state.music_mode !== null) {
      this.state.musicMode = state.music_mode;
      
      // Update music mode switch
      if (this.musicModeService) {
        const musicModeEnabled = this.state.musicMode > 0;
        this.musicModeService.updateCharacteristic(this.platform.Characteristic.On, musicModeEnabled);
      }
      
      // Update individual mode switches
      this.musicModeSwitches.forEach((service, mode) => {
        service.updateCharacteristic(this.platform.Characteristic.On, this.state.musicMode === mode);
      });
    }

    // Update mic sensitivity
    if (state.mic_sensitivity !== undefined && state.mic_sensitivity !== null && this.micSensitivityService) {
      this.state.micSensitivity = state.mic_sensitivity;
      
      // Convert from 41-255 to 0-100 scale
      const sensitivityPercent = Math.round(((this.state.micSensitivity - MIC_SENSITIVITY.MIN) / 
        (MIC_SENSITIVITY.MAX - MIC_SENSITIVITY.MIN)) * 100);
      
      this.micSensitivityService.updateCharacteristic(this.platform.Characteristic.Brightness, sensitivityPercent);
    }

    // Update mic scaling
    if (state.mic_scaling !== undefined && state.mic_scaling !== null && this.micScalingService) {
      this.state.micScaling = state.mic_scaling;
      
      // Convert from 0-15 to 0-100 scale
      const scalingPercent = Math.round((this.state.micScaling / MIC_SCALING.MAX) * 100);
      
      this.micScalingService.updateCharacteristic(this.platform.Characteristic.Brightness, scalingPercent);
    }
  }

  /**
   * Handle power characteristic set
   */
  async setOn(value: CharacteristicValue): Promise<void> {
    this.state.on = value as boolean;
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'power',
      state: value ? 'on' : 'off',
    });
    
    this.platform.log.debug(`Set ${this.device.name} power to: ${value ? 'on' : 'off'}`);
  }

  /**
   * Handle power characteristic get
   */
  async getOn(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState) {
      this.state.on = deviceState.power;
    }
    return this.state.on;
  }

  /**
   * Handle brightness characteristic set
   */
  async setBrightness(value: CharacteristicValue): Promise<void> {
    this.state.brightness = value as number;
    
    // Convert from 0-100 to 0-255
    const brightness = Math.round((value as number) * 2.55);
    // Convert from 0-100 to 0-15
    const intensity = Math.round((value as number) / 6.67);
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'brightness',
      brightness,
      intensity,
    });
    
    this.platform.log.debug(`Set ${this.device.name} brightness to: ${value}%`);
  }

  /**
   * Handle brightness characteristic get
   */
  async getBrightness(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState) {
      this.state.brightness = Math.round((deviceState.brightness / 255) * 100);
    }
    return this.state.brightness;
  }

  /**
   * Handle hue characteristic set
   */
  async setHue(value: CharacteristicValue): Promise<void> {
    this.state.hue = value as number;
    this.updateColor();
    this.platform.log.debug(`Set ${this.device.name} hue to: ${value}`);
  }

  /**
   * Handle hue characteristic get
   */
  async getHue(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState && deviceState.color) {
      const { hue } = this.RGBtoHSV(
        deviceState.color.red,
        deviceState.color.green,
        deviceState.color.blue,
      );
      this.state.hue = hue;
    }
    return this.state.hue;
  }

  /**
   * Handle saturation characteristic set
   */
  async setSaturation(value: CharacteristicValue): Promise<void> {
    this.state.saturation = value as number;
    this.updateColor();
    this.platform.log.debug(`Set ${this.device.name} saturation to: ${value}%`);
  }

  /**
   * Handle saturation characteristic get
   */
  async getSaturation(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState && deviceState.color) {
      const { saturation } = this.RGBtoHSV(
        deviceState.color.red,
        deviceState.color.green,
        deviceState.color.blue,
      );
      this.state.saturation = saturation;
    }
    return this.state.saturation;
  }

  /**
   * Handle music mode enabled set
   */
  async setMusicModeEnabled(value: CharacteristicValue): Promise<void> {
    const enabled = value as boolean;
    
    if (enabled) {
      // If turning on, set to last mode or default to Classic
      const mode = this.state.musicMode > 0 ? this.state.musicMode : MusicMode.CLASSIC;
      this.state.musicMode = mode;
      
      this.platform.sendCommand(this.device.deviceAddress, {
        action: 'music_mode',
        mode,
      });
      
      // Update individual mode switches
      this.musicModeSwitches.forEach((service, modeValue) => {
        service.updateCharacteristic(this.platform.Characteristic.On, modeValue === mode);
      });
    } else {
      // Can't directly turn off music mode, so we'll just track state locally
      this.state.musicMode = MusicMode.OFF;
      
      // Turn off all mode switches
      this.musicModeSwitches.forEach(service => {
        service.updateCharacteristic(this.platform.Characteristic.On, false);
      });
    }
    
    this.platform.log.debug(`Set ${this.device.name} music mode enabled: ${enabled}`);
  }

  /**
   * Handle music mode enabled get
   */
  async getMusicModeEnabled(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState && deviceState.music_mode !== undefined && deviceState.music_mode !== null) {
      this.state.musicMode = deviceState.music_mode;
    }
    return this.state.musicMode > 0;
  }

  /**
   * Handle music mode set for a specific mode
   */
  async setMusicMode(mode: MusicMode, value: boolean): Promise<void> {
    if (!value) {
      // If turning off, don't do anything
      return;
    }
    
    // Set the music mode
    this.state.musicMode = mode;
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'music_mode',
      mode,
    });
    
    // Update main music mode switch
    if (this.musicModeService) {
      this.musicModeService.updateCharacteristic(this.platform.Characteristic.On, true);
    }
    
    // Update other mode switches to off
    this.musicModeSwitches.forEach((service, modeValue) => {
      if (modeValue !== mode) {
        service.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    });
    
    this.platform.log.debug(`Set ${this.device.name} music mode to: ${mode}`);
  }

  /**
   * Handle music mode get for a specific mode
   */
  async getMusicMode(mode: MusicMode): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState && deviceState.music_mode !== undefined && deviceState.music_mode !== null) {
      this.state.musicMode = deviceState.music_mode;
    }
    return this.state.musicMode === mode;
  }

  /**
   * Handle mic sensitivity enabled set
   */
  async setMicSensitivityEnabled(value: CharacteristicValue): Promise<void> {
    // This is just a placeholder since we don't have a direct on/off for sensitivity
    console.log('setMicSensitivityEnabled', value);
    return;
  }

  /**
   * Handle mic sensitivity enabled get
   */
  async getMicSensitivityEnabled(): Promise<CharacteristicValue> {
    // Always return true since we don't have a direct on/off for sensitivity
    return true;
  }

  /**
   * Handle mic sensitivity set
   */
  async setMicSensitivity(value: CharacteristicValue): Promise<void> {
    // Convert from 0-100 to MIC_SENSITIVITY.MIN-MIC_SENSITIVITY.MAX range
    const sensitivity = Math.round(((value as number) / 100) * 
      (MIC_SENSITIVITY.MAX - MIC_SENSITIVITY.MIN) + MIC_SENSITIVITY.MIN);
    
    this.state.micSensitivity = sensitivity;
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'mic_sensitivity',
      sensitivity,
      scaling: this.state.micScaling,
    });
    
    this.platform.log.debug(`Set ${this.device.name} mic sensitivity to: ${sensitivity}`);
  }

  /**
   * Handle mic sensitivity get
   */
  async getMicSensitivity(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState && deviceState.mic_sensitivity !== undefined && deviceState.mic_sensitivity !== null) {
      this.state.micSensitivity = deviceState.mic_sensitivity;
    }
    
    // Convert from MIC_SENSITIVITY.MIN-MIC_SENSITIVITY.MAX to 0-100 range
    return Math.round(((this.state.micSensitivity - MIC_SENSITIVITY.MIN) / 
      (MIC_SENSITIVITY.MAX - MIC_SENSITIVITY.MIN)) * 100);
  }

  /**
   * Handle mic scaling enabled set
   */
  async setMicScalingEnabled(value: CharacteristicValue): Promise<void> {
    // This is just a placeholder since we don't have a direct on/off for scaling
    console.log('setMicScalingEnabled', value);
    return;
  }

  /**
   * Handle mic scaling enabled get
   */
  async getMicScalingEnabled(): Promise<CharacteristicValue> {
    // Always return true since we don't have a direct on/off for scaling
    return true;
  }

  /**
   * Handle mic scaling set
   */
  async setMicScaling(value: CharacteristicValue): Promise<void> {
    // Convert from 0-100 to 0-MIC_SCALING.MAX range
    const scaling = Math.round(((value as number) / 100) * MIC_SCALING.MAX);
    
    this.state.micScaling = scaling;
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'mic_sensitivity',
      sensitivity: this.state.micSensitivity,
      scaling,
    });
    
    this.platform.log.debug(`Set ${this.device.name} mic scaling to: ${scaling}`);
  }

  /**
   * Handle mic scaling get
   */
  async getMicScaling(): Promise<CharacteristicValue> {
    const deviceState = this.platform.getDeviceState(this.device.deviceAddress);
    if (deviceState && deviceState.mic_scaling !== undefined && deviceState.mic_scaling !== null) {
      this.state.micScaling = deviceState.mic_scaling;
    }
    
    // Convert from 0-MIC_SCALING.MAX to 0-100 range
    return Math.round((this.state.micScaling / MIC_SCALING.MAX) * 100);
  }

  /**
   * Send color update to device
   */
  private updateColor(): void {
    const rgb = this.HSVtoRGB({
      hue: this.state.hue,
      saturation: this.state.saturation,
      brightness: this.state.brightness,
    });
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'color',
      red: rgb.red,
      green: rgb.green,
      blue: rgb.blue,
    });
  }

  /**
   * Convert HSV to RGB
   */
  private HSVtoRGB(hsv: HSVColor): RGBColor {
    const { hue, saturation, brightness } = hsv;
    const s = saturation / 100;
    const v = brightness / 100;
    const h = hue / 360;
    
    let r = 0, g = 0, b = 0;
    
    if (s === 0) {
      r = g = b = v;
    } else {
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      
      switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
      }
    }
    
    return {
      red: Math.round(r * 255),
      green: Math.round(g * 255),
      blue: Math.round(b * 255),
    };
  }

  /**
   * Convert RGB to HSV
   */
  private RGBtoHSV(r: number, g: number, b: number): { hue: number; saturation: number } {
    // Normalize RGB values
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const diff = max - min;
    
    let hue = 0;
    const saturation = max === 0 ? 0 : diff / max;
    
    if (diff === 0) {
      hue = 0; // achromatic (gray)
    } else {
      switch (max) {
      case red:   hue = ((green - blue) / diff + (green < blue ? 6 : 0)) / 6; break;
      case green: hue = ((blue - red) / diff + 2) / 6; break;
      case blue:  hue = ((red - green) / diff + 4) / 6; break;
      }
    }
    
    return {
      hue: Math.round(hue * 360),
      saturation: Math.round(saturation * 100),
    };
  }
}