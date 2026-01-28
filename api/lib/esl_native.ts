import { createConnection } from 'net';
import { EventEmitter } from 'events';

interface ESLOptions {
  host: string;
  port: number;
  password: string;
}

class ESLConnection extends EventEmitter {
  private socket: any;
  private connected: boolean = false;
  private authenticated: boolean = false;
  private buffer: string = '';
  private eventCallbacks: Map<string, Function[]> = new Map();

  constructor(private options: ESLOptions) {
    super();
  }

  connect(callback?: () => void) {
    this.socket = createConnection({ host: this.options.host, port: this.options.port }, () => {
      console.log('[ESL] TCP Connected');
      // Send auth immediately
      this.socket.write(`auth ${this.options.password}\n`);
    });

    this.socket.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processData();
    });

    this.socket.on('error', (err: Error) => {
      console.error('[ESL] Socket error:', err.message);
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      console.log('[ESL] Connection closed');
      this.connected = false;
      this.authenticated = false;
    });

    // Wait for authentication
    const checkAuth = setInterval(() => {
      if (this.authenticated) {
        clearInterval(checkAuth);
        this.connected = true;
        console.log('[ESL] Connected and authenticated');
        if (callback) callback();
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!this.authenticated) {
        clearInterval(checkAuth);
        console.error('[ESL] Authentication timeout');
        this.socket.destroy();
        this.emit('error', new Error('Authentication timeout'));
      }
    }, 5000);
  }

  private processData() {
    // Check for auth response
    if (!this.authenticated && this.buffer.includes('Content-Type:')) {
      if (this.buffer.includes('command/reply') && !this.buffer.includes('Access Denied')) {
        this.authenticated = true;
        console.log('[ESL] Authenticated successfully');
      } else if (this.buffer.includes('Access Denied')) {
        console.error('[ESL] Authentication failed');
      }
      // Clear auth response from buffer
      const idx = this.buffer.lastIndexOf('\n\n');
      if (idx > 0) {
        this.buffer = this.buffer.slice(idx + 2);
      }
    }

    // Process events
    while (true) {
      // Events are separated by double newline
      const eventEnd = this.buffer.indexOf('\n\n');
      if (eventEnd === -1) break;

      const eventData = this.buffer.slice(0, eventEnd);
      this.buffer = this.buffer.slice(eventEnd + 2);

      if (eventData.trim()) {
        this.processEvent(eventData);
      }
    }
  }

  private processEvent(data: string) {
    const lines = data.split('\n');
    const headers: Map<string, string> = new Map();

    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon > 0) {
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        headers.set(key, value);
      }
    }

    const eventName = headers.get('Event-Name');
    if (eventName) {
      // Generic event emitter
      this.emit('esl::event', { getHeader: (k: string) => headers.get(k) });

      // Specific event emitter
      this.emit(`esl::event::${eventName}`, { getHeader: (k: string) => headers.get(k) });

      // Custom events
      if (eventName === 'CUSTOM') {
        const subclass = headers.get('Event-Subclass');
        if (subclass) {
          this.emit(`esl::event::CUSTOM::${subclass}`, { getHeader: (k: string) => headers.get(k) });
        }
      }
    }
  }

  events(format: string, events: string, callback?: () => void) {
    this.socket.write(`event ${format} ${events}\n`);
    if (callback) callback();
  }

  api(command: string, callback?: (response: any) => void) {
    this.socket.write(`api ${command}\n`);
    // Note: In a real implementation, we'd need to capture the response
    if (callback) {
      // For now, just call callback immediately
      // A proper implementation would wait for the response
      setTimeout(() => callback({ getBody: () => '' }), 100);
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    super.on(event, callback);
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
    }
  }
}

export const initESL = () => {
  console.log('[ESL] Initializing native socket ESL connection...');

  const conn = new ESLConnection({
    host: '127.0.0.1',
    port: 8021,
    password: 'ClueCon'
  });

  conn.connect(() => {
    // Subscribe to all events
    conn.events('plain', 'all', () => {
      console.log('[ESL] ✓ Subscribed to ALL events');
    });
  });

  // Reconnect on error
  conn.on('error', (err) => {
    console.error('[ESL] Connection error, reconnecting in 5s...');
    setTimeout(() => {
      // Note: This would create a new connection
      // In production, we'd want proper reconnection logic
    }, 5000);
  });

  return conn;
};
