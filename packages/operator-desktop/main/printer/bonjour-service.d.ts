declare module 'bonjour-service' {
  export interface Service {
    name: string;
    type: string;
    protocol: string;
    host: string;
    port: number;
    addresses: string[];
    txt: Record<string, string>;
  }

  export interface Browser {
    on(event: 'up', listener: (service: Service) => void): this;
    on(event: 'down', listener: (service: Service) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    stop(): void;
  }

  export class Bonjour {
    find(options: { type: string }): Browser;
    destroy(): void;
  }
}