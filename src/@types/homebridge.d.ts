// Type declarations for homebridge modules

declare module '@homebridge/dbus-native' {
    export class InvokeError extends Error {
      type: string;
      code: string;
      message: string;
    }
  }