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
    <div className="agh-rules-browser">
      <div className="agh-rules-browser-heading">While waiting: check the rules</div>
      <div className="agh-rules-browser-tabs">
        {GAME_IDS.map((id, index) => {
          const item = GAME_RULES[id];
          const active = id === selected;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={active ? "is-active" : ""}
              aria-label={item.title}
              aria-pressed={active}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
            </button>
          );
        })}
      </div>
      <div className="agh-rules-browser-detail">
        <strong>{rules.title}</strong>
        <p>{rules.tagline}</p>
        <div>
          <GameRulesStepsList rules={rules} compact />
        </div>
        <p>{rules.scoring}</p>
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
