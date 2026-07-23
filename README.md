# AI Game Hub · DIMAS fest

Платформа живых AI-вечеринок: один ведущий запускает комнату, гости заходят с телефонов по QR-коду,
а игры используют людей, предметы, звук, фото и реальные события вечера. Проект развивается от
park-style набора игр к цельным сценариям на несколько актов, где ранние действия возвращаются в
секретах, раскрытиях и финале.

Сейчас доступны:

- **Two-minute quick start** — ведущий до создания комнаты выбирает парк, бар, дом или фестиваль,
  точную программу на 2 / 3 / 4 часа и ожидаемую группу 8–30 человек. Комната сразу создаётся с
  цельным run of show, а host-readiness проверяет фактическую длительность маршрута, живой QR и
  минимум восемь подключившихся гостей. Когда program и backend зелёные, одна кнопка **Start the
  party** серверно запускает первый сюжетный cue и показывает ведущему реплику; исходное время
  сохраняется при retry. Встроенный **Do this now** coach в каждый момент даёт ровно одно действие:
  дождаться live-check, открыть Live safety, показать полноэкранный QR или начать первый cue;
  заблокированная кнопка старта больше не выдаётся за полезную подсказку. Пройденные игры и
  сюжетные паузы не предлагаются повторно после lobby.
- **Self-serve host brief** — выбранная программа до создания комнаты объясняет обычным языком,
  сколько в ней игровых моментов, сюжетных пауз и финалов, где понадобятся camera/mic/playback и
  что ведущему приготовить для конкретной площадки. Памятка строится из реального route + game
  registry, остаётся на host-экране после QR и сразу обещает fallback без потери маршрута или
  финала. Ведущий может добавить одну публичную деталь вечера до 160 символов — повод, предмет или
  внутреннюю шутку; она сохраняется как **Tonight's thread** и безопасно подмешивается во все
  party-mode AI prompts и финал как JSON-quoted untrusted flavor, а не инструкция. Отдельный быстрый
  Chrome gate проверяет park/bar/home/festival без тяжёлого player burst.
- **Route dress rehearsal** — `bun run test:rehearsal` программно проходит все 12 quick-start
  маршрутов на границах 8 и 30 игроков, проверяя `begin → active → complete` для таймированных
  моментов, доступность игр, идемпотентный прогресс и finale. Ранняя публичная улика Soundscape
  обязана пережить все последующие запуски своего маршрута и попасть в общий case file.
- **Browser lobby matrix** — системный Chrome проверяет четыре площадки, 2/3/4 часа и границы 8/30
  одновременных изолированных игроков, ждёт точный зелёный host-readiness и удаляет каждую комнату.
- **Self-serve phone preflight** — в lobby каждый игрок одним нажатием проверяет camera + mic; ни
  кадр, ни звук не сохраняются. Авторизованный server action фиксирует только ready/blocked status,
  ведущий видит общий счётчик и проблемный телефон до старта, а stale host state не стирает более
  свежий результат проверки.
- **Release-aware host readiness** — защищённый server preflight проверяет private party memory,
  score ledger, приватный `recordings` bucket и AI credential. Quick start не показывает ложное
  `Ready inside 2 minutes`, если программа собрана, но live backend не готов; Live safety называет
  безопасное конкретное действие без выдачи provider errors или секретов в браузер.
- **Private host handoff** — в **Live safety** ведущий заранее копирует закрытую backup-ссылку на
  второе доверенное устройство. Credential находится только в URL fragment, не уходит в HTTP URL
  или referrer, немедленно убирается из адресной строки и сохраняется только после server-side
  проверки. Новые комнаты используют 192-bit host secret; публичный QR по-прежнему содержит только
  player join URL.
- **Classic free play** — семь совместимых игр: Soundscape, Challenge, Photo Hunt, Real or AI?,
  Spectrum Court, Who Among Us и Who's the Bot.
- **Smoke & Neon conductor** — full evening, bar-only и compact маршруты с таймлайном,
  environment-aware рекомендациями и безопасным переключением Grill → Bar → Finale.
- **Grill Oracle cross-act loop** — восьмая зарегистрированная игра: каждый участник снимает
  реальную улику гриля или бара и получает ровно три приватных предсказания. На Transition сервер
  действительно скрывает текст даже от владельца, в Bar ведущий вскрывает архив и зал фиксирует
  три true/false исхода. AI пишет только едкий вердикт; сервер начисляет +5 владельцу за сбывшееся
  и +3 каждой представленной команде-скептику за несбывшееся. Повтор запроса не дублирует очки.
- **Smoke Screen background run** — девятая зарегистрированная игра и первый настоящий фоновой
  runtime. AI приватно раздаёт каждому миссию на 5 / 10 / 15 очков; поверх неё можно запускать
  любые foreground-игры. При переходе в Bar исходные записи запечатываются, а зал получает только
  анонимные копии миссий и сдаёт приватные бюллетени. После host-confirmation сервер раскрывает
  владельцев, начисляет tier-джекпот только невычисленным исполнителям и +2 за каждую правильную
  чужую идентификацию; AI пишет recap, но не управляет счётом.
