import { Candle, PairSymbol, SocketConnectionStatus, TradeDirection } from '@/types/bot';

type TickHandler = (pair: PairSymbol, price: number, timestamp: number, payout: number) => void;
type StatusHandler = (status: SocketConnectionStatus) => void;

export class PocketSocketClient {
  private ws: WebSocket | null = null;
  private binanceWs: WebSocket | null = null;
  private krakenWs: WebSocket | null = null;
  private onTick: TickHandler;
  private onStatus: StatusHandler;

  constructor(onTick: TickHandler, onStatus: StatusHandler) {
    this.onTick = onTick;
    this.onStatus = onStatus;
  }

  public static async fetchLiveCandles(pair: PairSymbol): Promise<Candle[]> {
    try {
      if (pair === 'XAUUSD') {
        const res = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=80');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((k: any) => ({
            time: Math.floor(Number(k[0]) / 60000) * 60,
            open: Number(Number(k[1]).toFixed(2)),
            high: Number(Number(k[2]).toFixed(2)),
            low: Number(Number(k[3]).toFixed(2)),
            close: Number(Number(k[4]).toFixed(2)),
          }));
        }
      } else {
        const res = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1`);
        const json = await res.json();
        const key = Object.keys(json.result || {}).find((k) => k !== 'last');
        if (key && Array.isArray(json.result[key])) {
          return json.result[key].slice(-80).map((k: any) => ({
            time: Math.floor(Number(k[0]) / 60) * 60,
            open: Number(Number(k[1]).toFixed(5)),
            high: Number(Number(k[2]).toFixed(5)),
            low: Number(Number(k[3]).toFixed(5)),
            close: Number(Number(k[4]).toFixed(5)),
          }));
        }
      }
    } catch (err) {
      console.error('Live OHLC fetch error:', err);
    }
    return [];
  }

  public connect(ssid: string, _useSimulator: boolean) {
    this.disconnect();
    this.connectLiveMarketStreams();
    if (ssid && ssid.trim().length > 10) {
      this.connectPocketOption(ssid);
    }
  }

  private connectLiveMarketStreams() {
    this.onStatus('CONNECTED');

    // 1. Binance Real-Time 1M Gold Stream (PAXGUSDT)
    try {
      this.binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/paxgusdt@kline_1m');
      this.binanceWs.onmessage = (ev) => {
        try {
          const d = JSON.parse(String(ev.data));
          if (d?.k?.c) {
            const px = Number(Number(d.k.c).toFixed(2));
            const ts = Math.floor(Number(d.k.t) / 1000);
            this.onTick('XAUUSD', px, ts, 92);
          }
        } catch {}
      };
    } catch {}

    // 2. Kraken Real-Time Spot Forex Stream (EUR/USD, AUD/USD, GBP/USD)
    try {
      this.krakenWs = new WebSocket('wss://ws.kraken.com');
      this.krakenWs.onopen = () => {
        this.krakenWs?.send(
          JSON.stringify({
            event: 'subscribe',
            pair: ['EUR/USD', 'AUD/USD', 'GBP/USD'],
            subscription: { name: 'ticker' },
          })
        );
      };
      this.krakenWs.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (Array.isArray(msg) && msg[1]?.c?.[0]) {
            const map: Record<string, PairSymbol> = {
              'EUR/USD': 'EURUSD',
              'AUD/USD': 'AUDUSD',
              'GBP/USD': 'GBPUSD',
            };
            const pair = map[String(msg[3])];
            if (pair) {
              const px = Number(Number(msg[1].c[0]).toFixed(5));
              this.onTick(pair, px, Math.floor(Date.now() / 1000), 88);
            }
          }
        } catch {}
      };
    } catch {}
  }

  private connectPocketOption(ssid: string) {
    try {
      this.ws = new WebSocket('wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket');
      this.ws.onopen = () => {
        this.ws?.send('40');
        setTimeout(() => {
          const auth = ssid.startsWith('42') ? ssid : `42["auth",{"session":"${ssid}","isDemo":1}]`;
          this.ws?.send(auth);
        }, 500);
      };
      this.ws.onmessage = (e) => {
        if (String(e.data) === '2') this.ws?.send('3');
      };
    } catch {}
  }

  public executeOrder(pair: PairSymbol, action: TradeDirection, amount: number, expirySeconds: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const dir = action === 'CALL' ? 'call' : 'put';
      this.ws.send(`42["openOrder",{"asset":"${pair}","amount":${amount},"action":"${dir}","isDemo":1,"time":${expirySeconds}}]`);
    }
  }

  public disconnect() {
    if (this.binanceWs) { this.binanceWs.close(); this.binanceWs = null; }
    if (this.krakenWs) { this.krakenWs.close(); this.krakenWs = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
