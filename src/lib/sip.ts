import { UserAgent, UserAgentOptions, Inviter, Session, Invitation, Registerer, RegistererState } from 'sip.js';

export class SipClient {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private options: UserAgentOptions;

  constructor(options: UserAgentOptions) {
    this.options = options;
  }

  async connect(
    onInvite: (invitation: Invitation) => void,
    onRegistered: () => void,
    onUnregistered: () => void
  ) {
    if (this.userAgent) return;

    this.userAgent = new UserAgent({
      ...this.options,
      delegate: {
        onInvite,
      },
    });

    await this.userAgent.start();

    this.registerer = new Registerer(this.userAgent);
    
    this.registerer.stateChange.addListener((newState) => {
        if (newState === RegistererState.Registered) {
            onRegistered();
        } else if (newState === RegistererState.Unregistered || newState === RegistererState.Terminated) {
            onUnregistered();
        }
    });

    await this.registerer.register();
  }

  async disconnect() {
    if (this.registerer) {
        await this.registerer.unregister();
        this.registerer = null;
    }
    if (this.userAgent) {
      await this.userAgent.stop();
      this.userAgent = null;
    }
  }

  call(target: string): Inviter {
    if (!this.userAgent) throw new Error('UserAgent not initialized');
    
    const targetURI = UserAgent.makeURI(target);
    if (!targetURI) throw new Error(`Invalid target URI: ${target}`);

    return new Inviter(this.userAgent, targetURI);
  }
}