- **Toast Syndicate bar ritual** — десятая зарегистрированная игра: шесть говорящих по очереди
  получают по три player-private контрабандных слова и публичный жанр тоста. Говорящий записывает
  30–60 секунд, сервер скачивает signed upload и сам запускает STT; слушатели сдают неизменяемые
  приватные бюллетени максимум из трёх подозрительных слов. AI оценивает жанр и гладкость, но
  сервер пересчитывает `genre 0–10 + 5` за каждое использованное непойманное слово и `+3`
  конкретному слушателю за точную поимку. Повтор запроса не дублирует запись или ledger events.
- **Still Life Survival team build** — одиннадцатая зарегистрированная игра: команды получают
  общий абсурдный заголовок, за пять минут строят физическую инсталляцию из еды, посуды и предметов
  места, затем загружают по одному фото. AI-куратор или ручное жюри ведущего оценивает композицию,
  драму и использование окружения по шкале 0–25; сервер заново считает итог, а закрытое голосование
  других команд используется только как тайбрейк. Storage paths, фото и бюллетени не попадают в
  публичный room state.
- **Sommelier Charlatan bar ritual** — двенадцатая зарегистрированная игра: до десяти гостей
  анонимно снимают стоящие перед ними напитки, а vision AI пишет дегустационные ноты, уровень
  претенциозности, ситуационную пару и едкий психопортрет неизвестного владельца. Зал угадывает
  владельца каждого бокала: сервер даёт +3 за точное попадание, +5 нераскрытому владельцу и один
  host-confirmed бонус +3 за самый громкий reveal вечера. Связка владельца с фото, storage paths и
  бюллетени остаются в приватных записях до публичного раскрытия.
- **Contraband background run** — тринадцатая зарегистрированная игра: каждому достаётся приватная
  фраза на 30 минут живого bar-разговора. Обвиняемый признаётся или записывает 8–25 секунд
  контекста; AI оценивает только органичность текста, а сервер фиксирует `+10 / +5 / −2` и при
  сбое передаёт дело ведущему без автоматического начисления.
- **Tongs of Truth grill relay** — четырнадцатая зарегистрированная игра и второй независимый
  background runtime: настоящие щипцы идут по рукам, AI задаёт вопрос одного из трёх уровней, а
  говорящий записывает 10–20 секунд. Сервер считает `конкретика 0–10 + артистизм 0–5 −3 за
уклонение +5 за реальный предмет/событие гриля`, никогда не обещает распознавание лжи и хранит
  аудио с транскриптом как host-only показание для будущего Cross Examination. В compact-сценарии
  игра автоматически превращается в пять level-3 ходов.
- **Cross Examination + ledger finale** — пятнадцатая зарегистрированная foreground-игра и
  callback-финал: сервер выбирает 3–4 пары, ведущий утверждает реальные эпизоды вечера и исключает
  чувствительные, а подельники независимо записывают показания на двух телефонах. Полные
  транскрипты, выбранные records и прогнозы зала остаются host-only; публичны только четыре
  вопроса, короткие версии и противоречия. AI пишет noir-комментарий, но severity 0–3, сила алиби,
  общий `+5` за непосказанную деталь окружения и `+2` за точный прогноз считает сервер. Если
  STT/AI недоступны, ведущий сверяет четыре ответа вручную или снимает дело без очков. Финальный
  экран независимо от Cross/AI строит Grill Royalty, Bar Legend, MVP и личные highlights из
  append-only score ledger, сохраняя обычный командный пьедестал как fallback.
- **Connected AI epilogue** — перед возвратом в hub или заменой foreground-игры сервер добавляет
  уже публичный результат в bounded-память вечера, а `finish-party` дописывает последнюю игру до
  очистки её state. На сюжетной паузе ведущий получает последнюю реальную улику как короткий
  callback-мостик, а финал превращает до трёх эпизодов в общий case file с тостом для host и
  телефонов игроков. Transcript, media URL, приватные задания, бюллетени и невскрытые пророчества
  в этот контракт не входят. Generation lease и CAS делают эпилог единым при двух host-вкладках;
  invalid AI JSON, выдуманный evidence id, manual mode или provider failure дают
  детерминированный schema-valid fallback без блокировки пьедестала.
- **Party foundation** — серверные команды, приватная память вечера и идемпотентный журнал очков.
- **Six experience packs** — совместимые Classic и Smoke & Neon плюс отдельные Park Expedition,
  Last Call Bureau, Household Evidence и Field Signal. Каждый новый pack делает реальную среду
  частью prompt context и имеет проверяемые compact / normal / extended маршруты на 120 / 180 /
  240 минут.
