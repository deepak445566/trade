import "server-only";

export const env = {
  MONGODB_URI: process.env.MONGODB_URI ?? "",
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-only-insecure-secret-change-me",
  BINANCE_WS_URL: process.env.BINANCE_WS_URL ?? "wss://stream.binance.com:9443",
  BINANCE_REST_URL: process.env.BINANCE_REST_URL ?? "https://api.binance.com",
  BINANCE_FUTURES_WS_URL: process.env.BINANCE_FUTURES_WS_URL ?? "wss://fstream.binance.com/market",
  BINANCE_FUTURES_REST_URL: process.env.BINANCE_FUTURES_REST_URL ?? "https://fapi.binance.com",
  SMTP_HOST: process.env.SMTP_HOST ?? "",
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? "",
  SMTP_PASS: process.env.SMTP_PASS ?? "",
  MAIL_FROM: process.env.MAIL_FROM ?? "TradeCharts <alerts@tradecharts.local>",
  isProd: process.env.NODE_ENV === "production",
};

if (env.isProd && !process.env.JWT_SECRET) {
  console.warn("[env] JWT_SECRET is not set — using an insecure default. Set it before deploying.");
}
