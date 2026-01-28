declare module 'modesl' {
  export class Connection {
    constructor(host: string, port: number, password: string, callback: () => void);
    events(type: string, events: string, callback?: () => void): void;
    on(event: string, callback: (e: any) => void): void;
    api(command: string, args: string[], callback?: (res: any) => void): void;
    bgapi(command: string, args: string[], callback?: (res: any) => void): void;
  }
}