- **Act-aware AI** — Challenge, Photo Hunt, Who's the Bot и Grill Oracle получают персону и
  окружение текущего акта из авторизованного server state; Smoke Screen использует тот же строгий
  contract для миссий и recap, Toast Syndicate — для назначения и оценки, Still Life — для
  заголовка и vision-критики, Sommelier Charlatan — для анонимного профиля реального напитка,
  Contraband и Tongs of Truth — для безопасной оценки расшифрованной речи, Cross Examination —
  для вопросов по утверждённым ведущим реальным callbacks и короткого noir-вердикта.
  Classic park/bar поведение остаётся совместимым.

Проект полностью независим: сборка, AI и деплой работают напрямую через open-source tooling,
Supabase, OpenAI-compatible API и Vercel.

## Стек

- **TanStack Start v1** (React 19 + Vite 8, SSR под Vercel через Nitro)
- **TailwindCSS v4** (`src/styles.css`, без `tailwind.config.js`)
- **Supabase** — БД, Realtime, Storage (bucket `recordings`)
- **OpenAI-compatible API** — JSON judging/vision, TTS, STT
- **shadcn/ui** — компоненты в `src/components/ui`
- **Bun** — пакетный менеджер

## Требования

- Bun 1.1+ или Node.js 20+
- Supabase-проект
- OpenAI API key или совместимый endpoint
- Vercel account для production deploy (бесплатный Hobby plan подходит)

## Быстрый старт

```bash
bun install
cp .env.example .env
bun run dev
```

Dev server: `http://localhost:8080`

Production (публичная ссылка для игроков): `https://ai-game-hub-tau.vercel.app`

Сборка и предпросмотр:

```bash
bun run lint
bun test
bunx tsc --noEmit
bun run build
bun run preview
```

## Переменные окружения

| Переменная                      | Где доступна     | Назначение                             |
| ------------------------------- | ---------------- | -------------------------------------- |
| `VITE_PUBLIC_SITE_URL`          | браузер          | Публичный URL для QR и ссылок игрокам  |
| `VITE_SUPABASE_URL`             | браузер + сервер | URL Supabase-проекта                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | браузер + сервер | Anon/publishable key                   |
| `VITE_SUPABASE_PROJECT_ID`      | браузер          | Ref проекта                            |
| `SUPABASE_URL`                  | только сервер    | URL Supabase для server functions      |
| `SUPABASE_PUBLISHABLE_KEY`      | только сервер    | Publishable key для server functions   |
| `SUPABASE_SERVICE_ROLE_KEY`     | только сервер    | Bypass RLS. **Никогда не в браузере.** |
| `CLEANUP_SECRET`                | только сервер    | Secret для `POST /api/cleanup`         |
| `OPENAI_API_KEY`                | только сервер    | AI calls: JSON, vision, TTS, STT       |
| `OPENAI_BASE_URL`               | только сервер    | OpenAI-compatible base URL             |
| `OPENAI_CHAT_MODEL`             | только сервер    | JSON/text model                        |
| `OPENAI_VISION_MODEL`           | только сервер    | Vision-capable model                   |
| `OPENAI_TTS_MODEL`              | только сервер    | TTS model                              |
| `OPENAI_TRANSCRIBE_MODEL`       | только сервер    | STT model                              |
| `OPENAI_RETRY_ATTEMPTS`         | только сервер    | Retry attempts для transient AI errors |

`process.env.*` доступен только внутри `createServerFn().handler(...)`, файлов `*.server.ts` и `src/routes/api/*`. В браузере — только `import.meta.env.VITE_*`.

## AI

`src/lib/ai-gateway.server.ts` напрямую вызывает OpenAI-compatible endpoints:

- `POST /chat/completions` для генерации заданий, JSON-вердиктов и vision judging;
- `POST /audio/speech` для TTS;
- `POST /audio/transcriptions` для STT.

Versioned prompt-контракты лежат в `src/lib/ai/prompt-contract.ts` и отдельных `*.prompts.ts`.
Party-mode envelope всегда собирается в порядке persona/safety → language → server-derived act
environment → game instructions → scoring rubric → strict JSON schema → few-shots. Gateway сначала
использует native `json_schema`, а для совместимых провайдеров автоматически откатывается на
`json_object`; результат в обоих случаях проходит Zod-валидацию и deterministic fallback.

Text, vision, STT и TTS проходят через общий per-party credit ledger. Live safety показывает
`used / limit`, provider requests и provider-reported token usage; cap меняется typed host command,
а превышение останавливает внешний вызов до отправки и включает fallback. Conductor может заранее
подготовить Smoke Screen, Contraband, Toast или Still Life: результат остаётся в host-only
`party_records`, а публично виден только readiness. Cache identity включает act/context/locale и
roster, поэтому подготовленная колода не назначается после несовместимого изменения состава.

В **Live safety → Field-test report** ведущий может в любой момент скачать безопасный `.md` или
`.json` отчёт. Первый scripted cue и последний finale теперь сохраняют server timestamps, поэтому
отчёт отдельно показывает `room → 8 players`, `room → first live cue`, фактическую длительность,
device preflight, AI credits/tokens/failures, время manual fallback и целостность score ledger.
Автоматическая часть не содержит имён и id участников/команд, приватных заданий, расшифровок,
media paths, причин начисления или auth secrets; введённые вручную заметки нужно проверить перед
передачей. `Start new party` начинает новый интервал и очищает предыдущую runtime-телеметрию.

