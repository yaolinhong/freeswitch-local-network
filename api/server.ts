/**
 * local server entry file, for local development
 */
import app from './app.js';
import { initESL } from './lib/esl.js';
import { startRecordingSync } from './lib/recording_sync.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

// Initialize ESL connection
initESL();

// Also keep recording sync as backup
startRecordingSync();

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;