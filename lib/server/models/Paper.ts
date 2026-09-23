import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const PAPER_STARTING_BALANCE = 10_000;

/** Virtual (dummy) trading account — one per user. `balance` is realized cash in USD. */
const PaperAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: PAPER_STARTING_BALANCE },
    startingBalance: { type: Number, default: PAPER_STARTING_BALANCE },
  },
  { timestamps: true },
);

export const PaperAccount: Model<InferSchemaType<typeof PaperAccountSchema>> =
  mongoose.models.PaperAccount ?? mongoose.model("PaperAccount", PaperAccountSchema);

/**
 * A paper trade: starts `pending` (limit order) or `open` (market order),
 * then ends `closed` (TP / SL / manual / liquidation) or `cancelled`.
 */
const PaperTradeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    symbol: { type: String, required: true, uppercase: true },
    side: { type: String, enum: ["long", "short"], required: true },
    orderType: { type: String, enum: ["market", "limit"], required: true },
    qty: { type: Number, required: true },
    leverage: { type: Number, default: 1 },
    limitPrice: { type: Number },
    entryPrice: { type: Number },
    sl: { type: Number },
    tp: { type: Number },
    status: { type: String, enum: ["pending", "open", "closed", "cancelled"], required: true, index: true },
    exitPrice: { type: Number },
    pnl: { type: Number },
    closeReason: { type: String, enum: ["tp", "sl", "manual", "liquidation"] },
    openedAt: { type: Date },
    closedAt: { type: Date },
  },
  { timestamps: true },
);

export type PaperTradeDoc = InferSchemaType<typeof PaperTradeSchema> & { _id: mongoose.Types.ObjectId };

export const PaperTrade: Model<InferSchemaType<typeof PaperTradeSchema>> =
  mongoose.models.PaperTrade ?? mongoose.model("PaperTrade", PaperTradeSchema);
