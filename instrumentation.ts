/** Starts the server-side alert + paper-trading engines when the Next.js server boots. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAlertEngine } = await import("./lib/server/alertEngine");
    const { ensurePaperEngine } = await import("./lib/server/paperEngine");
    ensureAlertEngine();
    ensurePaperEngine();
  }
}
