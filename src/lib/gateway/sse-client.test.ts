import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewaySseClient } from './sse-client';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

describe('GatewaySseClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses event stream frames into EventFrame payloads', async () => {
    const chunks = [
      'event: session.tool\n',
      'data: {"payload":{"tool":"shell"},"seq":7}\n\n',
    ];

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: streamFromChunks(chunks),
    } as unknown as Response);

    const client = new GatewaySseClient({ url: 'http://127.0.0.1:18789/event', reconnect: false });
    const received: Array<{ event: string; payload: unknown; seq?: number }> = [];
    client.onEvent((event) => {
      received.push({ event: event.event, payload: event.payload, seq: event.seq });
    });

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: 'session.tool', payload: { tool: 'shell' }, seq: 7 });
    expect(client.state).toBe('disconnected');
  });

  it('emits state transitions and reconnects after connection failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => {
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });

    const client = new GatewaySseClient({
      url: 'http://127.0.0.1:18789/event',
      reconnect: true,
      minReconnectDelayMs: 1,
      maxReconnectDelayMs: 2,
    });

    const states: string[] = [];
    client.onStateChange((state) => states.push(state));

    await client.connect();

    expect(states).toContain('connecting');
    expect(states).toContain('error');
    expect(setTimeoutMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    client.disconnect();
  });
});
