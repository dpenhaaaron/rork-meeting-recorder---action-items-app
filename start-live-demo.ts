#!/usr/bin/env bun

// Start both the live transcription server and the Expo app
console.log('🚀 Starting Live Transcription Demo...\n');

console.log('📡 To start the WebSocket server, run in a separate terminal:');
console.log('   bun run backend/live-transcription-server.ts\n');

console.log('📱 Starting Expo app...');

// Start the Expo app
const { spawn } = require('child_process');
const expo = spawn('bunx', ['rork', 'start', '-p', '88rzyieyr0pbbr2ynrdbm', '--web', '--tunnel'], {
  stdio: 'inherit',
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  expo.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  expo.kill();
  process.exit(0);
});

expo.on('close', (code: number) => {
  console.log(`Expo process exited with code ${code}`);
  process.exit(code);
});