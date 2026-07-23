import type { PartyLocale } from "@/lib/party-context";

type Question = { en: string; ru: string };

const QUESTIONS: Record<1 | 2 | 3, readonly Question[]> = {
  1: [
    {
      en: "Which object around this grill best describes your week, and what exactly happened?",
      ru: "Какой предмет у этого гриля лучше всего описывает твою неделю — и что именно случилось?",
    },
    {
      en: "What tiny role in group cooking do you take far more seriously than it deserves?",
      ru: "Какую мелкую роль в общей готовке ты воспринимаешь подозрительно серьёзно?",
    },
    {
      en: "When did your plan last have roughly the same control as this smoke?",
      ru: "Когда твой план в последний раз контролировался примерно так же, как этот дым?",
    },
  ],
  2: [
    {
      en: "What harmless truth about yourself do you usually plate more beautifully than it deserves?",
      ru: "Какую безобидную правду о себе ты обычно сервируешь красивее, чем она заслуживает?",
    },
    {
      en: "Which decision do you keep defending long after it reached the burnt side, and what detail gives it away?",
      ru: "Какое своё решение ты защищаешь уже после стадии «подгорело» — и какая деталь тебя выдаёт?",
    },
    {
      en: "What do your friends trust you with that they absolutely should inspect first?",
      ru: "Что друзья тебе доверяют, хотя сначала им стоило бы это внимательно осмотреть?",
    },
  ],
  3: [
    {
      en: "Which opinion do you perform with confidence but would quietly return to the grill for another minute?",
      ru: "Какое мнение ты подаёшь уверенно, но втайне вернул бы на гриль ещё на минуту?",
    },
    {
      en: "Which recent choice was mostly ego wearing an apron, and what evidence proves it?",
      ru: "Какое недавнее решение было в основном твоим эго в фартуке — и какая улика это доказывает?",
    },
    {
      en: "What promise to yourself is currently smoking more than cooking? Be specific without naming anyone else.",
      ru: "Какое обещание самому себе сейчас больше дымит, чем готовится? Конкретно, без чужих имён.",
    },
  ],
};

export function fallbackTongsQuestion(locale: PartyLocale, level: 1 | 2 | 3, seed: number) {
  const pool = QUESTIONS[level];
  const item = pool[Math.abs(Math.trunc(seed)) % pool.length]!;
  return item[locale];
}
