export type VoiceTone = "dry" | "feral" | "neutral";
export type VoiceContext = "standard" | "sensitive";
const lines = {
  openTable: { dry: "Start a fresh disappointment", feral: "Unleash another table", neutral: "Open table" },
  sendKitchen: { dry: "Send this disaster to the kitchen", feral: "Make the kitchen regret clocking in", neutral: "Send to kitchen" },
  splitCheck: { dry: "One check or destroy several friendships?", feral: "Divide the financial trauma", neutral: "Split payment" }
} as const;
export function voice(key: keyof typeof lines, tone: VoiceTone, context: VoiceContext = "standard") { return lines[key][context === "sensitive" ? "neutral" : tone]; }
