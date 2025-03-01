import { API } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { LEDStripPlatform } from './platform.js';

/**
 * Register the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, LEDStripPlatform);
};