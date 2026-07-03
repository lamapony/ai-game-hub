// Fallback questions for "Кто здесь бот?" — used when the AI generator is unreachable.
export type ImpostorQuestion = {
  id: string;
  text: string;
};

export const IMPOSTOR_QUESTION_CATALOG: ImpostorQuestion[] = [
  { id: "excuse-late", text: "Самая нелепая отмазка, чтобы уйти с вечеринки пораньше?" },
  { id: "cocktail-name", text: "Как бы назывался коктейль в честь сегодняшнего вечера?" },
  { id: "bar-superpower", text: "Бесполезная суперспособность, которая пригодится только в баре?" },
  { id: "toast-worst", text: "Худший тост, который можно произнести на дне рождения?" },
  {
    id: "dating-bio",
    text: "Первая строчка анкеты в приложении для знакомств, после которой сразу свайпают влево?",
  },
  { id: "secret-menu", text: "Что должно быть в секретном меню этой бодеги?" },
  { id: "hangover-cure", text: "Народное средство от похмелья, которое звучит как заговор?" },
  { id: "karaoke-ban", text: "Песня, которую стоило бы запретить в караоке навсегда?" },
  { id: "wifi-name", text: "Название вай-фая, по которому сразу понятно, что за люди тут живут?" },
  { id: "last-message", text: "Сообщение в 3 часа ночи, после которого лучше сменить номер?" },
  { id: "job-title", text: "Выдуманная должность, которая звучит важно, но ничего не значит?" },
  { id: "museum-item", text: "Какой предмет с этой вечеринки попадёт в музей через 100 лет?" },
];

export function pickImpostorQuestion(
  usedQuestionIds: string[],
  random = Math.random(),
): ImpostorQuestion {
  const available = IMPOSTOR_QUESTION_CATALOG.filter((q) => !usedQuestionIds.includes(q.id));
  const pool = available.length > 0 ? available : IMPOSTOR_QUESTION_CATALOG;
  const index = Math.min(pool.length - 1, Math.floor(random * pool.length));
  return pool[index]!;
}
