/**
 * Device configuration interface
 */
export interface DeviceConfig {
  name: string;
  deviceAddress: string;
  apiUrl: string;
  enableMusicMode?: boolean;
  enableMicControls?: boolean;
  reconnectInterval?: number;
}

/**
 * LED strip state interface
 */
export interface LEDState {
  power: boolean;
  color: {
    red: number;
    green: number;
    blue: number;
  };
  brightness: number;
  intensity: number;
  music_mode?: number | null;
  mic_sensitivity?: number | null;
  mic_scaling?: number | null;
  connected: boolean;
  last_updated: number;
}

/**
 * WebSocket command interface
 */
export interface WSCommand {
  action: string;
  [key: string]: unknown;
}

/**
 * WebSocket response interface
 */
export interface WSResponse {
  status?: string;
  message?: string;
  state?: LEDState;
  type?: string;
  device_address?: string;
}

/**
 * HSV color values interface
 */
export interface HSVColor {
  hue: number;
  saturation: number;
  brightness: number;
}

/**
 * RGB color values interface
 */
export interface RGBColor {
  red: number;
  green: number;
  blue: number;
}