Challenge и Photo Hunt не принимают от модели итоговые party-points/ranks: Challenge считает
финальный score из ограниченного breakdown с `environmentBonus` 0–5, Photo Hunt сортирует bounded
criteria на сервере и только затем применяет таблицу мест 5 / 3 / 2 / 1. Host secret и prompt specs
не попадают в browser bundle.

Grill Oracle использует отдельный vision `PromptSpec` с точной схемой из ТЗ и Zod tuple ровно из
трёх предсказаний. Поле `points` сохраняется только как «интенсивность знамения» для совместимости
со спецификацией и никогда не попадает в `score_events` или team score. Vision-fallback не создаёт
автоматическое гадание: игрок получает понятную ошибку, а ведущий может выдать локальный шаблон.
После capture компактная payload-free `oracleMemory` переживает возврат в hub и смену акта. Само
пророчество проходит `player → sealed → revealed` в server-only `party_records`; общий records API
не может обойти act-aware Oracle lifecycle. Verification prompt использует строгую схему из ТЗ, но
его числа всегда заменяются серверным расчётом 5/3 до записи идемпотентных `score_events`.

Smoke Screen использует два versioned `PromptSpec`: генератор возвращает ровно нужную серверу
колоду `{missions:[{tier,text,detection_hint}]}`, recap — только `{recap}`. Если модель вернула
неполную или повторяющуюся колоду, сервер добирает уникальные локальные миссии. Public room state
содержит только run/progress/voter ids и финальный результат: тексты живут в player-private
`party_records`, затем исходники переходят в `sealed`, а для голосования создаются отдельные
`revealed` записи без owner metadata. Формула tier 5/10/15 и detective +2 полностью
детерминирована; стабильные idempotency keys делают восстановимыми частичную раздачу, reveal,
ballot retry, запись verdict и начисление ledger events.

Toast Syndicate использует отдельные assignment/judgment `PromptSpec` со строгими JSON Schema,
few-shots и environment `+5` rubric. Каталог жанров и слов локализован и выбирается без недавних
повторов; невалидный ответ AI заменяется детерминированным seeded fallback. Контрабанда живёт
только в player-private `party_records`, аудио и транскрипт — в host-only записи, catches — в
player-private неизменяемых бюллетенях. Public state раскрывает слова и короткий транскрипт только
после verdict. Поля очков модели игнорируются: сервер сопоставляет слова, атрибутирует каждую
поимку слушателю и записывает стабильные score events.

Still Life Survival использует отдельные headline/judgment `PromptSpec`: первый возвращает один
общий абсурдный сюжет, второй получает только подписанные сервером изображения и отвечает по
строгой схеме Sotheby's-критика. Фото и исходные записи доступны только ведущему; игрок видит
собственную готовность, публичные оценки и варианты голосования без своей команды. Поле `points`
модели игнорируется: сервер складывает bounded `composition 0–10 + drama 0–10 + materials 0–5`.
Зрительские бюллетени не меняют эти очки и решают только равенство jury score. Все записи и ledger
events используют стабильные непрозрачные idempotency keys, поэтому refresh/retry не создаёт
вторую работу, оценку, бюллетень или начисление.

Sommelier Charlatan использует vision `PromptSpec` с точной схемой
`drink_guess/tasting_notes/owner_profile/pretentiousness/pairing_advice`, двумя few-shots и
environment `+5` rubric для стекла, льда, света, меню и стойки. AI не получает имя владельца и не
определяет очки. Сервер хранит случайный непрозрачный `entryId`, owner mapping и storage path в
host-only records, принимает один immutable ballot от каждого не-владельца и публикует связь
только после reveal. Формулы `+3` угадавшему, `+5` нераскрытому владельцу и единственный `+3` за
реакцию вечера записываются как идемпотентные ledger events; безопасный локализованный fallback
сохраняет полный ритуал при недоступном vision API.

Contraband работает как независимый 30-минутный background run поверх любой foreground-игры.
Каждый участник после refresh получает только собственную player-private фразу; public room state
содержит лишь таймер, progress и идентификаторы активного обвинения — без фразы, цитаты,
транскрипта или storage path. Обвиняемый может признаться или записать 8–25 секунд контекста; AI
оценивает только органичность текста по шкале 1–10 и не используется как lie detector. Порог `7+`,
формулы `+10` контрабандисту, `+5` ловцу и `−2` за ложный вызов пересчитывает сервер и записывает
стабильными ledger events. При сбое STT/AI дело переходит ведущему без автоматического начисления,
а финал раскрывает все фразы и выдаёт джекпот тем, кто дожил до таймера.

