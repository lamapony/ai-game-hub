import type { PartyLocale } from "@/lib/party-context";

const PHRASES = [
  ["I generally trust ducks", "я в целом доверяю уткам"],
  [
    "This is like the Bologna Process, only backwards",
    "это как Болонский процесс, только наоборот",
  ],
  ["I have never trusted decorative ladders", "я никогда не доверял декоративным лестницам"],
  [
    "That is exactly what a provincial aquarium would say",
    "именно так сказал бы провинциальный аквариум",
  ],
  ["The spoon has already made its decision", "ложка уже приняла своё решение"],
  [
    "I respect the administrative courage of this napkin",
    "я уважаю административную смелость этой салфетки",
  ],
  [
    "This light makes everyone look legally persuasive",
    "в этом свете все выглядят юридически убедительно",
  ],
  [
    "We are one menu away from a constitutional crisis",
    "нас отделяет одно меню от конституционного кризиса",
  ],
  ["I once lost an argument to a coat rack", "однажды я проиграл спор вешалке"],
  ["The ice cubes know more than they admit", "кубики льда знают больше, чем признают"],
  ["I would outsource this decision to a pigeon", "я бы отдал это решение на аутсорс голубю"],
  ["The table has a surprisingly strong alibi", "у этого стола неожиданно сильное алиби"],
  ["That sounds expensive in a very municipal way", "это звучит дорого, но как-то муниципально"],
  ["I blame the emotionally unavailable chandelier", "я виню эмоционально недоступную люстру"],
  ["This glass has middle-management energy", "у этого бокала энергия среднего менеджмента"],
  ["The olives have formed a coalition", "оливки сформировали коалицию"],
  ["I support the chair, but not its methods", "я поддерживаю этот стул, но не его методы"],
  ["That is a very ambitious opinion for a Tuesday", "для вторника это слишком амбициозное мнение"],
  ["Nobody asked how the lemon feels about this", "никто не спросил, что об этом думает лимон"],
  ["We need a witness with better posture", "нам нужен свидетель с лучшей осанкой"],
  ["The bar counter has seen this pattern before", "барная стойка уже видела такой почерк"],
  ["I refuse to be audited by a candle", "я отказываюсь проходить аудит у свечи"],
  ["This conversation needs a licensed umbrella", "этому разговору нужен лицензированный зонт"],
  ["The receipt is clearly withholding evidence", "чек явно скрывает улики"],
  ["I have a complicated history with tiny forks", "у меня сложная история с маленькими вилками"],
  ["That is not gossip, it is oral architecture", "это не сплетня, а устная архитектура"],
  ["The coat check controls the narrative", "гардероб контролирует нарратив"],
  ["I would describe this as aggressively beige", "я бы назвал это агрессивно бежевым"],
  ["The playlist has exceeded its authority", "плейлист превысил свои полномочия"],
  ["This is why swans need supervision", "вот почему лебедям нужен надзор"],
  [
    "The coaster is doing important diplomatic work",
    "подставка под бокал ведёт важную дипломатическую работу",
  ],
  [
    "We are underestimating the strategic value of parsley",
    "мы недооцениваем стратегическую ценность петрушки",
  ],
  ["That mirror is not a neutral observer", "это зеркало не нейтральный наблюдатель"],
  [
    "I have seen more convincing bureaucracy in a sandwich",
    "я видел более убедительную бюрократию в бутерброде",
  ],
  ["The door has a conflict of interest", "у этой двери конфликт интересов"],
  [
    "I would not put that past a ceramic flamingo",
    "я бы не удивился, если это сделал керамический фламинго",
  ],
] as const;

export function contrabandFallbackPhrases(locale: PartyLocale, count: number, seed = 0) {
  const offset = Math.abs(seed) % PHRASES.length;
  return Array.from({ length: Math.min(count, PHRASES.length) }, (_, index) => {
    const phrase = PHRASES[(offset + index) % PHRASES.length]!;
    return locale === "ru" ? phrase[1] : phrase[0];
  });
}
