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

  it('parses id field and includes it in event frame', async () => {
    const chunks = [
      'id: evt-42\n',
      'event: session.tool\n',
      'data: {"payload":{"tool":"shell"}}\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: streamFromChunks(chunks),
    } as unknown as Response);

    const client = new GatewaySseClient({ url: 'http://127.0.0.1:18789/event', reconnect: false });
    const received: Array<{ event: string; payload: unknown; _sseId?: string }> = [];
    client.onEvent((event) => {
      received.push({ event: event.event, payload: event.payload, _sseId: (event as Record<string, unknown>)._sseId as string | undefined });
    });

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toHaveLength(1);
    expect(received[0]?._sseId).toBe('evt-42');
  });

  it('sends Last-Event-ID header on reconnect after receiving id', async () => {
    const firstChunks = [
      'id: evt-100\n',
      'data: {"p":1}\n\n',
    ];

    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: string | Request, _opts?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          body: streamFromChunks(firstChunks),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: streamFromChunks(['data: {"p":2}\n\n']),
      } as unknown as Response;
    });

    const client = new GatewaySseClient({
      url: 'http://127.0.0.1:18789/event',
      reconnect: true,
      minReconnectDelayMs: 1,
      maxReconnectDelayMs: 2,
      token: 'test-token',
    });

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    client.disconnect();
  });

  it('handles explicit event and payload fields in JSON data', async () => {
    const chunks = [
      'event: custom\n',
      'data: {"event":"override","payload":{"x":1},"seq":5}\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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

    expect(received).toHaveLength(1);
    expect(received[0]?.event).toBe('custom');
    expect(received[0]?.payload).toEqual({ x: 1 });
  });

  it('handles non-object JSON data as payload', async () => {
    const chunks = [
      'event: ping\n',
      'data: "hello"\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: streamFromChunks(chunks),
    } as unknown as Response);

    const client = new GatewaySseClient({ url: 'http://127.0.0.1:18789/event', reconnect: false });
    const received: Array<{ event: string; payload: unknown }> = [];
    client.onEvent((event) => {
      received.push({ event: event.event, payload: event.payload });
    });

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toHaveLength(1);
    expect(received[0]?.event).toBe('ping');
    expect(received[0]?.payload).toBe('hello');
  });
});