Tongs of Truth также работает поверх foreground-игр: normal route проводит по одному двухминутному
ходу для каждого участника, compact route выбирает до пяти говорящих и сразу включает уровень 3.
Текущий говорящий сам открывает микрофон и получает signed upload target только в namespace
`room/tongsoftruth/round/player`. Audio path и полный transcript записываются в host-only
`tongs-testimony`; public state содержит только вопрос, таймер и короткий verdict. Prompt contract
строго различает фактическую правду и наблюдаемую конкретику: AI не умеет обнаруживать ложь.
Model `points` игнорируется, сервер пересчитывает bounded формулу и пишет один идемпотентный ledger
event. STT/AI fallback не получает очков автоматически — ведущий видит transcript, выставляет те же
четыре критерия вручную или даёт безопасный пас без штрафа.

Cross Examination запускается после bar-reveals для 6–30 гостей и выбирает три или четыре пары,
по возможности внутри одной команды. Ведущий сначала видит короткие callback-кандидаты из
реальных party records, исключает чувствительные эпизоды и может добавить собственный наблюдаемый
факт; AI получает только этот утверждённый пакет. Для каждой пары публикуются ровно четыре вопроса
категорий order/object/person/detail. Оба участника независимо записывают 20–60 секунд, а остальные
тайно прогнозируют категорию самого сильного расхождения. Полные transcripts и storage paths
никогда не попадают в public room state или player API. AI предлагает только короткие версии и
noir-текст: сервер сам фиксирует severity `0/1/2/3`, вычисляет алиби `10 − сумма`, добавляет ровно
`+5` лишь за общую непосказанную деталь среды, делит очки пары между подельниками и даёт `+2`
точному зрителю. При STT/AI fallback нет автоматического score: host сверяет показания вручную или
пропускает дело. После последней пары игра освобождает foreground slot, а finale продолжает работать
даже при полном отказе Cross благодаря score ledger и сохранённому командному пьедесталу.

По умолчанию используются:

- `gpt-4o-mini` для text/JSON и vision;
- `gpt-4o-mini-tts` для озвучки;
- `gpt-4o-mini-transcribe` для расшифровки.

Если нужен другой провайдер, укажи `OPENAI_BASE_URL` и модели через env.

## Event profile

Базовая настройка события лежит в `src/lib/event-profile.ts`: название, SEO-тексты, имя ведущего
по умолчанию, storage key prefix, персона ведущего и 5 speaker slots. Это простой code config без
dashboard; для нового события меняй его и проверяй `bun test && bun run build`.

## База данных

Все миграции лежат в `supabase/migrations/`. Применить к Supabase-проекту:

```bash
supabase link --project-ref <your-ref>
supabase db push
bun run verify:backend
```

`verify:backend` — read-only release gate. Он требует обе server-only таблицы, приватный bucket
`recordings` и AI credential; при любой недостающей зависимости возвращает exit code `1` и не
даёт `deploy:vercel` продолжить сборку. Миграция `20260716120000` идемпотентно восстанавливает или
снова приватизирует `recordings`, если историческая bucket-миграция уже записана, но storage
конфигурация позже drifted. Миграция `20260719120000` добавляет exact session identity для
`party_records`; её нужно применить до версии приложения, которая фильтрует private memory по
`session_started_at`.

Production deploy использует закреплённую devDependency `vercel@56.3.1`, поэтому
`bun run deploy:vercel` запускает локальный CLI из lockfile, а не непредсказуемый `vercel@latest`
из временного кэша.

Таблицы: публичные `rooms`, `submissions`, `votes`, `challenges`, `photos` и server-only
`party_records` для секретов/приватной памяти, а также append-only `score_events` для честного
счёта по играм, актам, командам и игрокам.
Bucket: `recordings` (private).

