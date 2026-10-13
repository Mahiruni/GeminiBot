import { Candle, PairSymbol, SocketConnectionStatus, TradeDirection } from '@/types/bot';

type TickHandler = (pair: PairSymbol, price: number, timestamp: number, payout: number) => void;
type StatusHandler = (status: SocketConnectionStatus) => void;

export class PocketSocketClient {
  private ws: WebSocket | null = null;
  private liveWs: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private onTick: TickHandler;
  private onStatus: StatusHandler;

  public static lastLivePrices: Record<PairSymbol, number> = {
    XAUUSD: 2648.50,
    EURUSD: 1.11950,
    AUDUSD: 0.67250,
    GBPUSD: 1.30850,
  };

  constructor(onTick: TickHandler, onStatus: StatusHandler) {
    this.onTick = onTick;
    this.onStatus = onStatus;
  }

  public static async fetchLiveCandles(pair: PairSymbol): Promise<Candle[]> {
    try {
      if (pair === 'XAUUSD') {
        const res = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=75');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const candles = data.map((k: any) => ({
            time: Math.floor(Number(k[0]) / 60000) * 60,
            open: Number(Number(k[1]).toFixed(2)),
            high: Number(Number(k[2]).toFixed(2)),
            low: Number(Number(k[3]).toFixed(2)),
            close: Number(Number(k[4]).toFixed(2)),
          }));
          this.lastLivePrices.XAUUSD = candles[candles.length - 1].close;
          return candles;
        }
      } else {
        const res = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1`);
        const json = await res.json();
        const key = Object.keys(json.result || {}).find((k) => k !== 'last');
        if (key && Array.isArray(json.result[key])) {
          const slice = json.result[key].slice(-75);
          const candles = slice.map((k: any) => ({
            time: Math.floor(Number(k[0]) / 60) * 60,
            open: Number(Number(k[1]).toFixed(5)),
            high: Number(Number(k[2]).toFixed(5)),
            low: Number(Number(k[3]).toFixed(5)),
            close: Number(Number(k[4]).toFixed(5)),
          }));
          this.lastLivePrices[pair] = candles[candles.length - 1].close;
          return candles;
        }
      }
    } catch {}
    return [];
  }

  public connect(ssid: string, _useSimulator: boolean) {
    this.disconnect();
    if (ssid && ssid.trim().length > 10) {
      this.connectPocketOption(ssid);
    } else {
      this.connectLiveSpotFeed();
    }
  }

  private connectLiveSpotFeed() {
    this.onStatus('CONNECTED');
    try {
      this.liveWs = new WebSocket('wss://ws.kraken.com');
      this.liveWs.onopen = () => {
        this.liveWs?.send(
          JSON.stringify({
            event: 'subscribe',
            pair: ['PAXG/USD', 'EUR/USD', 'AUD/USD', 'GBP/USD'],
            subscription: { name: 'ticker' },
          })
        );
      };
      this.liveWs.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (Array.isArray(msg) && msg[1]?.c?.[0]) {
            const rawPair = String(msg[3]);
            const map: Record<string, PairSymbol> = {
              'PAXG/USD': 'XAUUSD',
              'EUR/USD': 'EURUSD',
              'AUD/USD': 'AUDUSD',
              'GBP/USD': 'GBPUSD',
            };
            const pair = map[rawPair];
            if (pair) {
              const dec = pair === 'XAUUSD' ? 2 : 5;
              const px = Number(Number(msg[1].c[0]).toFixed(dec));
              PocketSocketClient.lastLivePrices[pair] = px;
              this.onTick(pair, px, Math.floor(Date.now() / 1000), pair === 'XAUUSD' ? 92 : 88);
            }
          }
        } catch {}
      };
    } catch {}

    // Keep 1M candle clock & live chart responsive between spot ticks
    this.heartbeat = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      (['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'] as PairSymbol[]).forEach((p) => {
        const px = PocketSocketClient.lastLivePrices[p];
        this.onTick(p, px, now, p === 'XAUUSD' ? 92 : 88);
      });
    }, 1000);
  }

  private connectPocketOption(ssid: string) {
    try {
      this.ws = new WebSocket('wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket');
      this.ws.onopen = () => {
        this.onStatus('CONNECTED');
        this.ws?.send('40');
        setTimeout(() => {
          const auth = ssid.startsWith('42') ? ssid : `42["auth",{"session":"${ssid}","isDemo":1}]`;
          this.ws?.send(auth);
          (['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'] as PairSymbol[]).forEach((p) => {
            this.ws?.send(`42["changeSymbol",{"asset":"${p}","period":60}]`);
          });
        }, 500);
      };
      this.ws.onmessage = (e) => {
        const m = String(e.data);
        if (m === '2') this.ws?.send('3');
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
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.liveWs) { this.liveWs.close(); this.liveWs = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
