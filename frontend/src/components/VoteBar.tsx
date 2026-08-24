import { ArrowLeftToLine, ArrowRightToLine, Equal } from "lucide-react";
import type { Vote } from "../types";

export function VoteBar({ vote, onVote }: { vote?: Vote; onVote: (winner: Vote["winner"]) => void }) {
  const btn = (winner: Vote["winner"], label: string, Icon: typeof Equal) => (
    <button
      onClick={() => onVote(winner)}
      disabled={!!vote}
      className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
        vote?.winner === winner
          ? "border-accent-500 bg-accent-500/15 text-white"
          : vote
          ? "border-base-700/60 text-slate-600"
          : "border-base-600/60 text-slate-300 hover:border-accent-500/50 hover:bg-base-700/50"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="flex animate-fade-in-up items-center justify-center gap-2 py-2">
      {btn("a", "Left is better", ArrowLeftToLine)}
      {btn("tie", "Tie", Equal)}
      {btn("b", "Right is better", ArrowRightToLine)}
    </div>
  );
}