На текущем linked backend все миграции синхронизированы, `verify:backend` возвращает `READY`.
Ready-backend smoke с восемью изолированными игроками достиг зелёного quick start за 14.801 секунды,
сохранил первый cue `park-arrival-120` после **Start the party** и удалил тестовую комнату.
Проверенный production deployment `dpl_BFEJtCNWx6MGFFx4gAtyTQWtmzRA` обслуживает публичный alias.
Удалённая browser-матрица на `https://ai-game-hub-tau.vercel.app` прошла `park/120/8` (`KJ3H`,
10.219 с), `bar/180/8` (`N5WA`, 8.556 с), `home/240/8` (`4W3Y`, 8.488 с) и
`festival/180/30` (`JX8Y`, 49.093 с). Каждый сценарий скопировал приватную backup host-ссылку
через Live safety, открыл тот же host runtime в storage-isolated browser с очищенным fragment,
дождался всех игроков, сохранил первый route cue, скачал и разобрал privacy-safe schema-v2 field
report с `runKind=automated` и `hostHandoff=verified`, после чего удалил точную тестовую комнату.
Per-room runtime queue снизила максимальный CAS retry в production festival burst с 15 до 8;
30 уникальных join-запросов завершились за 5.822 секунды серверного времени при максимальном
ожидании очереди 5.582 секунды. Дополнительный production journey `WT8V` за 12.920 секунды достиг
readiness, прошёл шесть предфинальных route steps через Soundscape → Challenge → Photo Hunt →
Who Among Us, открыл отдельный finale act и вернул один и тот же Soundscape evidence id в финале
ведущего и игрока; комната удалена. Runtime guard безопасно отбросил два запоздавших AI write уже
после перехода в следующие игры. Production launch-coach matrix затем проверила `park/120/8`,
`bar/180/8`, `home/240/8`, `festival/180/30`: точный brief и **Tonight's thread** сохранились, coach
предложил одно QR-действие и открыл полноэкранный код; комнаты `7CEG`, `BF7K`, `LTH7`, `XH98`
удалены. Дополнительная production-комната `9B3K` после восьми изолированных join переключилась на
единственный start action, достигла readiness за 11.864 секунды, сохранила `park-arrival-120`,
выгрузила privacy-safe report и была удалена. Schema-v3 deployment
`dpl_F3UrHatZsYvwfBzHvznZPSUjmkju` дополнительно выгрузил production-report из `725Q`: только
bounded evidence автономности/callback safety, без исходного Tonight's thread; комната удалена.
Deployment `dpl_GdZarBcWP5T3vjovmsgNo5hgQCq4` добавил структурированную дату события и
18-пунктовый PASS-readiness coach. Production room `4RDQ` достигла readiness за 12.066 секунды,
доказала блокировку неполного PASS, выгрузила privacy-safe pending v3 report с датой и была
удалена. Deployment `dpl_pYvWNdny3WNMdVLQbn55qr3iVnoS` выводит на первом мобильном
экране отдельные действия **Host a party** и **Join a party**: ведущий сразу попадает к
двухминутной настройке, а гость с кодом не прокручивает всю host-форму. Local `MUVQ` и production
`59BL` проверили оба entry path, восемь join, persisted cue, report и cleanup; production readiness
составил 13.505 секунды. Deployment `dpl_6Re3EkJeZD1VCBo21SHgTtgv2iF3` ввёл единый
четырёхсимвольный room-code contract для генератора и обеих guest-форм: `I/O/0/1` блокируются,
вставленные пробелы и дефисы удаляются, Enter/Go отправляет только готовый код, а `/play`
автофокусирует поле. Local `ZQ8T` и production `2EAD` прошли validation, восемь join, cue, report и
cleanup; production readiness составил 13.747 секунды. Deployment
`dpl_GR6xb9fg7fESkubwbqvoucb7jnCt` различает неверный direct-link, отсутствующую комнату и
временный сетевой сбой: гость исправляет сохранённый код или нажимает **Check again** на том же
мобильном экране. Пятисимвольный ввод больше не проходит через молчаливое truncation. 390×844 QA
проверила invalid, not-live, offline и restored-network состояния; production `BRSM` прошёл
recovery regression, восемь join, persisted cue, report и cleanup за 15.604 секунды readiness.
Deployment `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm` закрепил единый лимит 30: новый 31-й игрок получает
отдельный full-room экран и HTTP 409, существующий игрок безопасно возвращается при 30/30, а ведущий
может убрать дубликат только до первого cue. Production `9Z54` подключил 30 изолированных игроков
группами по четыре, проверил оба overflow path, достиг readiness за 86.452 секунды, сохранил
`festival-rally-180`, выгрузил privacy-safe report и был удалён. Первый искусственный burst из 30
строго одновременных Playwright POST зафиксирован как Vercel Security Checkpoint, поэтому smoke
ограничивает automation четырьмя параллельными join. Deployment
`dpl_5CvFoV599PtuJJJywctxJu4dWmE5` добавляет private field-report draft для текущего quick-start
run. Local `ZQNS` и production `DCUT` дождались фактического autosave, восстановили одинаковые
наблюдения после refresh основного host и на storage-isolated backup-host, затем выгрузили
privacy-safe report и удалили комнаты. Draft хранится только в host-only `party_records`, не
попадает игрокам/realtime и сбрасывается для нового party. Production `DCUT` достиг readiness за
23.372 секунды. Новый grounded story thread переносит до трёх уже публичных reveals в следующие
party-mode AI prompts как bounded JSON-quoted untrusted data: без internal ids, transcripts, media,
private records и hidden assignments, с максимум одним естественным callback и без права менять
schema/rubric/safety. JSONB key reordering сохраняет party context, prewarm cache учитывает историю,
а подтверждённая host-команда сразу обновляет собственный экран ведущего. Local `UJ2K` и
production `ATDJ` перенесли один Soundscape evidence id в Challenge, Photo Hunt и Who Among Us
prompt context и затем в одинаковый host/player finale; обе комнаты удалены. Host room convergence
теперь опирается на серверный `rooms.updated_at`, а не на порядок прихода сети: REST/realtime не
могут понизить уже показанное состояние, host-команда
возвращает ревизию подтверждённой CAS-записи, и browser gate проверяет её на каждом возврате в hub.
Local `RFDW` и production `8GYE` прошли полный восьми-player connected journey за 11.615 / 21.927
секунды readiness, сохранили общий callback и были удалены. Полный pack — 496 тестов в 107 файлах.
Backend preflight остаётся `READY`; ближайший rollback —
`dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA`.
Это автоматизированный release gate, а не замена матрице физических телефонов.

