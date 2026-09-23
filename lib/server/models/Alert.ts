import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AlertSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    symbol: { type: String, required: true, uppercase: true },
    type: { type: String, enum: ["crypto", "forex"], default: "crypto" },
    condition: { type: String, enum: ["price_above", "price_below", "crosses"], required: true },
    targetPrice: { type: Number, required: true },
    status: { type: String, enum: ["active", "triggered"], default: "active", index: true },
    notifyVia: { type: [String], enum: ["push", "email"], default: ["push"] },
    triggeredAt: { type: Date },
    triggeredPrice: { type: Number },
  },
  { timestamps: true },
);

export type AlertDoc = InferSchemaType<typeof AlertSchema> & { _id: mongoose.Types.ObjectId };

export const Alert: Model<InferSchemaType<typeof AlertSchema>> =
  mongoose.models.Alert ?? mongoose.model("Alert", AlertSchema);
