import modesl from 'modesl';
import { prisma } from './prisma.js';

let conn: any = null;
let isConnected = false;
let connectionTimeout: NodeJS.Timeout | null = null;

// Disconnect existing connection before reconnecting
const disconnect = () => {
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  }

  if (conn && isConnected) {
    try {
      conn.disconnect();
      console.log('[ESL] Disconnected previous connection');
    } catch (e) {
      // Ignore disconnect errors
    }
    isConnected = false;
  }
  conn = null;
};

export const initESL = () => {
  console.log('[ESL] Attempting to connect to FreeSWITCH ESL at 127.0.0.1:8021...');

  // Disconnect existing connection if any
  disconnect();

  // Set connection timeout
  connectionTimeout = setTimeout(() => {
    if (!isConnected) {
      console.error('[ESL] ✗ Connection timeout! ESL did not connect within 5 seconds.');
      console.error('[ESL] Possible causes:');
      console.error('  1. FreeSWITCH is not running');
      console.error('  2. ESL port 8021 is not accessible');
      console.error('  3. Password "ClueCon" is incorrect');
      console.error('  4. Docker port mapping issue');
      // Try to reconnect
      setTimeout(initESL, 10000);
    }
  }, 5000);

  // Connect to FreeSWITCH Event Socket
  // Assuming FreeSWITCH runs on localhost 8021 (mapped via Docker)
  // Docker mapping: -p 8021:8021
  console.log('[ESL] Creating ESL connection...');
  conn = new modesl.Connection('127.0.0.1', 8021, 'ClueCon', () => {
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }

      console.log('[ESL] ✓ Connected to FreeSWITCH ESL');
      isConnected = true;

      // Subscribe to ALL events in plain text format
      conn.events('plain', 'all', () => {
        console.log('[ESL] ✓ Subscribed to ALL events');
      });

    // Initial Sync: Get all current registrations
    conn.api('sofia status profile internal reg', (res: any) => {
        const body = res.getBody();
        // Parse output. It's usually text based for 'reg', or we can try xml
        // Output format:
        // Call-ID: ... User: 1002@... Contact: ... Status: Registered ...
        
        // Better way: use xml_status which returns XML
    });
    
    // Use xmlstatus instead for easier parsing
    conn.api('xmlstatus', async (res: any) => {
        // This gives full status. Maybe too heavy.
        // Let's stick to 'show registrations'
    });

    // Actually, 'show registrations as xml' might be better
    conn.api('show registrations as xml', async (res: any) => {
        const body = res.getBody();
        // Simple regex to find users
        // <user>1002</user>
        const matches = body.matchAll(/<user>(.*?)<\/user>/g);
        const onlineUsers = new Set<string>();
        for (const match of matches) {
            onlineUsers.add(match[1]);
        }
        
        console.log('Initial Sync: Online users:', Array.from(onlineUsers));

        // Update DB
        try {
            // Set all online
            if (onlineUsers.size > 0) {
                await prisma.user.updateMany({
                    where: { extension: { in: Array.from(onlineUsers) } },
                    data: { status: 'online' }
                });
            }
            
            // Set others offline
            await prisma.user.updateMany({
                where: { extension: { notIn: Array.from(onlineUsers) } },
                data: { status: 'offline' }
            });
        } catch (e) {
            console.error('Initial sync error:', e);
        }
    });
  });

  // Debug: Log ALL events to see what's being received
  conn.on('esl::event', async (event: any) => {
    const eventName = event.getHeader('Event-Name');
    // Only log hangup and registration events to reduce noise
    if (eventName === 'CHANNEL_HANGUP_COMPLETE' ||
        eventName === 'CUSTOM' ||
        eventName === 'CHANNEL_ANSWER' ||
        eventName === 'CHANNEL_CREATE') {
      console.log(`[ESL EVENT] ${eventName}`);
    }
  });

  conn.on('esl::event::CUSTOM', async (event: any) => {
    const eventSubclass = event.getHeader('Event-Subclass');
    console.log(`[ESL CUSTOM] Subclass: ${eventSubclass}`);

    if (eventSubclass === 'sofia::register') {
      const user = event.getHeader('from-user');
      const domain = event.getHeader('from-host');
      console.log(`User ${user}@${domain} registered`);

      try {
        await prisma.user.updateMany({
          where: { extension: user },
          data: { status: 'online' }
        });
      } catch (e) {
        console.error('Error updating user status:', e);
      }
    } else if (eventSubclass === 'sofia::unregister') {
      const user = event.getHeader('from-user');
      console.log(`User ${user} unregistered`);

      try {
        await prisma.user.updateMany({
          where: { extension: user },
          data: { status: 'offline' }
        });
      } catch (e) {
        console.error('Error updating user status:', e);
      }
    } else if (eventSubclass === 'sofia::expire') {
      const user = event.getHeader('from-user');
      console.log(`User ${user} registration expired`);

      try {
        await prisma.user.updateMany({
          where: { extension: user },
          data: { status: 'offline' }
        });
      } catch (e) {
        console.error('Error updating user status:', e);
      }
    }
  });

  conn.on('esl::event::CHANNEL_HANGUP_COMPLETE', async (event: any) => {
    const uuid = event.getHeader('Unique-ID'); // Current channel's UUID
    const sipCallId = event.getHeader('variable_sip_call_id');
    const callerExtension = event.getHeader('Caller-Username');
    const calleeExtension = event.getHeader('Caller-Destination-Number');
    const duration = event.getHeader('Duration');
    const billsec = event.getHeader('Bill-Sec');
    const bridgeUuid = event.getHeader('variable_bridge_uuid'); // B-leg UUID if this is A-leg
    const originatedUuid = event.getHeader('variable_uuid'); // Original UUID if this is B-leg

    console.log(`[CHANNEL_HANGUP_COMPLETE] UUID: ${uuid}`);
    console.log(`  SIP-ID: ${sipCallId}`);
    console.log(`  Caller: ${callerExtension} -> Callee: ${calleeExtension}`);
    console.log(`  Duration: ${duration}s, Bill-Sec: ${billsec}s`);
    console.log(`  Bridge-UUID: ${bridgeUuid}, Originated-UUID: ${originatedUuid}`);

    // Determine the recording UUID (A-leg UUID is used for recording)
    // If bridgeUuid exists, this is A-leg (caller), use current uuid
    // If originatedUuid exists, this is B-leg (callee), use originatedUuid
    // If neither, assume this is A-leg
    const recordingUuid = originatedUuid || uuid;
    const recordingUrl = `/recordings/${recordingUuid}.wav`;

    console.log(`  Recording URL: ${recordingUrl} (using UUID: ${recordingUuid})`);

    // Try to find and update call record
    try {
      const callDuration = parseInt(billsec || '0', 10);
      const endTime = new Date();

      // First try: match by sipCallId
      let result = await prisma.call.updateMany({
        where: { sipCallId: sipCallId },
        data: {
          recordingUrl: recordingUrl,
          status: 'completed',
          endTime: endTime,
          duration: callDuration
        }
      });

      console.log(`[Update by sipCallId] ${sipCallId}: ${result.count} records`);

      // If no match, try to find by caller/callee extensions and recent time
      if (result.count === 0 && callerExtension && calleeExtension) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        // Find users with these extensions
        const callers = await prisma.user.findMany({
          where: { extension: callerExtension }
        });
        const callees = await prisma.user.findMany({
          where: { extension: calleeExtension }
        });

        if (callers.length > 0 && callees.length > 0) {
          result = await prisma.call.updateMany({
            where: {
              callerId: callers[0].id,
              calleeId: callees[0].id,
              startTime: { gte: fiveMinutesAgo },
              status: 'initiated'
            },
            data: {
              recordingUrl: recordingUrl,
              status: 'completed',
              endTime: endTime,
              duration: callDuration
            }
          });

          console.log(`[Update by extensions] ${callerExtension}->${calleeExtension}: ${result.count} records`);
        }
      }

      if (result.count === 0) {
        console.warn(`[WARNING] No call record found for UUID: ${uuid}, SIP-ID: ${sipCallId}`);
      }
    } catch (e) {
      console.error('[ERROR] Error updating call recording:', e);
    }
  });

  conn.on('error', (err: any) => {
    console.error('ESL Error:', err);
    // Reconnect logic could be added here
    setTimeout(initESL, 5000);
  });
};