После физических прогонов schema-v3 JSON-отчёты проверяются одной командой:

```bash
bun run verify:field-reports reports/*.json
```

Строгий gate требует четыре setting, покрытие 120/180/240 минут, минимум две разные календарные
даты событий, 8–30
участников и восемь готовых телефонов, launch до 120 секунд, согласованный score ledger, безопасные
privacy-флаги и явное отсутствие SQL/state repair и утечки секретов. Автоматический smoke не может
выдать себя за физический прогон. Дополнительно каждый прогон обязан подтвердить самостоятельное
следование launch coach и безопасный callback к Tonight's thread в игре и финале; среди ведущих
должен быть хотя бы один новичок. Host UI показывает один следующий незакрытый пункт из 18 и не
скачивает отчёт с outcome PASS до полного набора доказательств; pending/FAIL остаются доступны для
честной фиксации незавершённого прогона. По фактической стоимости в одной валюте verifier рекомендует
минимальный preset 60/120/240 с 20% запасом; `--json` отдаёт машинный результат. V2 остаётся только
историческим evidence и не закрывает текущий release gate.

Публичные результаты старых игр читаются без аккаунта для party-mode. `party_records` и
`score_events` полностью закрыты для `anon`/`authenticated` и доступны только через
авторизованные server endpoints. Начисление `score_events` и обновление публичного team total
происходят одной Postgres-транзакцией; повторный idempotency key не начисляет очки ещё раз.
Для постоянного публичного деплоя всё равно нужно продолжать ужесточать политики legacy-таблиц.

## Cleanup

`POST /api/cleanup` удаляет комнаты, не обновлявшиеся дольше retention window, связанные строки
`submissions`, `votes`, `challenges`, `photos`, private records, score events и storage objects из
bucket `recordings` по префиксу `roomId/`.

Запрос требует `Authorization: Bearer $CLEANUP_SECRET`. По умолчанию retention — 24 часа:

```bash
curl -X POST "$CLEANUP_URL/api/cleanup" \
  -H "Authorization: Bearer $CLEANUP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"retentionHours":24,"dryRun":true}'
```

### Локальный browser smoke

Smoke использует установленный Playwright Chromium либо системный Chrome/Chromium и требует
server-only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`: без возможности гарантированно удалить
комнату он не стартует. Конкретный бинарник можно задать через `BROWSER_SMOKE_CHROME_PATH`.

```bash
# terminal 1
bun run dev -- --host 127.0.0.1 --port 4321

# terminal 2
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser

# audit an intentionally incomplete backend: program ready, full release gate stays red
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:backend

# full UI matrix: four venues, all durations, 8 and 30 concurrent players
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:matrix

# live resilience: lobby + active game refresh, offline/resync, pause and late join
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:resilience

# additionally require a real provider result to survive the launch-time host refresh
BROWSER_SMOKE_ALLOW_MUTATION=YES BROWSER_SMOKE_EXPECT_AI=YES bun run smoke:browser:resilience

# media gate: deny → grant → retry, audio upload, video preview and photo upload
BROWSER_SMOKE_ALLOW_MUTATION=YES BROWSER_SMOKE_EXPECT_AI=YES bun run smoke:browser:media

# full story journey: every park route step, public callback and host + player finale
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:journey

# setup-only matrix: route summary, equipment brief and persistence on the host screen
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:brief
```

Одиночный сценарий можно настроить аргументами, например:

```bash
BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser \
  --venue=festival --duration=240 --players=30 --expected-players=30
