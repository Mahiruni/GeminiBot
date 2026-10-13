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
          this.subscribePairs(['EURUSD', 'AUDUSD', 'GBPUSD']);
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
          if (['EURUSD', 'AUDUSD', 'GBPUSD'].includes(asset)) {
            this.onTick(asset as PairSymbol, Number(price), Number(time), 86);
          }
        }
      }
    } catch {
      // Ignore non-JSON frames
    }
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
    const basePrices: Record<PairSymbol, number> = {
      EURUSD: 1.085,
      AUDUSD: 0.658,
      GBPUSD: 1.294,
    };

    this.simTimer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      (['EURUSD', 'AUDUSD', 'GBPUSD'] as PairSymbol[]).forEach((pair) => {
        const volatility = (Math.random() - 0.499) * 0.00015;
        basePrices[pair] = Number((basePrices[pair] + volatility).toFixed(5));
        const dynamicPayout = Math.random() > 0.08 ? 86 : 80;
        this.onTick(pair, basePrices[pair], now, dynamicPayout);
      });
    }, 1000);
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
