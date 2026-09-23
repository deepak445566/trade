import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WorkspaceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, default: "My Layout" },
    layout: { type: String, enum: ["1", "2", "4"], default: "1" },
    // Chart configs (symbol, timeframe, indicators, drawings) are stored as-is;
    // they are validated/sanitized in the route handler before saving.
    charts: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

export const Workspace: Model<InferSchemaType<typeof WorkspaceSchema>> =
  mongoose.models.Workspace ?? mongoose.model("Workspace", WorkspaceSchema);
