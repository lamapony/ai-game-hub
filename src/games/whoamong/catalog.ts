export type CatalogPrompt = {
  id: string;
  text: string;
};

export const PROMPT_CATALOG: CatalogPrompt[] = [
  { id: "sleep-party", text: "Кто из нас скорее всего заснёт до конца вечеринки?" },
  { id: "oscar-speech", text: 'Кто из нас втайне репетирует речь для "Оскара"?' },
  { id: "fridge-lunch", text: "Кто из нас съел бы чужой обед из общего холодильника?" },
  { id: "tech-support", text: "Кто из нас позвонил бы в техподдержку, чтобы просто поболтать?" },
  { id: "wedding-sleep", text: "Кто из нас скорее всего проспал бы собственную свадьбу?" },
  { id: "alarm-10", text: "Кто из нас ставит будильник на 6:00, а встаёт в полдень?" },
  { id: "karaoke-hero", text: "Кто из нас первым прыгнет на сцену караоке без подготовки?" },
  { id: "phone-scroll", text: "Кто из нас залипает в телефон, пока все вокруг разговаривают?" },
  { id: "lost-keys", text: "Кто из нас теряет ключи чаще, чем находит их?" },
  {
    id: "dance-floor",
    text: "Кто из нас танцует так, будто никто не смотрит — даже когда все смотрят?",
  },
  {
    id: "snack-hoard",
    text: "Кто из нас прячет вкусняшки «на потом», а съедает через пять минут?",
  },
  {
    id: "google-doctor",
    text: "Кто из нас гуглит симптомы и убеждается, что у него редчайшая болезнь?",
  },
  { id: "meme-lord", text: "Кто из нас шлёт мемы в чат в 3 ночи и ждёт реакции?" },
  { id: "hero-cat", text: "Кто из нас спас бы кота с дерева, а потом выложил бы сторис?" },
  { id: "procrastinator", text: "Кто из нас говорит «сейчас выйду» и появляется через полчаса?" },
  { id: "spicy-food", text: "Кто из нас заказывает острое «для смелости» и потом жалеет?" },
  { id: "selfie-pro", text: "Кто из нас делает 47 селфи, чтобы выбрать одно «случайное»?" },
  {
    id: "playlist-dj",
    text: "Кто из нас уверен, что его плейлист — идеальный фон для любой вечеринки?",
  },
  { id: "awkward-hug", text: "Кто из нас попадает в неловкие объятия чаще всех?" },
  { id: "group-chat", text: "Кто из нас читает все сообщения в чате, но отвечает раз в неделю?" },
  { id: "chaos-cook", text: "Кто из нас готовит так, что кухня выглядит как поле боя?" },
  { id: "fortune-teller", text: "Кто из нас гадает на кофейной гуще и верит результату на 100%?" },
  { id: "rain-umbrella", text: "Кто из нас забывает зонт в солнечный день и попадает под ливень?" },
  {
    id: "voice-note",
    text: "Кто из нас записывает голосовые по три минуты вместо короткого «ок»?",
  },
  { id: "secret-singer", text: "Кто из нас поёт в душе так громко, что соседи знают репертуар?" },
  { id: "coupon-king", text: "Кто из нас копит скидочные купоны как сокровища?" },
  { id: "plant-parent", text: "Кто из нас покупает растения с любовью и забывает их полить?" },
  { id: "late-legend", text: "Кто из нас опаздывает даже на онлайн-встречу?" },
  { id: "drama-queen", text: "Кто из нас раздувает маленькую историю до эпического сериала?" },
  { id: "lucky-charm", text: "Кто из нас носит «счастливые» носки на важные события?" },
  { id: "bar-tab", text: "Кто из нас скажет «я угощаю» и втайне будет страдать весь вечер?" },
  { id: "toast-master", text: "Кто из нас произнесёт тост на 5 минут, забыв, за что пьём?" },
  { id: "bartender-friend", text: "Кто из нас подружится с барменом за один вечер?" },
  { id: "cocktail-menu", text: "Кто из нас читает коктейльное меню как философский трактат?" },
  { id: "last-dance", text: "Кто из нас уйдёт из бара последним, выключая за собой свет?" },
  {
    id: "storyteller",
    text: "Кто из нас завтра будет рассказывать про этот вечер лучше, чем он был?",
  },
];

export function getCatalogPrompt(promptId: string | undefined): CatalogPrompt | null {
  if (!promptId) return null;
  return PROMPT_CATALOG.find((p) => p.id === promptId) ?? null;
}

export function pickCatalogPrompt(usedPromptIds: string[], random = Math.random()): CatalogPrompt {
  const available = PROMPT_CATALOG.filter((p) => !usedPromptIds.includes(p.id));
  const pool = available.length > 0 ? available : PROMPT_CATALOG;
  const index = Math.min(pool.length - 1, Math.floor(random * pool.length));
  return pool[index]!;
}
