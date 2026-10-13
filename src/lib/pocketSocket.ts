import { PairSymbol, SocketConnectionStatus, TradeDirection } from '@/types/bot';

type TickHandler = (pair: PairSymbol, price: number, timestamp: number, payout: number) => void;
type StatusHandler = (status: SocketConnectionStatus) => void;

export class PocketSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private onTick: TickHandler;
  private onStatus: StatusHandler;
  private currentSsid = '';
  private isSimulating = false;

  private simPrices: Record<PairSymbol, number> = {
    XAUUSD: 2648.50,
    EURUSD: 1.08520,
    AUDUSD: 0.65840,
    GBPUSD: 1.29410,
  };

  private endpoint = 'wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket';

  constructor(onTick: TickHandler, onStatus: StatusHandler) {
    this.onTick = onTick;
    this.onStatus = onStatus;
  }

  public connect(ssid: string, useSimulator: boolean) {
    this.currentSsid = ssid;
    this.isSimulating = useSimulator;
    this.disconnect();

    if (useSimulator || !ssid.trim()) {
      this.startSimulator();
      return;
    }

    try {
      this.ws = new WebSocket(this.endpoint);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onStatus('CONNECTED');
        this.ws?.send('40');

        setTimeout(() => {
          const authPayload = ssid.startsWith('42')
            ? ssid
            : `42["auth",{"session":"${ssid}","isDemo":1}]`;
          this.ws?.send(authPayload);
          this.subscribePairs(['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD']);
        }, 500);
      };

      this.ws.onmessage = (event) => {
        const msg = String(event.data);
        if (msg === '2') {
          this.ws?.send('3');
          return;
        }
        if (msg.startsWith('42')) {
          this.handleSocketEvent(msg.slice(2));
        }
      };

      this.ws.onclose = () => {
        this.onStatus('RECONNECTING');
        this.retryConnection();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.retryConnection();
    }
  }

  private subscribePairs(pairs: PairSymbol[]) {
    pairs.forEach((pair) => {
      this.ws?.send(`42["changeSymbol",{"asset":"${pair}","period":60}]`);
    });
  }

  private handleSocketEvent(rawJson: string) {
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) return;
      const [event, payload] = parsed;

      if (event === 'updateStream' && Array.isArray(payload)) {
        for (const item of payload) {
          const [asset, time, price] = item;
          if (['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'].includes(asset)) {
            this.onTick(asset as PairSymbol, Number(price), Number(time), 88);
          }
        }
      }
    } catch {}
  }

  public executeOrder(
    pair: PairSymbol,
    action: TradeDirection,
    amount: number,
    expirySeconds: number
  ) {
    if (this.isSimulating || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const dir = action === 'CALL' ? 'call' : 'put';
    const payload = `42["openOrder",{"asset":"${pair}","amount":${amount},"action":"${dir}","isDemo":1,"time":${expirySeconds}}]`;
    this.ws.send(payload);
  }

  private retryConnection() {
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => {
      this.connect(this.currentSsid, this.isSimulating);
    }, delay);
  }

  private startSimulator() {
    this.onStatus('SIMULATOR');

    this.simTimer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      (['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'] as PairSymbol[]).forEach((pair) => {
        const step = pair === 'XAUUSD' ? 0.35 : 0.00018;
        const meanRevert = (Math.random() - 0.498) * step;
        const decimals = pair === 'XAUUSD' ? 2 : 5;
        this.simPrices[pair] = Number((this.simPrices[pair] + meanRevert).toFixed(decimals));
        const payout = pair === 'XAUUSD' ? 92 : 88;
        this.onTick(pair, this.simPrices[pair], now, payout);
      });
    }, 800);
  }

  public disconnect() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.onStatus('DISCONNECTED');
  }
}
