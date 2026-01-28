import { prisma } from './prisma.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import cron from 'node-cron';

// Match recordings to calls based on file timestamp and extensions
export const syncRecordings = async () => {
  try {
    const recordingsDir = './api/public/recordings';
    const files = readdirSync(recordingsDir).filter(f => f.endsWith('.wav'));

    if (files.length === 0) {
      return;
    }

    // Get all initiated calls from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const initiatedCalls = await prisma.call.findMany({
      where: {
        status: 'initiated',
        startTime: { gte: oneHourAgo }
      },
      include: {
        caller: { select: { extension: true } },
        callee: { select: { extension: true } }
      },
      orderBy: { startTime: 'desc' }
    });

    let matched = 0;

    for (const file of files) {
      const uuid = file.replace('.wav', '');
      const recordingUrl = `/recordings/${file}`;
      const filePath = join(recordingsDir, file);
      const stats = statSync(filePath);
      const fileTime = new Date(stats.mtime);

      // Check if this recording is already linked
      const existing = await prisma.call.findFirst({
        where: { recordingUrl }
      });

      if (existing) {
        continue; // Skip already linked recordings
      }

      // Find a call within 2 minutes of file time
      const call = initiatedCalls.find(c => {
        const callTime = new Date(c.startTime);
        const diff = Math.abs(fileTime.getTime() - callTime.getTime());
        return diff < 2 * 60 * 1000 && Math.abs(stats.mtimeMs - new Date(c.startTime).getTime()) < 2 * 60 * 1000;
      });

      if (call) {
        // Calculate duration based on file size (rough estimate: ~10KB per second)
        const duration = Math.round(stats.size / 10000);

        await prisma.call.update({
          where: { id: call.id },
          data: {
            recordingUrl: recordingUrl,
            status: 'completed',
            endTime: fileTime,
            duration: Math.max(1, duration)
          }
        });

        matched++;
        console.log(`[Recording Sync] Matched ${file} to ${call.caller.extension}->${call.callee.extension}`);
      }
    }

    if (matched > 0) {
      console.log(`[Recording Sync] Synced ${matched} recordings`);
    }
  } catch (error) {
    console.error('[Recording Sync] Error:', error);
  }
};

// Start cron job to sync every 30 seconds
export const startRecordingSync = () => {
  console.log('[Recording Sync] Starting automatic recording sync...');

  // Run immediately on start
  syncRecordings();

  // Then run every 30 seconds
  cron.schedule('*/30 * * * * *', syncRecordings);

  console.log('[Recording Sync] Scheduled to run every 30 seconds');
};
