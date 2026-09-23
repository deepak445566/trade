import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// Optional cache of closed historical candles (fallback when the upstream REST API fails).
const CandleSchema = new Schema({
  symbol: { type: String, required: true },
  timeframe: { type: String, required: true },
  timestamp: { type: Number, required: true }, // open time, unix seconds
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
});

CandleSchema.index({ symbol: 1, timeframe: 1, timestamp: 1 }, { unique: true });

export const CandleModel: Model<InferSchemaType<typeof CandleSchema>> =
  mongoose.models.Candle ?? mongoose.model("Candle", CandleSchema);
