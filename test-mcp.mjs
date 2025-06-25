#!/usr/bin/env node

import { execSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test MCP server communication
async function testMCPServer() {
  console.error('Starting MCP server test...');

  const serverPath = join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let messageReceived = false;

  server.stdout.on('data', (data) => {
    buffer += data.toString();
    console.error('Received data chunk:', data.toString().substring(0, 100), '...');

    // Try to parse complete JSON messages
    try {
      // Look for complete JSON objects
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const parsed = JSON.parse(line);
            console.error('Successfully parsed JSON:', JSON.stringify(parsed, null, 2));
            messageReceived = true;
          } catch (e) {
            console.error('Failed to parse line as JSON:', line);
          }
        }
      }
      // Keep the last potentially incomplete line in buffer
      buffer = lines[lines.length - 1];
    } catch (e) {
      // Continue collecting data
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Server stderr:', data.toString());
  });

  server.on('error', (err) => {
    console.error('Server process error:', err);
  });

  // Send MCP initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
  };

  console.error('Sending initialize request...');
  server.stdin.write(`${JSON.stringify(initRequest)}\n`);

  // Wait a bit to see responses
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Send list tools request
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };

  console.error('Sending list tools request...');
  server.stdin.write(`${JSON.stringify(listToolsRequest)}\n`);

  // Wait for responses
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Clean up
  server.kill();

  if (messageReceived) {
    console.error('\n✅ Test passed: Successfully received and parsed JSON messages from server');
  } else {
    console.error('\n❌ Test failed: No valid JSON messages received from server');
    console.error('Buffer contents:', buffer);
    process.exit(1);
  }
}

// First build the project
console.error('Building project...');
try {
  execSync('bun run build', { stdio: 'inherit' });
  console.error('Build completed successfully\n');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}

// Run the test
testMCPServer().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
