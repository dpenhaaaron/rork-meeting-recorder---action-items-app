export type LiveSocketOptions = {
  url: string;
  token?: string;
  connectTimeoutMs?: number;
  keepAliveMs?: number;
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onError?: (err: any) => void;
  onClose?: (ev: CloseEvent) => void;
};

export function createLiveSocket(opts: LiveSocketOptions) {
  const {
    url,
    token,
    connectTimeoutMs = 8000,
    keepAliveMs = 15000,
    onOpen, onMessage, onError, onClose,
  } = opts;

  let ws: WebSocket | null = null;
  let connectTimer: any = null;
  let pingTimer: any = null;
  let isOpen = false;
  const queue: (ArrayBuffer | string)[] = [];

  function open() {
    console.log('Opening live socket connection to:', url);
    ws = new WebSocket(url, token ? [token] : undefined as any);
    ws.binaryType = "arraybuffer";

    connectTimer = setTimeout(() => {
      if (!isOpen) {
        console.error('Live socket: connect timeout');
        try { ws?.close(); } catch {}
        onError?.(new Error("Live socket: connect timeout"));
      }
    }, connectTimeoutMs);

    ws.onopen = () => {
      console.log('Live socket connected successfully');
      isOpen = true;
      clearTimeout(connectTimer);
      
      // Keep-alive ping (server should pong or ignore)
      pingTimer = setInterval(() => {
        safeSend(JSON.stringify({ type: "ping", t: Date.now() }));
      }, keepAliveMs);
      
      // flush queue
      while (queue.length) {
        const payload = queue.shift()!;
        safeSend(payload);
      }
      
      onOpen?.();
    };

    ws.onmessage = (ev) => {
      try { 
        const data = JSON.parse(ev.data);
        onMessage?.(data); 
      }
      catch { 
        onMessage?.(ev.data); 
      }
    };

    ws.onerror = (e) => {
      console.error('Live socket error:', e);
      onError?.(e);
    };
    
    ws.onclose = (ev) => {
      console.log('Live socket closed:', ev.code, ev.reason);
      isOpen = false;
      clearInterval(pingTimer);
      clearTimeout(connectTimer);
      onClose?.(ev);
    };
  }

  function safeSend(payload: ArrayBuffer | string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      queue.push(payload);
      return;
    }
    
    // avoid flooding if proxy/CDN has small buffers
    if ((ws as any).bufferedAmount > 1_000_000) {
      console.warn('Live socket: backpressure detected, dropping frame');
      return; // 1MB backpressure gate
    }
    
    try {
      ws.send(payload);
    } catch (error) {
      console.error('Failed to send via live socket:', error);
    }
  }

  function send(objOrBuf: any) {
    if (objOrBuf instanceof ArrayBuffer) {
      return safeSend(objOrBuf);
    }
    safeSend(typeof objOrBuf === "string" ? objOrBuf : JSON.stringify(objOrBuf));
  }

  function close(grace = true) {
    try {
      if (grace && ws?.readyState === WebSocket.OPEN) {
        send({ type: "end" });
      }
      ws?.close();
    } catch (error) {
      console.error('Error closing live socket:', error);
    }
    
    clearInterval(pingTimer);
    clearTimeout(connectTimer);
    isOpen = false;
  }

  open();
  return { send, close, isOpen: () => isOpen };
}