```

Matrix запускает `park/120/8`, `bar/180/8`, `home/240/8` и `festival/180/30`. Она проверяет не
только зелёный статус, но и фактически сохранённые venue, обещанную/реальную длительность маршрута,
expected crowd и точное число игроков в host snapshot. Обычные browser smoke по умолчанию требуют
`backend=ready`; отдельный `smoke:browser:backend` требует `degraded` и доказывает, что собранная
программа не превращается в ложный общий зелёный статус и кнопка старта остаётся заблокированной.
При готовом backend smoke нажимает **Start the party**, ждёт сохранённый active cue и только после
этого продолжает маршрут.

`smoke:browser:brief` использует ту же representative matrix, но завершает сценарий сразу после
создания комнаты. Он доказывает, что выбранные setting, duration и crowd пересчитали понятный
host brief на landing, а тот же точный route summary и уникальный публичный **Tonight's thread**
сохранились после перехода к QR. Каждая созданная комната также удаляется по точному `roomId`.

Resilience-сценарий после восьми одновременных входов проверяет host refresh с сохранённой
авторизацией, player refresh с тем же id, смену команды без потери identity, принудительные
`offline → live` для ведущего и игрока, поздний девятый join и его последующий refresh. Затем он
отдельно запускает и завершает первый interlude маршрута, запускает реальную foreground-игру,
подтверждает одинаковый
active game у host/player, выполняет pause → host refresh → resume, повторяет network recovery уже
внутри раунда, подключает десятого игрока во время игры и проверяет, что возврат в hub открывает
следующий route step, а не повторяет завершённый. Темы Soundscape сохраняются на сервере до ответа
клиенту: refresh во время provider-вызова повторно использует результат той же operation id вместо
замены готового AI-ответа fallback-набором.

Media-сценарий включает всю resilience-проверку, затем на одном и том же player identity запрещает
микрофон Soundscape, проверяет понятную ошибку и retry, выдаёт разрешение, записывает fake-device
audio blob и загружает его через настоящий media flow. После перехода в Challenge он на случайном
операторе так же проверяет запрет камеры+микрофона, grant+retry и открытие video preview, после чего
запускает Photo Hunt, подаёт кадр через native capture input, проверяет canvas-downscale, JPEG
upload/artifact и продвигает маршрут дальше. In-flight guards не дают дублированным AI-ответам
Challenge/Photo Hunt воскресить устаревшую фазу после Start или выхода в hub. Это программный
preflight: он не заменяет iOS Safari, Android Chrome, background/resume и Wi-Fi ↔ mobile на
физических телефонах.

Journey-сценарий проходит весь двухчасовой park run-of-show через обычные UI-действия: завершает
оба interlude, запускает и покидает четыре foreground-игры, фиксирует выбранную Soundscape-тему как
public evidence, проверяет callback на следующем переходе, открывает отдельный finale act и
завершает даже story-first вечер без очков. Финал считается связанным только если тот же evidence id
виден у ведущего и игрока. Guarded writes не дают поздним AI-ответам Challenge/Photo Hunt вернуть
уже покинутую игру; такой skip является успешным no-op и отдельно виден в structured runtime logs.

По умолчанию разрешён только `http://127.0.0.1:4321`. Для осознанного запуска против удалённого
стенда дополнительно нужны `BROWSER_SMOKE_BASE_URL=https://…` и
`BROWSER_SMOKE_ALLOW_REMOTE=YES`. Путь к нестандартному браузеру задаётся через
`BROWSER_SMOKE_CHROME_PATH`. Каждая комната удаляется по точному `roomId` в `finally`, включая
сценарий падения проверки; это не заменяет матрицу физических iOS/Android-устройств.

## Структура

```text
src/
  routes/
    index.tsx              # лендинг + создание комнаты
    host.$code.tsx         # экран ведущего
    play.$code.tsx         # экран игрока
    speaker.$code.tsx      # экран колонки
    api/
      speak.ts             # TTS endpoint
      transcribe.ts        # STT endpoint
      oracle-reading.ts    # player vision / host fallback boundary
      oracle-lifecycle.ts  # seal / reveal / verification / deterministic score
      smokescreen.ts       # background deal / seal / anonymous reveal / ballot / result
      toastsyndicate.ts    # private cargo / signed audio / STT / catches / deterministic result
      stilllife.ts         # team photo / host gallery / vision or manual jury / tiebreak vote
      sommelier.ts         # anonymous drinks / private owner mapping / guesses / reveal bonus
      contraband.ts        # secret phrases / accusation / audio arbitration / timer result
      tongsoftruth.ts      # background questions / signed audio / STT / manual-safe verdict
  games/
    soundscape/
    challenge/
    phototunt/
    grilloracle/
    smokescreen/
    toastsyndicate/
    stilllife/
    sommelier/
    contraband/
    tongsoftruth/
  lib/
    room.ts
    types.ts
    ai-gateway.server.ts
    ai/
  integrations/supabase/
  components/ui/
```

## Развёртывание

Проект собирается под **Vercel** через TanStack Start + Nitro:

```bash
bun run verify:prod-env
bun run build
npx vercel deploy --prebuilt --prod
```

Самый простой путь: [vercel.com/new](https://vercel.com/new) → Import GitHub repo `lamapony/ai-game-hub` → Framework Preset: **TanStack Start** → добавь env vars из `.env.example` → Deploy.

В GitHub Actions есть:

- `CI` — lint, typecheck, build на push/PR;
- `Deploy Vercel` — ручной deploy через `VERCEL_TOKEN` (опционально; проще через Vercel Dashboard);
- `Cleanup old rooms` — scheduled/manual cleanup старых комнат и uploads.

## Документы

- `docs/production-readiness-plan.md` — стабилизация, тестирование и подготовка к продакшену.
- `docs/host-live-runbook.md` — одностраничный сценарий ведущего и аварийный порядок действий.
- `docs/live-field-test-log.md` — матрица физических устройств и шаблон двух полевых вечеров.
- `docs/development-roadmap.md` — долгосрочные продуктовые и технические цели.

## Лицензия

Приватный проект вечеринки. Делай что хочешь.
