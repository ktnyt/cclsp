#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

// デバッグ用のヘルパー関数
function formatMessage(data) {
  const str = data.toString();
  const lines = str.split('\n');
  return lines
    .map((line) => line.trim())
    .filter((line) => line)
    .join('\n');
}

// Content-Lengthヘッダーを含むLSPメッセージを作成
function createMessage(content) {
  const contentStr = JSON.stringify(content);
  const contentLength = Buffer.byteLength(contentStr, 'utf8');
  return `Content-Length: ${contentLength}\r\n\r\n${contentStr}`;
}

// tsgoを起動
console.log('Starting tsgo...');
const tsgo = spawn('tsgo', ['--lsp', '-stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: process.cwd(),
});

let buffer = '';
let contentLength = null;

// stdout（LSPレスポンス）を処理
tsgo.stdout.on('data', (data) => {
  console.log('\n=== STDOUT DATA ===');
  console.log('Raw:', data.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n'));

  buffer += data.toString();

  while (true) {
    if (contentLength === null) {
      // Content-Lengthヘッダーを探す
      const headerMatch = buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (headerMatch) {
        contentLength = Number.parseInt(headerMatch[1]);
        buffer = buffer.substring(headerMatch.index + headerMatch[0].length);
      } else {
        break;
      }
    }

    if (contentLength !== null) {
      // 完全なメッセージを受信したかチェック
      if (buffer.length >= contentLength) {
        const message = buffer.substring(0, contentLength);
        buffer = buffer.substring(contentLength);
        contentLength = null;

        try {
          const json = JSON.parse(message);
          console.log('\n=== LSP RESPONSE ===');
          console.log(JSON.stringify(json, null, 2));
        } catch (e) {
          console.error('Failed to parse JSON:', e);
          console.error('Message:', message);
        }
      } else {
        break;
      }
    }
  }
});

// stderr（エラー出力）を処理
tsgo.stderr.on('data', (data) => {
  console.error('\n=== STDERR ===');
  console.error(formatMessage(data));
});

// プロセス終了時
tsgo.on('close', (code) => {
  console.log(`\ntsgo exited with code ${code}`);
  process.exit(code);
});

tsgo.on('error', (err) => {
  console.error('\nFailed to start tsgo:', err);
  process.exit(1);
});

// 初期化リクエストを送信
setTimeout(() => {
  console.log('\n=== SENDING INITIALIZE REQUEST ===');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      processId: process.pid,
      clientInfo: {
        name: 'debug-client',
        version: '1.0.0',
      },
      rootUri: `file://${process.cwd()}`,
      capabilities: {
        textDocument: {
          hover: {
            contentFormat: ['plaintext', 'markdown'],
          },
          completion: {
            completionItem: {
              snippetSupport: false,
            },
          },
          definition: {
            linkSupport: false,
          },
          references: {},
        },
      },
    },
  };

  const message = createMessage(initRequest);
  console.log('Sending:', message.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
  tsgo.stdin.write(message);
}, 1000);

// 初期化完了通知を送信
setTimeout(() => {
  console.log('\n=== SENDING INITIALIZED NOTIFICATION ===');
  const initializedNotif = {
    jsonrpc: '2.0',
    method: 'initialized',
    params: {},
  };

  const message = createMessage(initializedNotif);
  console.log('Sending:', message.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
  tsgo.stdin.write(message);
}, 2000);

// テスト用のtextDocument/definitionリクエストを送信
setTimeout(() => {
  console.log('\n=== SENDING DEFINITION REQUEST ===');
  const testFile = path.join(process.cwd(), 'src/lsp-client.ts');
  const defRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'textDocument/definition',
    params: {
      textDocument: {
        uri: `file://${testFile}`,
      },
      position: {
        line: 10,
        character: 10,
      },
    },
  };

  const message = createMessage(defRequest);
  console.log('Sending:', message.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
  tsgo.stdin.write(message);
}, 3000);

// textDocument/referencesリクエストも試す
setTimeout(() => {
  console.log('\n=== SENDING REFERENCES REQUEST ===');
  const testFile = path.join(process.cwd(), 'src/lsp-client.ts');
  const refRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'textDocument/references',
    params: {
      textDocument: {
        uri: `file://${testFile}`,
      },
      position: {
        line: 10,
        character: 10,
      },
      context: {
        includeDeclaration: true,
      },
    },
  };

  const message = createMessage(refRequest);
  console.log('Sending:', message.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
  tsgo.stdin.write(message);
}, 4000);

// 5秒後に終了
setTimeout(() => {
  console.log('\n=== SENDING SHUTDOWN REQUEST ===');
  const shutdownRequest = {
    jsonrpc: '2.0',
    id: 4,
    method: 'shutdown',
  };

  const message = createMessage(shutdownRequest);
  tsgo.stdin.write(message);

  setTimeout(() => {
    console.log('\n=== SENDING EXIT NOTIFICATION ===');
    const exitNotif = {
      jsonrpc: '2.0',
      method: 'exit',
    };

    const exitMessage = createMessage(exitNotif);
    tsgo.stdin.write(exitMessage);
  }, 500);
}, 5000);

// Ctrl+Cでの終了処理
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  tsgo.kill();
  process.exit(0);
});
