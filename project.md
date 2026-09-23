# TradeCharts — Forex + Crypto Charting Platform
### TradingView Alternative (Forex & Crypto only)

---

## 1. Overview

Ek web-based real-time charting platform, sirf **Forex** aur **Crypto** markets ke liye. TradingView jaisa look-and-feel, lekin lightweight aur focused.

**Tech Stack:**
- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Charting Library:** `lightweight-charts` (by TradingView, open-source, free) ya `klinecharts`
- **Backend:** Node.js + Express (ya Next.js API routes / separate microservice)
- **Realtime:** WebSocket (native `ws` ya Socket.IO)
- **Database:** MongoDB (Mongoose ODM)
- **Auth:** JWT + refresh tokens, NextAuth (optional)
- **State Management:** Zustand / Redux Toolkit
- **Styling:** TailwindCSS

---

## 2. Core Features

| Feature | Detail |
|---|---|
| Real-time charts | Candlestick, OHLC, Line, Area |
| Volume | Separate pane, color-coded (green/red) |
| Timeframes | 1m, 5m, 15m, 1h, 4h, 1D, 1W |
| Indicators | EMA, SMA, RSI, MACD, VWAP, Bollinger Bands |
| Drawing tools | Trendline, Horizontal/Vertical Line, Fibonacci Retracement, Rectangle |
| Symbol search | Autocomplete, recent searches |
| Watchlist | User-specific, saved in DB |
| Price alerts | Trigger via WebSocket push + email/notification |
| Multi-chart layout | 1 / 2 / 4 charts in one window (grid layout) |
| Independent sync | Har chart ka symbol/timeframe alag-alag change ho sake |
| Auth | Login/Signup, saved workspace (layout + indicators + watchlist) |

---

## 3. Data Sources (Forex + Crypto)

- **Crypto:** Binance WebSocket API (free, real-time klines/trades) — `wss://stream.binance.com:9443`
- **Forex:** 
  - Free/cheap options: **Twelve Data**, **Finnhub**, **OANDA API**, **Polygon.io**
  - Forex market thoda tricky hai kyunki free real-time forex feeds limited hain — Twelve Data ya Finnhub recommended for MVP.

---

## 4. Architecture

```
                ┌─────────────────────────┐
                │   Next.js Frontend      │
                │  (Charts, UI, Auth)     │
                └───────────┬─────────────┘
                            │ REST (auth, watchlist, alerts)
                            │ WebSocket (live prices)
                ┌───────────▼─────────────┐
                │   Node.js Backend       │
                │  - Express REST API     │
                │  - WS Server (Socket.IO)│
                │  - Alert Engine (cron)  │
                └───────────┬─────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    ┌──────────┐     ┌──────────────┐   ┌──────────┐
    │ MongoDB  │     │ Binance WS   │   │ Forex API│
    │ (users,  │     │ (crypto feed)│   │ (Twelve  │
    │ watchlist,│    │              │   │ Data etc)│
    │ alerts)  │     └──────────────┘   └──────────┘
    └──────────┘
```

**Data flow:** Backend external feeds (Binance WS + Forex API) se live ticks leta hai → normalize karta hai (common OHLCV format) → apne WebSocket server se connected clients ko broadcast karta hai (symbol-wise rooms/channels).

---

## 5. Folder Structure

```
tradecharts/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── signup/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx      # main multi-chart workspace
│   │   │   ├── layout.tsx
│   │   │   └── api/               # optional BFF routes
│   │   ├── components/
│   │   │   ├── chart/
│   │   │   │   ├── ChartPanel.tsx
│   │   │   │   ├── ChartGrid.tsx        # 1/2/4 layout
│   │   │   │   ├── IndicatorPanel.tsx
│   │   │   │   ├── DrawingToolbar.tsx
│   │   │   │   └── TimeframeSelector.tsx
│   │   │   ├── watchlist/
│   │   │   ├── alerts/
│   │   │   ├── search/
│   │   │   └── common/
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useChartData.ts
│   │   │   └── useIndicators.ts
│   │   ├── store/                 # Zustand stores
│   │   │   ├── chartStore.ts
│   │   │   ├── workspaceStore.ts
│   │   │   └── authStore.ts
│   │   ├── lib/
│   │   │   ├── indicators/        # EMA, SMA, RSI, MACD, VWAP calc
│   │   │   └── api.ts
│   │   └── types/
│   │
│   └── server/                    # Node.js backend
│       ├── src/
│       │   ├── index.ts
│       │   ├── config/
│       │   ├── models/
│       │   │   ├── User.ts
│       │   │   ├── Watchlist.ts
│       │   │   ├── Alert.ts
│       │   │   └── Workspace.ts
│       │   ├── routes/
│       │   │   ├── auth.routes.ts
│       │   │   ├── watchlist.routes.ts
│       │   │   ├── alert.routes.ts
│       │   │   ├── symbol.routes.ts
│       │   │   └── workspace.routes.ts
│       │   ├── controllers/
│       │   ├── services/
│       │   │   ├── binanceFeed.ts
│       │   │   ├── forexFeed.ts
│       │   │   ├── alertEngine.ts
│       │   │   └── candleAggregator.ts   # tick -> OHLC candle builder
│       │   ├── ws/
│       │   │   ├── wsServer.ts
│       │   │   └── channels.ts            # per-symbol rooms
│       │   ├── middleware/
│       │   │   └── auth.middleware.ts
│       │   └── utils/
│       └── package.json
│
├── packages/                      # shared code (monorepo, optional)
│   └── types/                     # shared TS types (OHLCV, Alert, etc.)
│
├── docker-compose.yml
└── package.json
```

