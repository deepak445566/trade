import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WatchlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "Default" },
    symbols: [
      {
        _id: false,
        symbol: { type: String, required: true, uppercase: true },
        type: { type: String, enum: ["crypto", "forex"], default: "crypto" },
      },
    ],
  },
  { timestamps: true },
);

WatchlistSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Watchlist: Model<InferSchemaType<typeof WatchlistSchema>> =
  mongoose.models.Watchlist ?? mongoose.model("Watchlist", WatchlistSchema);
