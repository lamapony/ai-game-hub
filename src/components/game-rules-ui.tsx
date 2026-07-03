import { useState } from "react";
import type { GameId } from "@/lib/types";
import { GAME_IDS, GAME_RULES, type GameRules } from "@/lib/game-rules";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function GameRulesStepsList({ rules, compact }: { rules: GameRules; compact?: boolean }) {
  return (
    <ol
      className={`list-decimal list-inside space-y-1 ${compact ? "text-xs leading-relaxed" : "text-sm"}`}
    >
      {rules.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export function GameRulesFullCard({ rules }: { rules: GameRules }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-4xl leading-none">{rules.emoji}</span>
        <div>
          <div className="font-display text-xl">{rules.title}</div>
          <p className="text-sm text-muted-foreground mt-0.5">{rules.tagline}</p>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          How to play
        </div>
        <GameRulesStepsList rules={rules} />
      </div>
      <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Scoring: </span>
        {rules.scoring}
      </div>
      <div className="text-xs text-muted-foreground">{rules.minPlayers}</div>
    </div>
  );
}

export function GameRulesDialogTrigger({
  gameId,
  className,
}: {
  gameId: GameId;
  className?: string;
}) {
  const rules = GAME_RULES[gameId];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={
            className ??
            "rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/80 hover:bg-white/20 hover:text-white"
          }
        >
          Rules
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{rules.title}</DialogTitle>
          <DialogDescription className="sr-only">{rules.tagline}</DialogDescription>
        </DialogHeader>
        <GameRulesFullCard rules={rules} />
      </DialogContent>
    </Dialog>
  );
}

export function GameRulesBrowser() {
  const [selected, setSelected] = useState<GameId>(GAME_IDS[0]!);
  const rules = GAME_RULES[selected];

  return (
    <div className="mt-4 text-left">
      <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">
        While waiting — check the rules
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {GAME_IDS.map((id) => {
          const item = GAME_RULES[id];
          const active = id === selected;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`shrink-0 snap-start rounded-2xl border px-3 py-2 text-center transition ${
                active
                  ? "border-[var(--color-park-bright)]/50 bg-[var(--color-park-bright)]/15"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
              aria-label={item.title}
              aria-pressed={active}
            >
              <div className="text-2xl leading-none">{item.emoji}</div>
              <div className="text-[10px] mt-1 max-w-[4.5rem] truncate opacity-80">
                {item.title.split(" ")[0]}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-white">
        <div className="flex items-center gap-2">
          <span className="text-xl">{rules.emoji}</span>
          <div className="font-display text-lg leading-tight">{rules.title}</div>
        </div>
        <p className="text-xs text-white/55 mt-1">{rules.tagline}</p>
        <div className="mt-3 text-white/75">
          <GameRulesStepsList rules={rules} compact />
        </div>
        <p className="mt-3 text-xs text-[var(--color-park-bright)]/90">{rules.scoring}</p>
      </div>
    </div>
  );
}

export function GameRulesChecklist({ gameId }: { gameId: GameId }) {
  const rules = GAME_RULES[gameId];
  return (
    <div className="mt-4 border-t border-white/10 pt-3 text-left">
      <div className="text-[10px] uppercase tracking-widest text-white/45 mb-2">How to play</div>
      <ol className="space-y-1 text-xs text-white/55 list-decimal list-inside leading-relaxed">
        {rules.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