*(Turborepo/Nx monorepo recommended agar scale karna ho, warna simple 2-folder setup bhi chalega.)*

---

## 6. MongoDB Schema (high-level)

**users**
```ts
{
  _id, email, passwordHash, name,
  createdAt, plan: "free" | "pro"
}
```

**watchlists**
```ts
{
  _id, userId, name: "Default",
  symbols: [{ symbol: "BTCUSDT", type: "crypto" }, { symbol: "EURUSD", type: "forex" }]
}
```

**alerts**
```ts
{
  _id, userId, symbol, type: "crypto"|"forex",
  condition: "price_above" | "price_below" | "crosses",
  targetPrice, status: "active"|"triggered",
  notifyVia: ["push","email"], createdAt
}
```

**workspaces**
```ts
{
  _id, userId, name: "My Layout",
  layout: "1"|"2"|"4",
  charts: [
    { id, symbol, timeframe, indicators: ["EMA20","RSI14"], drawings: [...] }
  ],
  updatedAt
}
```

**candles** (optional caching layer for historical data)
```ts
{
  symbol, timeframe, timestamp, open, high, low, close, volume
}
```
(Index: `{symbol:1, timeframe:1, timestamp:1}` unique)

---

## 7. REST API (sample)

```
POST   /api/auth/signup
POST   /api/auth/login
GET    /api/symbols/search?q=BTC
GET    /api/candles?symbol=BTCUSDT&tf=1h&from=&to=
GET    /api/watchlist
POST   /api/watchlist
DELETE /api/watchlist/:id
GET    /api/alerts
POST   /api/alerts
DELETE /api/alerts/:id
GET    /api/workspace
POST   /api/workspace
```

## 8. WebSocket Events

```
Client → Server:
  subscribe   { symbol, timeframe }
  unsubscribe { symbol, timeframe }

Server → Client:
  candle:update   { symbol, timeframe, candle }   // live forming candle
  candle:closed   { symbol, timeframe, candle }   // finalized candle
  alert:triggered { alertId, symbol, price }
```

Har chart apna khud ka `symbol:timeframe` subscription rakhta hai — isse 1–4 charts independently live update hote hain bina ek dusre ko affect kiye.

---

## 9. Indicators (calculation approach)

Client-side compute karna better hai (fast, no server load) using historical candle array:
- **SMA/EMA:** rolling window calculation
- **RSI:** 14-period average gain/loss
- **MACD:** EMA12 - EMA26, signal = EMA9 of MACD
- **VWAP:** cumulative (price*volume)/cumulative volume, session-based reset

Libraries: `technicalindicators` (npm package) use kar sakte ho — EMA, SMA, RSI, MACD, VWAP sab built-in hain.

---

## 10. Roadmap (Milestones)

1. **MVP (2–3 weeks):** Auth, single chart, Binance crypto live data, basic candlestick + volume, timeframe switch
2. **Phase 2:** Forex feed integration, indicators (EMA/SMA/RSI/MACD/VWAP), symbol search
3. **Phase 3:** Drawing tools (trendline, fib, horizontal line), multi-chart grid (1/2/4)
4. **Phase 4:** Watchlist, price alerts + notification engine
5. **Phase 5:** Saved workspaces, polish UI, performance optimization

---

## 11. Environment Variables

```
MONGODB_URI=
JWT_SECRET=
BINANCE_WS_URL=wss://stream.binance.com:9443
FOREX_API_KEY=
FOREX_API_PROVIDER=twelvedata
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

---

## 12. Notes

- Real-time forex data free me easily available nahi — budget rakhna padega (Twelve Data / Finnhub paid tiers) production ke liye.
- `lightweight-charts` performance ke liye best hai (TradingView khud isi ko use karta hai apne open-source widget me).
- Multi-chart grid ke liye har `ChartPanel` apna independent state + WS subscription rakhega — global store sirf layout config store karega.