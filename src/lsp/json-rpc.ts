import type { ChildProcess } from 'node:child_process';
import { logger } from '../logger.js';
import type { LSPMessage } from './types.js';

/**
 * Callback for incoming messages that are NOT response correlations.
 * These are server-initiated notifications and requests.
 */
export type MessageHandler = (message: LSPMessage) => void;

/**
 * JSON-RPC 2.0 transport over stdio with Content-Length framing.
 *
 * Handles:
 * - Content-Length message framing (send and receive)
 * - JSON-RPC 2.0 encoding/decoding
 * - Request/response correlation via ID tracking
 * - Timeout management for pending requests
 *
 * Does NOT handle LSP semantics (initialization, adapters, diagnostics).
 */
export class JsonRpcTransport {
  private nextId = 1;
  private pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  > = new Map();
  private buffer = '';

  constructor(
    private readonly process: ChildProcess,
    private readonly onMessage: MessageHandler
  ) {
    this.setupStdoutHandler();
  }

  /**
   * Set up the stdout data handler for Content-Length framing.
   * Parses incoming data into complete JSON-RPC messages.
   */
  private setupStdoutHandler(): void {
    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();

      while (this.buffer.includes('\r\n\r\n')) {
        const headerEndIndex = this.buffer.indexOf('\r\n\r\n');
        const headerPart = this.buffer.substring(0, headerEndIndex);
        const contentLengthMatch = headerPart.match(/Content-Length: (\d+)/);

        if (contentLengthMatch?.[1]) {
          const contentLength = Number.parseInt(contentLengthMatch[1]);
          const messageStart = headerEndIndex + 4;

          if (this.buffer.length >= messageStart + contentLength) {
            const messageContent = this.buffer.substring(
              messageStart,
              messageStart + contentLength
            );
            this.buffer = this.buffer.substring(messageStart + contentLength);

            try {
              const message: LSPMessage = JSON.parse(messageContent);
              this.handleIncoming(message);
            } catch (error) {
              logger.error(`Failed to parse LSP message: ${error}\n`);
            }
          } else {
            break;
          }
        } else {
          this.buffer = this.buffer.substring(headerEndIndex + 4);
        }
      }
    });
  }

  /**
   * Handle an incoming message: correlate responses, delegate the rest.
   */
  private handleIncoming(message: LSPMessage): void {
    // Response correlation: match responses to pending requests
    if (message.id && this.pendingRequests.has(message.id)) {
      const request = this.pendingRequests.get(message.id);
      if (!request) return;
      const { resolve, reject } = request;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'LSP Error'));
      } else {
        resolve(message.result);
      }
    }

    // Delegate notifications and server-initiated requests to the handler
    if (message.method) {
      this.onMessage(message);
    }
  }

  /**
   * Send a raw LSP message with Content-Length framing.
   */
  sendMessage(message: LSPMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.process.stdin?.write(header + content);
  }

  /**
   * Send a JSON-RPC request and wait for the correlated response.
   * Returns a promise that resolves with the result or rejects on error/timeout.
   */
  sendRequest(method: string, params: unknown, timeout = 30000): Promise<unknown> {
    const id = this.nextId++;
    const message: LSPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method} (${timeout}ms)`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (reason?: unknown) => {
          clearTimeout(timeoutId);
          reject(reason);
        },
      });

      this.sendMessage(message);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  sendNotification(method: string, params: unknown): void {
    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.sendMessage(message);
  }
}
