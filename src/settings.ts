/**
 * Plugin constants
 */
export const PLATFORM_NAME = 'LEDStripController';
export const PLUGIN_NAME = 'homebridge-ledstrip-controller-restapi';
export const MANUFACTURER = 'DMRRBA';
export const MODEL = 'DMRRBA-004';
export const FIRMWARE_VERSION = '2.0.0';

/**
 * Music mode constants
 */
export enum MusicMode {
  OFF = 0,
  CLASSIC = 1,
  VOCAL = 2,
  POP = 3,
  ROCK = 4
}

/**
 * Microphone sensitivity constants
 */
export const MIC_SENSITIVITY = {
  MIN: 41,
  MAX: 255,
  DEFAULT: 150,
};

/**
 * Microphone scaling constants
 */
export const MIC_SCALING = {
  MIN: 0,
  MAX: 15,
  DEFAULT: 8,
};