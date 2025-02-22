import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceConfig } from './types.js';
import type { LEDStripPlatform } from './platform.js';

export class LEDStripAccessory {
  private service: Service;
  private state = {
    On: false,
    Brightness: 100,
    Hue: 0,
    Saturation: 0,
  };

  constructor(
    private readonly platform: LEDStripPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DeviceConfig,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DMRRBA')
      .setCharacteristic(this.platform.Characteristic.Model, 'DMRRBA-004')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceAddress);

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) 
      || this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(this.platform.Characteristic.Name, device.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))
      .onGet(this.getBrightness.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this))
      .onGet(this.getHue.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setSaturation.bind(this))
      .onGet(this.getSaturation.bind(this));
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    this.state.On = value as boolean;
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'power',
      state: value ? 'on' : 'off',
    });
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.state.On;
  }

  async setBrightness(value: CharacteristicValue): Promise<void> {
    this.state.Brightness = value as number;
    
    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'brightness',
      brightness: Math.round((value as number) * 2.55),
      intensity: Math.round((value as number) / 6.67),
    });

    this.updateColor();
  }

  async getBrightness(): Promise<CharacteristicValue> {
    return this.state.Brightness;
  }

  async setHue(value: CharacteristicValue): Promise<void> {
    this.state.Hue = value as number;
    this.updateColor();
  }

  async getHue(): Promise<CharacteristicValue> {
    return this.state.Hue;
  }

  async setSaturation(value: CharacteristicValue): Promise<void> {
    this.state.Saturation = value as number;
    this.updateColor();
  }

  async getSaturation(): Promise<CharacteristicValue> {
    return this.state.Saturation;
  }

  private updateColor(): void {
    const { red, green, blue } = this.HSVtoRGB(
      this.state.Hue,
      this.state.Saturation,
      this.state.Brightness,
    );

    this.platform.sendCommand(this.device.deviceAddress, {
      action: 'color',
      red,
      green,
      blue,
    });
  }

  private HSVtoRGB(h: number, s: number, v: number): { red: number; green: number; blue: number } {
    s /= 100;
    v /= 100;
    
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return {
      red: Math.round(r * 255),
      green: Math.round(g * 255),
      blue: Math.round(b * 255),
    };
  }
}
