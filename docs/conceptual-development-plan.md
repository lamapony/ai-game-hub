# Концептуальный план развития AI Game Hub

Дата: 2026-07-15
Статус: основной план реализации Grill + Bar Party Upgrade
Рабочее название опыта: **«Дым и неон» — акт I: Огонь, акт II: Алиби**

Этот документ переводит `docs/grill-bar-party-upgrade.md` с модели старого standalone HTML на
реальную архитектуру TanStack Start + Supabase. Для Grill + Bar scope он заменяет порядок работ
из `docs/composer-grill-bar-tasks.md` и `docs/composer-prompt-for-grill-bar.md`. Сами старые
документы и существующие игры сохраняются.

## 1. Executive decision

Приложению не нужно просто добавить восемь карточек и восемь новых веток `if`. Нужны два слоя:

1. **Party Engine** — комнаты, участники, команды, игровые запуски, фазы, секреты, очки,
   realtime, медиа, AI gateway и восстановление после ошибок.
2. **Experience Pack** — конкретный сценарий вечера: локации, акты, язык, персона ведущего,
   рекомендуемый порядок игр, визуальная тема, prompt context и аварийные варианты.

`DIMAS fest / classic park` остаётся существующим experience pack без изменения поведения.
`Smoke & Neon / Nørrebro` остаётся специальным Grill → Bar pack. Быстрый запуск добавляет четыре
универсальных pack: Park Expedition, Last Call Bureau, Household Evidence и Field Signal. Никакие
названия локаций, время или русские тексты не должны навсегда зашиваться в общий движок.

Главные архитектурные решения:

- Фаза вечера хранится на сервере в состоянии комнаты, а не в `localStorage` одного host-а.
- `classic`, `grill`, `bar` перестают быть одним неоднозначным enum: classic — опыт, grill/bar —
  акты, bar-only/compact — contingency plan.
- Несколько игр могут жить одновременно: одна foreground-игра и фоновые активности вроде
  «Дымовой Завесы» или «Контрабанды».
- Секретные миссии, запечатанные пророчества и приватные транскрипты не попадают в публичный
  realtime JSON комнаты.
- Очки добавляются через идемпотентный журнал событий; `teams[].score` временно остаётся
  совместимым materialized total.
- Новые игры работают через server-authoritative commands. Полный `RoomState` с клиента для них
  не принимается.
- AI пишет контент и комментарии, но сервер валидирует JSON и детерминированно считает очки.
- «Щипцы Правды» не заявляют распознавание лжи: AI оценивает конкретность, уклончивость и
  артистизм ответа, а «детектор» остаётся театральной ролью.
- На главном экране показывается не сетка из 15 игр, а план вечера и одна рекомендуемая следующая
  активность. Полная библиотека остаётся доступна ниже.

## 2. Что есть сейчас

Аудит проведён по состоянию репозитория на 2026-07-14.

| Область             | Реальное состояние                                                                                 | Вывод                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Игры                | 7 игр: Soundscape, Challenge, Photo Hunt, Track Guess, Spectrum Court, Who Among Us, Impostor      | Старые документы с числами 4 и 6 устарели                                 |
| Контекст            | `Venue = "park"                                                                                    | "bar"`; prompt context используют только Challenge, Photo Hunt и Impostor | Это переключатель локации, а не полноценная модель вечера |
| Room state          | Один публично читаемый JSONB с отдельным optional-полем на каждую игру                             | Секреты хранить нельзя; добавление восьми игр раздует тип и reset-логику  |
| Host UI             | `HostInner` вручную запускает и рендерит каждую игру; `Lobby` вручную рисует карточки              | Нужен registry и orchestration layer                                      |
| Player UI           | Такой же ручной conditional router                                                                 | Каждая новая игра требует синхронных правок в нескольких местах           |
| Конкурентные writes | Host отправляет полный snapshot; сервер вручную сливает player data по каждой игре                 | Стоимость поддержки растёт с каждой новой механикой                       |
| Очки                | Только итоговый `Team.score`                                                                       | Нельзя честно получить очки по фазам, личные титулы и audit trail         |
| AI                  | Общий gateway есть, но schema validation и prompts распределены по файлам                          | Нужен типизированный prompt contract и единый context builder             |
| Артефакты           | Старые `submissions`, `votes`, `photos`, `challenges` читаются публично; media выдаётся signed URL | Подходит для публичных результатов, не подходит для тайных назначений     |
| Язык                | Текущий UI переведён на английский; creative spec написан по-русски                                | Язык должен стать настройкой experience, а не новым глобальным хардкодом  |
| Качество            | lint, TypeScript и 129 unit tests проходят                                                         | Начальная точка стабильна; foundation можно делать аддитивно              |

Самый дорогой текущий паттерн: новая игра требует изменений в `GameId`, `RoomState`,
`basePlayingState`, host launch/render/restart, player render, player actions, host merge, skip/reset,
rules и тестах. Этот паттерн нельзя умножать ещё на восемь.

## 3. Продуктовая модель

### 3.1 Северная звезда

Люди должны вспоминать не интерфейс и не «как AI что-то сгенерировал», а дым, щипцы, странный
тост, подозрительную фразу и финальное вскрытие алиби. Телефон — контроллер и личный конверт, host
screen — сцена, AI — конферансье. Реальная среда остаётся главным действующим лицом.

### 3.2 Три режима использования

- **Classic free play** — нынешний hub: host вручную выбирает любую существующую игру.
- **Curated run of show** — «Дым и неон»: приложение предлагает следующий момент вечера,
  поддерживает переходы и фоновые игры.
- **Contingency run** — bar-only или compact: тот же pack, но с другим маршрутом и реквизитом.

### 3.3 Экранный бюджет

- Объяснение новой игры — один экран и не больше 30 секунд.
- После получения тайного задания игрок должен убрать телефон.
- В foreground-раунде одновременно активен один понятный CTA.
- Между играми host видит `Next recommended`, а не обязан помнить расписание.
- Любой AI wait длиннее 2 секунд показывает шоу-ориентированный progress и предлагает fallback.

### 3.4 Рекомендуемая программа, а не обязательные 15 игр

Core route для первого живого запуска:

1. «Дымовая Завеса» — раздать миссии на гриле.
2. «Щипцы Правды» — фоновая механика во время готовки.
3. «Гриль-Оракул» — создать запечатанные пророчества.
4. Переход «Показания опечатаны».
5. «Сомелье-Шарлатан» или «Синдикат Тостов» — один основной bar game.
6. Reveal миссий и пророчеств.
7. «Перекрёстный Допрос» — финал, только если группа ещё хочет активную игру.
8. Титулы и recap.

Still Life, Contraband и остальные classic games остаются в optional library. Так сохраняется всё,
но host не получает паралич выбора.

## 4. Целевая предметная модель

### 4.1 Развести опыт, акт, локацию и аварийный сценарий

Ориентир типов:

```ts
type ExperienceId =
  | "classic-park"
  | "smoke-neon-norrebro"
  | "park-story"
  | "bar-night"
  | "house-party"
  | "festival-field";
type PartyActId = "classic" | "grill" | "transition" | "bar" | "finale";
type VenueKind = "park" | "grill-site" | "bar" | "home" | "festival";
type ContingencyPlan = "normal" | "bar-only" | "compact" | "extended";

type PartyContext = {
  experienceId: ExperienceId;
  actId: PartyActId;
  venue: VenueKind;
  contingency: ContingencyPlan;
  uiLocale: "en" | "ru";
  contentLocale: "en" | "ru";
  actStartedAt?: number;
};
```

`eventProfile` остаётся deployment default/branding. Runtime-выбор конкретного вечера хранится в
`RoomState`, иначе две комнаты не смогут одновременно играть разные experiences.

### 4.2 Experience pack

`src/experiences/` должен содержать только декларативные данные:

- id, название, локали и persona;
- акты и допустимые переходы;
- environment context для AI;
- визуальные tokens;
- recommended playlist и optional games;
- тексты переходов и титулов;
- варианты normal/bar-only/compact;
- локализованные fallback messages.

Pack не импортирует React views и не пишет в Supabase.

### 4.3 Game definition и registry

Нужен один каталог метаданных и отдельный client view registry:

```ts
type GameDefinition = {
  id: GameId;
  title: LocalizedText;
  supportedActs: PartyActId[];
  format: "foreground" | "background" | "cross-act";
  durationMinutes: number;
  minPlayers: number;
  minActiveTeams?: number;
  capabilities: ("camera" | "microphone" | "vision" | "stt" | "speakers")[];
  availability(context: PartyContext, room: RoomSummary): Availability;
};
```

`Availability` различает:

- `recommended` — игра соответствует текущему акту;
- `available` — не в тему, но запускается: карточка dimmed, не disabled;
- `blocked` — объективно не хватает игроков, команд или capability.

Host/Player lazy components держатся в client-only registry. Server reducers, action schemas и
launch policy — в server registry. Так metadata не тянет React в server bundle.

### 4.4 Foreground и background runs

Один `currentGame` не выражает нужный вечер. Целевая runtime-модель:

```ts
type PartyRuntime = {
  foregroundRun?: PublicGameRun;
  backgroundRuns: PublicGameRunSummary[];
};
```

«Дымовая Завеса» может оставаться background run, пока foreground переключается на Oracle,
classic game или bar reveal. Возврат в hub завершает только foreground run, а не стирает память
вечера.

### 4.5 Версионирование состояния

В `RoomState` добавляется `schemaVersion`. Любое чтение с сервера проходит через Zod parse и
`migrateRoomState`.

Правила совместимости:

- Комната без `schemaVersion` считается V1.
- V1 с `venue: "bar"` получает bar context; остальные получают classic-park defaults.
- Старые optional game states работают через adapter, пока каждая игра не мигрирована.
- `currentGame` и `teams[].score` не удаляются в foundation PR.
- Неизвестные поля не теряются при миграции.
- Rollback не требует отката базы: новые таблицы и поля только additive.

## 5. Хранение данных и приватность

### 5.1 Что остаётся в публичном room state

- текущий акт и публичная тема;
- команды, игроки и materialized totals;
- foreground public state;
- summaries фоновых активностей без тайного payload;
- таймеры, публичные результаты, reveal status;
- ссылки только в той форме, которая уже разрешена существующей media policy.

Размер публичного state должен оставаться меньше 100 KB в обычном вечере. В нём нельзя хранить
base64, полные транскрипты, prompt bodies и секретные назначения.

### 5.2 Новая приватная party memory

Нужна server-only таблица `party_records`:

- `room_id`, `run_id`, `game_id`, `act_id`;
- `owner_player_id` или `owner_team_id`;
- `kind` (`mission`, `prophecy`, `contraband_phrase`, `testimony`, ...);
- `visibility` (`player`, `host`, `sealed`, `revealed`);
- `payload jsonb`, `created_at`, `revealed_at`;
- idempotency key/unique constraint.

У таблицы нет public `SELECT`. Host и player получают отфильтрованные записи только через
server endpoints после проверки host secret или player secret. Cleanup удаляет записи каскадно с
комнатой.

Это обязательный foundation для Smoke Screen, Contraband, Oracle seal и Cross Examination.

### 5.3 Журнал очков

Нужна таблица `score_events` с server-only writes:

- `idempotency_key` — уникален и не даёт повторно начислить очки после reconnect/effect replay;
- `room_id`, `run_id`, `game_id`, `act_id`;
- `team_id`, optional `player_id`;
- `points`, `reason`, `source` (`vote`, `deterministic`, `ai-bonus`, `host-adjustment`);
- rubric breakdown и timestamp.

`teams[].score` остаётся суммой для старого UI. Phase totals и личные титулы считаются из ledger.
Legacy score при миграции маркируется как `classic/legacy`, потому что его нельзя честно
распределить по прежним раундам.

### 5.4 Личные и командные награды

Каждый score event всегда имеет `team_id`; `player_id` указывается, когда действие принадлежит
конкретному игроку. Поэтому:

- основной leaderboard остаётся командным;
- «Королева Гриля» и «Легенда Бара» выбираются среди игроков по персонально заработанным events;
- «MVP Вечера» — персональный total;
- если персональных events ещё нет, UI честно показывает командного чемпиона, а не придумывает
  индивидуального победителя из командных очков.

Тексты и гендер титулов задаются experience pack, а не scoring engine.

## 6. Server-authoritative actions

### 6.1 Почему нельзя продолжать full-state writes

Сейчас host отправляет целиком snapshot комнаты, а сервер вручную сохраняет свежие player votes
для каждой игры. Для восьми новых игр, фоновых runs и секретов это станет главным источником
потерь данных.

### 6.2 Целевой command flow

```text
Host/Player UI
  -> typed command + commandId
  -> server auth
  -> validate room/run/phase
  -> game reducer
  -> transaction/optimistic retry
  -> append score/party records
  -> update public projection
  -> Supabase realtime
```

Новые игры с первого дня используют `HostCommand` / `PlayerCommand`. Старые игры временно
работают через существующий adapter. После миграции последней игры full snapshot endpoint можно
закрыть.

Каждая command schema валидируется Zod-ом. Reducer не доверяет присланным `teamId`, score, owner,
таймеру или game phase; они выводятся из авторизованной комнаты.

## 7. AI contract

### 7.1 Единый PromptSpec

Для каждой AI-операции создаётся versioned contract:

```ts
type PromptSpec<T> = {
  id: string;
  version: number;
  outputSchema: z.ZodType<T>;
  buildSystem(context: PartyContext): string;
  buildUser(input: unknown): string | ContentPart[];
  fallback(input: unknown): T;
};
```

System prompt собирается в одном порядке:

1. persona и safety boundary;
2. UI/content language;
3. environment context текущего акта;
4. game instructions;
5. scoring rubric;
6. strict JSON schema;
7. few-shots из мастер-спеки.

Context берётся из server room state. Клиент не может подменить фазу или prompt persona.

### 7.2 Валидация и scoring

- Ответ AI проходит JSON parse, Zod validation, normalization и clamp.
- Если provider поддерживает `json_schema`, используем его; `json_object` остаётся fallback для
  совместимых gateways.
- Поле `points`, пришедшее от AI, не записывается напрямую в score.
- Сервер пересчитывает итог по валидированным sub-scores и фиксированной формуле.
- `+5 за использование среды` присутствует во всех creative judgments и виден в breakdown.
- Победителя определяют голоса людей или прозрачная формула. AI-бонус ограничен и не может
  единолично перевернуть очевидный результат.
- Любая AI-операция имеет локальный fallback, timeout, retry policy и понятный host override.

### 7.3 Наблюдаемость

Логируем без контента и PII:

- prompt id/version, game/run/act;
- model, duration, retry count, fallback flag;
- token usage/cost, если provider вернул usage;
- validation/parse failure category;
- размер изображения/аудио, но не URL и не transcript.

## 8. Host и player experience

### 8.1 Host conductor

Вместо длинного lobby должен появиться conductor dashboard:

- верхняя строка: experience, текущий акт, contingency, elapsed time;
- `Next recommended` с одной большой кнопкой;
- timeline вечера и безопасный переход к следующему акту;
- tray активных background games;
- scoreboard с total и мини-тегами 🔥 / 🍸;
- optional game library ниже;
- быстрые controls: pause, skip, fallback, reveal, back to hub;
- невозможность случайно перейти к bar reveal, пока запись Oracle не запечатана — с явным
  confirm/override для host.

### 8.2 Player shell

- всегда показывает текущий акт и команду;
- отдельная зона `Your secret` доступна только владельцу;
- foreground CTA и background reminder не конкурируют;
- sealed content действительно скрывается после запечатывания;
- после refresh игрок восстанавливает свои назначения по player secret;
- bar reveal меняет приватную карточку на публичный результат без новой ссылки/QR.

### 8.3 Переход

Transition — полноценный act, не CSS-анимация:

- host запускает «Опечатать пророчества»;
- сервер проверяет и запечатывает records;
- player screens показывают печать и затем скрывают текст;
- host screen произносит «Показания опечатаны»;
- background missions продолжаются;
- bar act открывает verify/reveal actions.

## 9. Порядок реализации

### Release 0 — Зафиксировать baseline (0.5–1 agent-day)

- Сохранить текущие 129 unit tests зелёными.
- Добавить room-state fixtures для старой park-комнаты, bar-комнаты и каждой активной игры.
- Зафиксировать browser smoke: создать комнату, подключить игрока, запустить одну игру, refresh,
  вернуться в hub.
- Снять размеры публичного state и latency основных действий.

**Gate:** foundation PR не меняет существующее поведение и проходит lint/test/typecheck/build.

### Release 1 — Party foundation (4–6 agent-days)

1. Ввести `PartyContext`, experience pack и state schema version.
2. Написать V1 -> V2 migration и compatibility tests.
3. Добавить metadata registry для семи существующих игр без изменения views.
4. Перевести host/player render на registry adapters; удалить ручной список launch props из Lobby.
5. Добавить foreground/background runtime model.
6. Создать command infrastructure и перевести phase transition на server command.
7. Создать `party_records` и auth-filtered read/write endpoints.
8. Создать `score_events`, idempotent award service и materialized totals.
9. Добавить cleanup и privacy tests для новых таблиц.

**Gate:** classic experience визуально и функционально не изменился; старые комнаты открываются;
секретный payload не появляется ни в public room state, ни в public Supabase select.

### Release 2 — Phase UX и адаптация существующих игр (2–4 agent-days)

1. Добавить Smoke & Neon pack с normal/bar-only/compact routes.
2. Сделать host act switcher/timeline и phase-aware theme tokens.
3. Добавить `recommended / available / blocked` к game cards.
4. Собрать единый phase context builder для AI.
5. Адаптировать Challenge, Photo Hunt и Impostor prompts через общий contract.
6. Добавить contextual catalogs/copy для Soundscape, Track Guess, Spectrum Court и Who Among.
7. Сохранить classic outputs без добавочного phase context.

**Gate:** все семь игр запускаются в classic; минимум три AI-игры получают grill/bar context;
bar-only route можно выбрать до начала вечеринки.

### Release 3 — Signature vertical slice: Grill Oracle (3–4 agent-days)

Oracle реализуется первым, потому что одним срезом проверяет vision, player ownership, private
party memory, seal transition, cross-act resume, score ledger и finale awards.

- Grill capture и server-authorized upload.
- Versioned prompt + exact schema/few-shots из section 3.1.
- Пророчество записывается как sealed `party_record`.
- Ровно три проверяемых prediction; server validation отклоняет другое количество.
- Transition seal и bar verification.
- Очки начисляются idempotently по подтверждённым пунктам.
- Полный fallback без vision: host выбирает предмет/степень прожарки, приложение берёт локальный
  prophecy template.

**Gate:** Oracle переживает refresh, переход между актами и повторную доставку команды без
дублирования очков.

### Release 4 — Background social layer (4–6 agent-days)

#### Smoke Screen

- Приватная раздача миссий с tier и detection hint.
- Background run не блокирует другие игры.
- Host видит только progress count, не содержание.
- Bar reveal: список миссий, голосование, deterministic scoring, AI recap.

#### Contraband

- Приватные фразы, общий таймер и accusation flow.
- False accusation penalty считается сервером.
- Audio arbitration — только спорный tie-break; host может решить вручную.
- Контекст и тайная фраза не попадают в публичный state до reveal.

**Gate:** игрок после refresh видит только своё задание; host может завершить foreground game,
не потеряв background runs.

### Release 5 — Reusable media games (5–8 agent-days)

Порядок по переиспользованию существующих pipelines:

1. **Toast Syndicate** — STT, жанр, три слова, audience catches, deterministic score.
2. **Still Life Survival** — Photo Hunt capture/resize/upload + team vision judgment.
3. **Sommelier Charlatan** — private owner mapping, анонимный reveal и human guessing.
4. **Tongs of Truth** — recorder + theatrical judgment конкретности/уклончивости.

Общие компоненты выносятся только после второго реального reuse:

- `AudioCaptureCard`;
- `PhotoCaptureCard`;
- `SecretAssignmentCard`;
- `TimedSubmissionShell`;
- `AudienceVotePanel`;
- `AiFallbackNotice`.

**Gate:** ни один новый компонент не копирует существующий media upload/auth flow; у каждой игры
есть non-AI fallback и один экран правил.

### Release 6 — Finale: Cross Examination и титулы (3–5 agent-days)

- Pair selection и отдельные приватные recording sessions.
- Вопросы про реальные party records/act recap, а не выдуманную память AI.
- Транскрипты private by default; публично показываются только короткие версии/contradictions.
- Зал предсказывает категорию расхождения до reveal.
- AI даёт noir commentary; severity и очки считаются по фиксированным правилам.
- Finale строится из score ledger: grill, bar, total, personal highlights и team podium.
- Host может исключить чувствительный эпизод из recap до показа.

**Gate:** finale работает и без Cross Examination; отсутствие AI не блокирует титулы.

### Release 7 — Live hardening (3–5 agent-days + 2 field tests)

- 8–12 реальных телефонов, iOS Safari и Android Chrome.
- Переключение Wi-Fi/mobile data, background/resume, reconnect.
- Camera/mic permissions, длинные имена, late join, смена команды.
- AI off, vision invalid JSON, STT timeout, Supabase transient failure.
- Проверка signed URLs и cleanup private records/media.
- Cost budget и pre-generation: задания для следующего act готовятся заранее.
- Host runbook на одну страницу и emergency manual mode.

**Gate:** два полных вечера без ручного SQL/редактирования state и без потери score/secret data.

## 10. Очередность новых игр

| Приоритет | Игра              | Зачем сейчас                           | Главный риск                              |
| --------- | ----------------- | -------------------------------------- | ----------------------------------------- |
| 1         | Grill Oracle      | Проверяет всю cross-act архитектуру    | sealed state и повторное начисление       |
| 2         | Smoke Screen      | Делает среду и людей главным контентом | приватные назначения                      |
| 3         | Toast Syndicate   | Быстро использует готовый STT pipeline | темп и качество транскрипта               |
| 4         | Still Life        | Переиспользует Photo Hunt/vision       | subjective AI score                       |
| 5         | Sommelier         | Сильный bar reveal                     | анонимность владельца                     |
| 6         | Contraband        | Сильная фоновая механика               | спорные обвинения и privacy               |
| 7         | Tongs of Truth    | Естественно встроена в готовку         | нельзя обещать lie detection              |
| 8         | Cross Examination | Сильный финал и callbacks              | сложный UX, аудио и чувствительные данные |

## 11. Atomic PR sequence

Каждый пункт — отдельный PR/commit scope с зелёными gates:

1. `party-context-and-state-version`
2. `experience-pack-smoke-neon`
3. `game-registry-legacy-adapter`
4. `server-command-foundation`
5. `private-party-records`
6. `score-event-ledger`
7. `host-conductor-and-act-switcher`
8. `prompt-contract-and-existing-game-context`
9. `grill-oracle-capture`
10. `grill-oracle-seal-and-verify`
11. `smoke-screen-background-run`
12. `toast-syndicate`
13. `still-life-survival`
14. `sommelier-charlatan`
15. `contraband`
16. `tongs-of-truth`
17. `cross-examination-and-finale`
18. `live-hardening-and-runbook`

Нельзя объединять foundation и первую игру в один гигантский PR: иначе невозможно отличить
ошибку модели состояния от ошибки конкретной механики.

## 12. Definition of Done для каждой игры

- Игра зарегистрирована декларативно, без новой ветки в host/player top-level router.
- Указаны supported acts, format, duration, min players/teams и capabilities.
- Host и Player views lazy-loaded.
- Все commands имеют Zod schema, auth, phase guard и idempotency.
- Secret data отсутствует в public state/realtime/logs.
- Scoring вынесен в pure function и покрыт unit tests.
- AI output валидируется; формула score не доверяет AI `points`.
- Есть prompt version, exact schema, few-shots и environment `+5` rubric.
- Есть deterministic/local fallback и host override.
- Refresh/reconnect не ломает run и не дублирует score.
- Ошибки camera/mic/upload/AI показаны человеческим текстом.
- Правила помещаются на один player screen.
- Пройдены lint, test, typecheck, build и ручной smoke host + 2 players.
- Classic experience и семь существующих игр не регрессировали.

## 13. Метрики и целевые ограничения

Продуктовые:

- room creation -> первый раунд: p50 < 2 минут;
- объяснение игры: < 30 секунд;
- пауза между foreground games: p50 < 90 секунд;
- не менее 70% активного времени игрок смотрит на людей/среду, не в телефон;
- host override используется менее чем в 10% раундов после стабилизации;
- минимум три запомнившихся callback/reveal момента за вечер.

Технические:

- non-AI command p95 < 700 ms;
- AI text p95 < 12 s, vision p95 < 20 s; после timeout — немедленный fallback;
- duplicate score events: 0;
- lost player actions при optimistic retry: 0 в тестовом прогоне;
- public room state < 100 KB;
- secret payload exposure в public APIs/logs: 0;
- AI cost и storage per room видны в operational summary.

## 14. Риски и защиты

| Риск                                      | Защита                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Scope из 8 игр съест качество             | Выпускать вертикальными срезами; после Oracle провести live test до следующей волны |
| Сетка из 15 игр перегрузит host           | Curated playlist + `Next recommended`; библиотека вторична                          |
| Full-state writes потеряют player data    | Новые игры только через server commands и idempotency                               |
| Секреты утекут через realtime             | Server-only `party_records`, filtered endpoints, privacy tests                      |
| AI спорно определит победителя            | Human vote/deterministic formula; AI bonus capped и прозрачен                       |
| «Детектор лжи» создаст ложное доверие     | Явно театральная формулировка; оценивается конкретность ответа                      |
| Русская спека конфликтует с английским UI | Раздельные `uiLocale` и `contentLocale` в experience pack                           |
| Плохая погода уничтожит программу         | Contingency route bar-only, выбранный до старта или host override                   |
| Аудио/vision затормозят вечер             | Pre-generation, короткие media limits, timeout/fallback, manual verdict             |
| История вечера раздует room JSON          | Public projection + private records; media только в Storage                         |

## 15. Что сознательно не делаем сейчас

- Marketplace и загрузку сторонних game plugins.
- Аккаунты, платежи и multi-tenant admin.
- Универсальный drag-and-drop редактор сценария.
- Переписывание всех семи игр на новую state-модель одним PR.
- AI image generation как основную механику.
- Автоматическую «умную» модерацию без host override.
- Несколько foreground games одновременно.

## 16. Первый практический шаг

Основной агент берёт Release 1: state model, migration, registry, commands, private records и score
ledger. Hermes получает изолированную подготовку fallback-каталога для Toast Syndicate из
`docs/hermes-toast-catalog-task.md`: это полезно для Release 5, но не даёт ему менять архитектуру.

## 17. Статус реализации

Обновлено: 2026-07-15.

Завершены первые семнадцать атомарных срезов:

1. `party-context-and-state-version` — V2 state, миграция старых park/bar комнат и compatibility
   tests.
2. `experience-pack-smoke-neon` — декларативные classic и Smoke & Neon packs, normal/bar-only/
   compact routes и conductor selectors.
3. `game-registry-legacy-adapter` — metadata registry и lazy host/player view adapters для семи
   существующих игр.
4. `server-command-foundation` — выбор experience и акта переведён на типизированный
   server-authoritative command endpoint с host auth, Zod validation, optimistic retry и bounded
   idempotency receipts. Запуск всех зарегистрированных игр теперь также идёт этой командой и
   вычисляет round id/randomness на сервере; внутренние phase mutations старых игр пока сохраняют
   compatibility full-state path.
5. `private-party-records` — добавлена server-only таблица вне Realtime, idempotent create,
   seal/reveal lifecycle, отфильтрованные host/player endpoints и cleanup/privacy tests. Host не
   видит player/sealed payload, игрок не видит чужие секреты, sealed payload скрыт от владельца.
6. `score-event-ledger` — добавлен закрытый append-only ledger и транзакционный award RPC. Он
   блокирует room row, фиксирует legacy drift как `classic/legacy`, дедуплицирует batch по
   idempotency key и в той же транзакции обновляет materialized `teams[].score`. Host endpoint
   отдаёт audit list и finale-ready totals по актам, источникам, командам и игрокам.
7. `host-conductor-and-act-switcher` — Smoke & Neon lobby превращён в phase-themed dashboard над
   setup-блоками: experience/contingency, elapsed act time, act timeline, route duration, безопасный
   переход вперёд, одна запускаемая `Next recommended` и полный run of show. Legacy registry теперь
   декларативно хранит duration/capabilities/supported acts и различает `recommended`, `available`
   и объективно `blocked`; classic lobby остаётся на прежней ветке.
8. `prompt-contract-and-existing-game-context` — Challenge, Photo Hunt и Impostor переведены на
   versioned `PromptSpec` с Zod + provider JSON Schema, few-shots, persona/safety/language envelope
   и `+5 environment` rubric. Контекст experience/act берётся только после host-auth из Supabase,
   active-game guard не даёт вызвать чужой flow. Classic сохраняет старый park/bar prompt path и
   fallback-каталоги. В party-mode Challenge считает итог из bounded breakdown, Photo Hunt сам
   сортирует criteria и игнорирует AI ranks/points; prompt library и server runtime исключены из
   browser bundle. OpenAI-compatible providers без `json_schema` автоматически используют
   `json_object`, после чего ответ всё равно проходит Zod или deterministic fallback.
9. `grill-oracle-capture` — `grilloracle` переведён из planned route step в восьмую декларативно
   зарегистрированную foreground-игру с lazy host/player views. Server command запускает раунд по
   последнему room snapshot и фиксирует участников; игрок получает signed upload target только для
   собственного `room/oracle/round/player` namespace. Новый versioned vision prompt сохраняет точную
   JSON-схему ТЗ, Zod требует ровно три предсказания, current environment берётся из server state.
   Результат пишется идемпотентно как player-private `oracle-prophecy`: refresh возвращает владельцу
   ту же запись без второго AI-вызова, host API/UI получает только факт готовности и никогда payload.
   AI `points` остаётся narrative intensity и не начисляется. При vision failure ведущий выбирает
   тип предмета и степень прожарки, после чего сервер создаёт такой же приватный трёхпунктовый local
   fallback. Public room state хранит только participant/submitted ids; optimistic merge не даёт
   stale host screen снова открыть завершённый capture.
10. `grill-oracle-seal-and-verify` — payload-free `oracleMemory` сохраняет последний Oracle-run при
    возврате в hub, запуске других foreground-игр и переходе между актами. При выходе из Grill
    ведущий обязан опечатать готовые `oracle-prophecy`; при неполном capture требуется явное
    подтверждение. После seal payload скрыт сервером и от host, и от владельца. В Bar act-aware
    endpoint переводит записи в `revealed`, host ritual показывает три пункта и фиксирует ровно три
    boolean результата. Versioned verification prompt даёт только сценический вердикт: поля
    `fulfilled_count`, `oracle_points`, `skeptic_points` всегда пересчитываются сервером по формуле
    5 за сбывшееся владельцу и 3 за несбывшееся каждой представленной команде кроме команды
    владельца. Verdict record и каждый ledger event имеют непрозрачные стабильные idempotency keys;
    сетевой replay возвращает прежний исход, а попытка переписать booleans получает conflict.
11. `smoke-screen-background-run` — `smokescreen` переведён из planned route step в девятую
    декларативно зарегистрированную игру с форматом `background`. Server command фиксирует
    участников и запускает run, не меняя `currentGame`, поэтому Challenge, Oracle и другие
    foreground-игры продолжают свой lifecycle независимо. Versioned generation prompt требует
    строгую колоду `{tier,text,detection_hint}`, exact count, few-shots и environment `+5` rubric;
    partial retry дополняет только отсутствующие player-private записи со стабильными ключами.
    Host видит лишь assigned/voted progress; owner metadata player/sealed records теперь также
    редактируется. При выходе из Grill миссии автоматически переходят в `sealed`. В Bar сервер
    создаёт отдельные revealed-копии без владельцев, принимает один приватный полный бюллетень от
    каждого игрока и только после host-confirmation раскрывает связи. Pure scoring даёт владельцу
    tier-джекпот 5/10/15 лишь за выполненную и никем не вычисленную миссию, детективу — +2 за каждую
    правильно найденную чужую. AI recap не влияет на очки; result record, ballots и ledger events
    переживают network replay без повторного начисления. Background card восстанавливает свою
    миссию после refresh и остаётся видимой поверх любой foreground-игры.
12. `toast-syndicate` — `toastsyndicate` переведён из planned route step в десятую
    декларативно зарегистрированную foreground-игру и стал запускаемой основной bar-сценой.
    Session состоит из шести тостов с ротацией говорящих; публичный state хранит жанр, таймеры,
    submission progress и раскрытый result, но никогда активные контрабандные слова. Versioned
    assignment prompt выбирает жанр и ровно три слова из локализованного каталога, избегает
    недавних повторов и проходит canonical server validation; seeded fallback сохраняет тот же
    контракт без AI. Слова записываются как player-private assignment. Только текущий говорящий
    получает signed `toastsyndicate/round/player` upload target и записывает 30–60 секунд; сервер
    проверяет namespace, скачивает объект из private Storage и запускает STT вне браузера.
    Слушатели сдают до трёх свободных догадок в приватных immutable ballots, включая явный пустой
    бюллетень. Judgment prompt оценивает genre 0–10, usage и smoothness 0–5 с environment rubric,
    но его totals игнорируются: pure scoring даёт говорящему `genre + 5` за каждое использованное
    непойманное слово, каждому точному слушателю — `+3`. Assignment, recording, ballot, result и
    score events имеют стабильные непрозрачные idempotency keys; refresh/retry не раскрывает
    секреты и не удваивает счёт. Host/player ritual показывает приватный груз, live recording,
    customs desk и reveal без новой ветки top-level router.
13. `still-life-survival` — `stilllife` переведён из planned route step в одиннадцатую
    декларативно зарегистрированную foreground-игру. В каждом из двух раундов все активные команды
    получают один общий AI-заголовок, пять минут строят физическую инсталляцию и отправляют ровно
    одно безопасно уменьшенное JPEG-фото в private Storage namespace своей команды. Public state
    хранит только заголовок, таймеры, progress ids, опубликованные оценки и итог; storage paths,
    signed URLs, исходные фото и бюллетени остаются в host-only/player-private records. Ведущий
    получает короткоживущую подписанную галерею и выбирает vision-критику или полный ручной состав
    жюри. Strict judgment prompt возвращает composition 0–10, drama 0–10 и material/environment
    0–5, но сервер ограничивает и заново складывает компоненты, игнорируя AI `points`. После
    публикации игрок может проголосовать только за чужую команду; immutable audience ballots не
    меняют 0–25 очков и используются лишь для разрешения равенства jury score. Submission,
    judgment, ballot, result и score events имеют стабильные непрозрачные idempotency keys;
    refresh/retry не раскрывает приватные данные и не удваивает счёт. Локализованный headline
    fallback и ручное жюри сохраняют полный ritual при недоступном AI/vision или плохой погоде.
14. `sommelier-charlatan` — `sommelier` переведён из planned route step в двенадцатую
    декларативно зарегистрированную foreground-игру и стал первым запускаемым bar-ритуалом.
    До десяти выбранных гостей отправляют по одному безопасно уменьшенному JPEG реального напитка;
    остальные остаются полноправной аудиторией и подозреваемыми. Public state хранит только
    capture/vote progress, анонимный случайный `entryId`, текущий AI-профиль и уже раскрытые
    результаты. Связка entry с владельцем, storage path, signed URL, analyses и immutable ballots
    остаётся в host-only/player-private records. Strict vision prompt возвращает ровно
    `drink_guess`, `tasting_notes`, `owner_profile`, `pretentiousness` и `pairing_advice`, содержит
    два few-shot примера и environment `+5` rubric; модель не видит имя владельца и не получает
    право считать очки. Pure scoring даёт каждому точному угадавшему `+3`, нераскрытому владельцу
    `+5`, а после последнего бокала ведущий один раз назначает `+3` владельцу самого громкого
    reveal. Все submission, analysis, ballot, result, crowd-favorite и score events имеют
    непрозрачные стабильные idempotency keys; refresh/retry не раскрывает владельца заранее и не
    удваивает начисления. Локализованный safe-roast fallback сохраняет игру без vision API и не
    делает выводов о защищённых или чувствительных свойствах человека.
15. `contraband` — `contraband` стал тринадцатой зарегистрированной игрой и независимым
    30-минутным bar-background run. Каждый участник получает одну player-private фразу; public
    state хранит только progress, таймер и ids активного обвинения. Обвиняемый признаётся или
    записывает 8–25 секунд контекста в приватный Storage namespace; STT и strict prompt оценивают
    только органичность текста по шкале 1–10, без заявлений о распознавании лжи. Порог 7,
    `+10` чистому/выжившему контрабандисту, `+5` ловцу и `−2` за ложный вызов пересчитываются
    сервером. При любом STT/AI fallback дело уходит на ручной verdict без auto-score; assignment,
    accusation, arbitration, resolution, result и ledger events имеют стабильные idempotency keys.
16. `tongs-of-truth` — `tongsoftruth` стал четырнадцатой зарегистрированной background-игрой и
    реализовал естественную эстафету физических щипцов по два минуты на ход. Normal route проводит
    всех участников через уровни 1→2→3; compact выбирает до пяти говорящих и делает level-3 blitz.
    Только текущий игрок открывает 45-секундное окно и отправляет 10–20 секунд аудио через общий
    signed-upload/STT pipeline. Strict question/judgment prompts содержат few-shots, safety и
    настоящий `+5 environment` criterion; AI явно не заявляет lie detection. Сервер игнорирует
    model totals и считает `specificity 0–10 + artistry 0–5 −3 dodge +5 environment`, cap 20.
    Audio path и transcript остаются в host-only `tongs-testimony`, публичен только короткий
    сценический verdict. Сбой STT/AI открывает host review или пас без штрафа; testimony, verdict и
    score имеют непрозрачные idempotency keys. Эти показания уже образуют приватный callback-source
    для следующей игры.
17. `cross-examination-and-finale` — `crossexamination` стал пятнадцатой зарегистрированной
    foreground-игрой для 6–30 гостей и завершил callback-loop вечера. Сервер детерминированно
    выбирает 3–4 пары, по возможности внутри команд; ведущий утверждает короткие факты из реальных
    Tongs, Smoke Screen, Oracle, Still Life, Contraband, Toast и Sommelier records, исключает
    чувствительные эпизоды и может добавить наблюдаемый факт вручную. Только утверждённый пакет
    попадает в strict question prompt; public state не содержит record ids, storage paths,
    transcripts или ballots. Каждая пара получает четыре вопроса order/object/person/detail и
    независимо пишет 20–60 секунд аудио с двух телефонов через общий signed-upload/STT pipeline,
    пока аудитория сдаёт один host-only прогноз категории. Comparison AI публикует только короткие
    версии и noir commentary: severity `0/1/2/3`, alibi `10 − сумма`, общий непосказанный
    environment bonus `+5`, split очков пары и audience `+2` пересчитывает сервер. При STT/AI
    fallback host вручную фиксирует четыре bounded findings или снимает эпизод без auto-score;
    replay testimony/prediction/verdict не дублирует записи и ledger events. После последней пары
    foreground освобождается. Новый finale ledger независимо строит Grill Royalty, Bar Legend, MVP,
    счёт по актам и highlights поверх существующего командного podium, поэтому отсутствие Cross,
    AI или ledger detail не блокирует завершение вечера.
18. `live-hardening-and-runbook` (foundation; field gate открыт) — все корневые host controls,
    финал и управление командами теперь применяются к последнему server snapshot как типизированные
    идемпотентные команды. Transient retry повторяет тот же command id, поэтому потерянный ответ не
    дублирует действие. Host/player показывают realtime-состояние, а возврат вкладки или сети делает
    свежий room fetch. Live safety card одним нажатием включает room-level manual AI mode: общий
    prompt runtime и legacy Soundscape обходят provider и используют fallback, не трогая ledger,
    private records и assignments. Artifact links живут 6 часов вместо суток; тесты фиксируют
    private bucket policies и удаление storage/private rows до комнаты. Одностраничный runbook
    запрещает live-ремонт через SQL и задаёт pause → manual fallback → resync → skip/hub flow.
    Системный Chrome resilience-smoke на реальной комнате подтверждает сохранение host auth и
    player id после refresh, identity-safe team switch, host/player `offline → live` с прежним
    state и поздний join с обновлением roster. Тот же прогон входит в активный Soundscape,
    переживает refresh, pause → refresh → resume и второй network fault уже внутри раунда,
    подключает нового игрока во время игры и возвращается в conductor на следующий, а не
    завершённый route step. Темы Soundscape теперь фиксируются CAS-записью на сервере до возврата
    provider-ответа: новая вкладка ждёт результат той же operation id, поэтому refresh во время
    генерации не меняет готовый AI deck на fallback; точечный cleanup выполняется и после всего
    fault flow. Отдельный fake-device media smoke на стабильных player identities проходит
    Soundscape microphone deny → retry guidance → grant → запись/upload и Challenge
    camera+microphone deny → grant → retry → video preview. Затем Photo Hunt получает кадр через
    native capture input, выполняет canvas-downscale, JPEG upload и artifact, продвигает маршрут и
    удаляет точную комнату. Per-round in-flight guards Challenge/Photo Hunt не позволяют позднему
    дублированному AI-ответу воскресить старую фазу. Физические device gates остаются открыты.
    Lobby теперь даёт каждому игроку self-serve camera+mic preflight без сохранения медиа:
    авторизованный player action пишет только bounded status и server timestamp, host показывает
    ready/blocked по каждому телефону, а stale full-state write не стирает более свежую проверку.
    Browser smoke подтверждает deny → grant → retry, host realtime и сохранение после refresh.
19. `cost-budget-and-pre-generation` (programmatic gate закрыт; calibration открыт) — text, vision,
    STT и TTS резервируют bounded credits в server-authoritative room ledger до provider call;
    usage tokens/provider request count дописываются после ответа, одинаковый operation id не
    списывается повторно, cap 60/120/240 управляется typed host command, а новый party-run обнуляет
    usage без смены cap. Conductor заранее готовит совместимый payload для Smoke Screen,
    Contraband, Toast Syndicate и Still Life. Сам payload остаётся host-only `party_records`, public
    state содержит только readiness metadata; cache identity включает experience, contingency,
    locale, act, game и roster, поэтому late join/team composition change не отдаёт старый deck.
20. `two-minute-quick-start` (programmatic gate закрыт; field gate открыт) — landing до записи
    комнаты собирает четыре входа: setting `park/bar/home/festival`, длительность `120/180/240`,
    ожидаемую группу `8–30` и имя ведущего. Валидированная конфигурация атомарно создаёт room с
    отдельным experience pack и exact-duration run of show: игры, сюжетные interludes и finale в
    сумме равны обещанным 2 / 3 / 4 часам. Host readiness измеряет реальную длительность, QR и
    восемь подключившихся игроков относительно 120-секундной цели. После общего зелёного gate одна
    кнопка `Start the party` отправляет typed `begin-run-step`: сервер принимает только следующий
    interlude, фиксирует `activeStepId/activeStepStartedAt`, сохраняет исходный timestamp при retry и
    показывает первый cue прямо в readiness. Completion очищает active cue и добавляет receipt в
    `completedStepIds`; foreground/background запуски отмечаются сервером. Classic free
    play и прежние Smoke & Neon routes не удалены. Новый party-run возвращается к первому акту,
    очищает progress/AI usage и перезапускает readiness clock. Общий route-progress helper теперь
    закрывает и поздние lifecycle-этапы: Smoke Screen reveal после результатов, Oracle verify после
    последнего подтверждения, compact Tongs после пятого хода и finale после завершения вечеринки.
    `bun run test:rehearsal` проводит 24 детерминированные генеральные репетиции — все четыре
    setting, три длительности и границы 8/30 игроков — через реальные typed host commands; каждый
    interlude теперь отдельно проходит `begin → active → complete`, каждая игра должна быть
    доступна, а маршрут закончиться finale.
    Дополнительная системная Chrome matrix проходит настоящий landing и проверяет сохранённые
    venue, expected crowd, обещанную и реальную длительность для `park/120/8`, `bar/180/8`,
    `home/240/8` и `festival/180/30`. Все изолированные player contexts входят одновременно;
    readiness получен за 8.10 / 6.11 / 6.16 / 18.55 секунды, после чего каждый точный `roomId`
    удалён даже при ошибке. Первый прогон обнаружил CAS-конфликт при пиковом join; player-action
    retry расширен до bounded 32 попыток с jittered backoff. 30-player пик завершился без потерь,
    использовав максимум 18 попыток на один запрос. Общий зелёный readiness теперь дополнительно
    требует авторизованный release-health check для `party_records`, `score_events`, приватного
    `recordings` bucket и AI credential. Raw ошибки не уходят в клиент. На текущем remote отдельный
    degraded-smoke `PPSY` собрал программу и восемь игроков за 10.95 секунды, но правильно удержал
    `ready=false`, оставил `Start the party` disabled и назвал две ожидающие миграции; classic free
    play при этом не заблокирован. Последующий read-only audit также обнаружил storage drift:
    историческая bucket-миграция отмечена применённой, но runtime больше не видит приватный
    `recordings`. Идемпотентная repair-миграция `20260716120000` восстанавливает/приватизирует bucket
    и повторно удаляет legacy anon policies. Все три migration применены 2026-07-16; remote history
    совпадает с local, а авторизованный runtime verifier возвращает `READY` по четырём проверкам.
    Этот же контракт вынесен в `verify:backend`: local и GitHub production deploy запускают его до
    build и прекращают выпуск при неполной схеме, публичном/отсутствующем media bucket или
    отсутствующем AI credential. Browser smoke подтверждает обе стороны: degraded backend держал
    launch control disabled; после migration ready-run `TGZN` подключил восемь игроков, получил
    зелёный readiness за 14.801 секунды, нажал `Start the party`, дождался persisted
    `park-arrival-120` и удалил комнату без SQL/state repair. 2026-07-17 проверенный deployment
    `dpl_7r8KHTs1bjZFZbYwN5innr721aZa` продвинут на публичный production alias с сохранённой точкой
    отката. Production smoke `JFN9` повторил тот же контракт с восемью игроками за 7.742 секунды,
    сохранил первый cue и удалил точную комнату; verifier остался `READY`, remote migrations —
    синхронизированными. Это закрывает deployment gate, но не физический field gate.
21. `connected-narrative-finale` (programmatic gate закрыт; field gate открыт) — перед `force-hub`
    и каждым следующим foreground launch сервер накапливает bounded evidence только из уже
    публичных результатов игр; `finish-party` захватывает последнюю игру до очистки state. Поэтому
    ранний recap или verdict переживает весь маршрут, а ближайший interlude показывает ведущему
    последнюю улику как grounded callback-мостик. Источники: recap, сценические verdict/comment,
    раскрытые профили, заголовки и факты голосования. Код намеренно не читает transcript,
    recording/storage URL, secret words, ballots, private records или текст невскрытых пророчеств;
    sentinel-тесты фиксируют границу. Финальный strict prompt с
    few-shots и настоящим `+5 environment` rubric связывает ровно до трёх разных evidence ids в
    headline, opening, callbacks и closing toast. Любой неизвестный/повторный id переводит ответ в
    локализованный schema-valid fallback. Server endpoint разрешён только host после статуса
    `finished`, берёт CAS generation lease и stable budget operation, поэтому две host-вкладки не
    создают разные версии. Результат сохраняется в public room state, переживает stale legacy write
    и одинаково показывается на host и player finale; `Start new party` очищает старый эпилог.
    Все 24 quick-start rehearsal дополнительно валидируют grounded fallback даже без накопленных
    игровых callbacks; маршруты с Soundscape также доказывают сохранение ранней улики через
    последующие game launches. Физически остаётся проверить читаемость переходных callbacks и
    эмоциональный ритм общего тоста.
22. `field-report-instrumentation` (programmatic gate закрыт; field gate открыт) — первое нажатие
    scripted cue и последний finale сохраняют server timestamps отдельно от временного active cue;
    восьмой join выводится из server `joinedAt`, поэтому после 2–4 часов остаются доказательства
    `room → roster`, `room → launch` и фактической длительности. Live safety экспортирует `.md` и
    `.json` с device readiness, aggregate AI credits/tokens/failures, числом и длительностью manual
    fallback, prepared readiness и score-ledger integrity. Ведущий добавляет только location,
    device/network, evidence kind, observed provider cost, prepared wait, failures, no-SQL/no-secret
    declarations, pacing review и PASS/FAIL. Автоматический
    контракт никогда не сериализует player/team names/ids, private assignments, transcripts,
    media, score reasons/rubrics, AI keys/operations или finale evidence text; sentinel-тесты
    проверяют и JSON, и Markdown. Schema v2 не позволяет считать automated smoke физическим
    доказательством. `verify:field-reports` принимает набор JSON, требует четыре setting,
    120/180/240, минимум две структурированные календарные даты, уникальные комнаты, физический
    PASS, 8–30 участников,
    восемь ready phones, launch до 120 секунд, backend READY, полный уникальный ledger без drift и
    безопасные privacy flags. По одинаковой валюте и ненулевому usage он считает median/max
    cost-per-credit и рекомендует первый cap 60/120/240 с 20% headroom. Stale legacy write не может перезаписать server-owned timing,
    AI usage, party mode или finished status. Два настоящих отчёта всё ещё отсутствуют.
    Deployment `dpl_ERu9s4Mog85zm3tditfjDQZa6Avt` обслуживает публичный production alias. Полная
    production-матрица прошла `park/120/8`, `bar/180/8`, `home/240/8` и `festival/180/30` за
    10.219 / 8.556 / 8.488 / 49.093 секунды. Все четыре сценария сохранили первый cue, скачали
    schema-v2 JSON через host UI, потребовали `runKind=automated` и `hostHandoff=verified`,
    провалидировали timing/roster/ledger/privacy contract и удалили точные комнаты `KJ3H`, `N5WA`,
    `4W3Y`, `JX8Y`. Предыдущий full-route production `dpl_3NmjDyT79SpqnBNe7XgEfgPoSpuw` сохранён
    как ближайший rollback target; backend остаётся READY, remote migrations — up to date.
23. `private-host-handoff` (programmatic gate закрыт; physical gate открыт) — Live safety создаёт
    backup URL только по явному действию ведущего и никогда не показывает его как публичный QR.
    Host credential помещается в fragment `#host-access`, поэтому не входит в HTTP request URL или
    referrer; принимающий browser сразу очищает address bar, проверяет секрет через отдельный
    auth-only endpoint и лишь затем сохраняет host access для room code/id. Неверный, повторённый
    или просроченный fragment не открывает host controls и не отражается в ошибке. Новые комнаты
    используют 24 crypto-random bytes вместо `Math.random`-идентификатора. Local browser smoke
    `AMHE` реально скопировал ссылку кнопкой, открыл её в storage-isolated context, получил тот же
    host runtime без fragment, затем завершил обычный 8-player launch/report/cleanup flow.
    Полная production-матрица повторила тот же путь для четырёх setting/duration сценариев,
    включая festival на 30 игроков, и сохранила `hostHandoff=verified` во всех скачанных schema-v2
    reports. Второй физический host device ещё должен пройти полевой gate. Строгий verifier
    принимает physical PASS только со значением `verified`.
24. `player-action-contention` (programmatic gate закрыт; physical burst gate открыт) — действия
    одной комнаты, попавшие в один server runtime, проходят через leak-safe FIFO tail вместо
    локальной гонки CAS; разные комнаты не блокируют друг друга, ошибка всегда освобождает
    следующего waiter. Существующий optimistic retry не удалён и по-прежнему разрешает конфликты
    между Vercel instances. В local festival burst `UJDY` все 30 joins завершились с
    `attempts=1`, без write conflicts, максимум queue wait 4.297 секунды. В production `JX8Y`
    runtime logs доказали 30 уникальных joins за 5.822 секунды, максимум queue wait 5.582 секунды
    и максимум 8 CAS attempts против 15 на предыдущем deployment. Browser readiness с созданием
    30 изолированных contexts составил 49.093 секунды и остался внутри двухминутного gate.
25. `full-route-browser-journey` (programmatic gate закрыт; physical duration gate открыт) — новый
    `smoke:browser:journey` проходит не только launch, а весь park/120 маршрут через существующие
    host/player UI: два interlude, Soundscape, Challenge, Photo Hunt, Who Among Us, явный переход в
    finale act и общий финал. Soundscape-тема сначала фиксируется как public evidence, появляется в
    transition callback, а затем тот же evidence id обязан присутствовать и у ведущего, и у игрока.
    Финал больше не блокируется нулевым счётом: story-only или аварийно сокращённый вечер всё равно
    можно корректно закрыть. Быстрый rehearsal обнаружил более глубокую гонку — поздние AI-ответы
    Challenge/Photo Hunt могли полным stale snapshot воскресить покинутую игру. Active-round guard
    теперь проверяется сервером; несовпавший game/round возвращается как успешный `skipped=true`, не
    перезаписывает state, не показывает ведущему ложную ошибку и не озвучивает устаревшее задание.
    Local `ALGK` и production `WT8V` прошли весь путь; `WT8V` достиг readiness за 12.920 секунды,
    завершил шесть предфинальных шагов, вернул `soundscape:snd_cmd_ahccmwc1_lhbpfz` в обоих финалах
    и был удалён. Runtime logs подтвердили два safe stale skips при уже активных Photo Hunt/Who
    Among Us и отсутствие 500s на deployment `dpl_3NmjDyT79SpqnBNe7XgEfgPoSpuw`.
26. `self-serve-host-brief` (programmatic gate закрыт; first-time-host field gate открыт) — landing
    больше не просит ведущего вслепую выбрать только setting, duration и crowd. Из настоящего
    experience route и game registry строится короткая памятка: точная длительность, число игровых
    моментов и сюжетных пауз, наличие финала, понятные camera/microphone/playback требования и
    минимальный комплект для парка, бара, дома или фестиваля. Технические `vision`/`stt`
    capabilities не выдаются за реквизит; ведущий видит обычное действие и явное обещание
    fallback/skip без потери маршрута или финала. Та же памятка остаётся в quick-start readiness
    после создания комнаты, поэтому подготовка не исчезает вместе с landing. Unit matrix проверяет
    все 12 route combinations; отдельный `smoke:browser:brief` прошёл `park/120/8` (`PTBJ`),
    `bar/180/8` (`44L4`), `home/240/8` (`J5C4`) и `festival/180/30` (`BFUG`) с точным cleanup.
    Desktop и iPhone viewport подтверждают, что brief не вытесняет основной launch CTA.
    Production deployment `dpl_ERu9s4Mog85zm3tditfjDQZa6Avt` получил статус `Ready` и публичный
    alias; удалённая brief-matrix повторила четыре setting и точечно удалила комнаты `PZNG`,
    `NMHN`, `Q3TL`, `YP7R`.
27. `party-story-seed` (programmatic gate закрыт; physical callback gate открыт) — quick start
    принимает одну необязательную публичную деталь вечера до 160 символов: повод, заметный предмет
    или внутреннюю шутку. Нормализованное значение сохраняется одновременно в quick-start setup и
    party context, переживает создание комнаты и **Start new party**, показывается ведущему как
    **Tonight's thread** и доступно всем party-mode AI prompts, включая связный финал. Граница
    prompt injection явная: текст появляется только после safety-инструкции, сериализуется как JSON
    string и объявлен untrusted factual flavor, который нельзя выполнять как задание или использовать
    для ослабления правил. Unit tests покрывают нормализацию, лимит, migration, сохранение между
    вечерами и injection-like строку. Local setup-only matrix сохранила seed в комнатах `ZXWL`,
    `8VTN`, `AFAB`, `4VDX`; production deployment `dpl_58UCad3FcTL5SpQwhTtLRmkfWA6R` повторил
    контракт в `Q7H2`, `RQWM`, `UKRM`, `VU7N`. Все восемь тестовых комнат удалены точечно.
28. `first-time-host-launch-signal` (programmatic gate закрыт; physical comprehension gate открыт) —
    pre-launch больше не показывает одинаковое «One action left» рядом с заблокированным стартом.
    Чистая state model выбирает ровно один крупный сигнал с явным приоритетом: **REBUILD.** для
    несовпавшего route, **CHECK.** во время live-check, **FIX.** для degraded/error, **REDUCE.**
    при 31+ identity, **INVITE.** до восьмого гостя или **START.** для первого cue. При восьми из
    ожидаемых тридцати сигнал прямо говорит, что поздние гости могут войти после старта. Unit tests
    покрывают все шесть состояний, singular copy, over-capacity и late-arrival contract. Local
    setup matrix открыла QR и удалила
    `9XDZ`, `QEHA`, `KD7V`, `F3SV`; local full flow `W4HY` прошёл host handoff, восемь joins, start,
    persisted cue и field report. Production deployment `dpl_4k8js6iXpqWjnQTKM8o7AHKnKARC`
    повторил matrix в `7CEG`, `BF7K`, `LTH7`, `XH98`; полный `9B3K` достиг readiness за 11.864
    секунды и прошёл тот же путь. Все комнаты удалены точечно.
29. `field-evidence-schema-v3` (programmatic gate закрыт; physical evidence collection открыт) —
    прежний verifier мог дать PASS, не доказав самостоятельность ведущего и связность истории.
    Новый JSON/Markdown хранит bounded enums `hostExperience`, `hostAutonomy`,
    `launchCoachResult`, `storyCallbackInGame`, `storyCallbackInFinale`, `storySafety` и только
    boolean `storySeedConfigured`; сам публичный seed не экспортируется и закреплён privacy
    sentinel-тестом. Release audit требует independent launch-signal use во всех физических прогонах,
    хотя бы одного first-time host и безопасный callback в игре и финале для каждого setting.
    Unknown, prompted, misunderstood, not-observed, concern, automated и schema v2 не закрывают
    gate. Local `JTRC` и production `725Q` прошли настоящий UI download, host handoff, восемь joins,
    первый cue, schema-v3 parsing и точечный cleanup. Deployment
    `dpl_F3UrHatZsYvwfBzHvznZPSUjmkju` имеет статус `Ready`; ближайший rollback —
    `dpl_4k8js6iXpqWjnQTKM8o7AHKnKARC`.
30. `self-serve-field-evidence-coach` (programmatic gate закрыт; physical evidence collection
    открыт) — два вечера больше нельзя сымитировать разными свободными `eventLabel`: v3 report
    хранит отдельную проверяемую дату `YYYY-MM-DD`, а release audit требует минимум две разные
    календарные даты. Перед экспортом host UI считает 18 обязательных PASS-деклараций и показывает
    ровно одно следующее действие. Неполный outcome PASS не скачивается; pending и FAIL остаются
    доступны как честное evidence незавершённого/неудачного прогона. Pure readiness model и audit
    tests закрывают неверную дату, prompted host, отсутствующий story seed/callback, safety concern
    и неоднозначную стоимость. Local `8KFF` и production `4RDQ` прошли host handoff, восемь joins,
    readiness за 13.428 / 12.066 секунды, persisted cue, блокировку неполного PASS, privacy-safe v3
    download со структурированной датой и точечный cleanup. Deployment
    `dpl_GdZarBcWP5T3vjovmsgNo5hgQCq4` имеет статус `Ready`; ближайший rollback —
    `dpl_F3UrHatZsYvwfBzHvznZPSUjmkju`.
31. `first-viewport-entry-routing` (programmatic gate закрыт; physical comprehension gate открыт) —
    мобильный landing больше не прячет оба полезных действия под hero и длинной host-формой.
    Первый viewport явно разделяет **Host a party** с переходом к двухминутной настройке и
    **Join a party** с переходом прямо к fallback-вводу room code. Семантический `nav`, видимые
    focus states, стабильные anchors и `scroll-margin` сохраняют keyboard/screen-reader и мобильный
    flow. Browser smoke кликает оба entry path до создания каждой комнаты. Visual QA на 390×844
    подтвердила читаемые CTA; local `MUVQ` и production `59BL` затем прошли восемь joins, readiness
    за 9.034 / 13.505 секунды, persisted cue, privacy-safe report и точечный cleanup. Deployment
    `dpl_pYvWNdny3WNMdVLQbn55qr3iVnoS` имеет статус `Ready`; ближайший rollback —
    `dpl_GdZarBcWP5T3vjovmsgNo5hgQCq4`.
32. `guest-room-code-contract` (programmatic gate закрыт; physical crowd-entry gate открыт) —
    генератор и обе публичные guest-формы теперь используют один четырёхсимвольный алфавит без
    неоднозначных `I/O/0/1`. Root и dedicated `/play` нормализуют case, пробелы и дефисы, не дают
    отправить неполный/неоднозначный код, поддерживают Enter/Go, показывают локальный ready-state;
    `/play` сразу фокусирует поле. Mobile visual QA обнаружила слишком слабый enabled CTA и сделала
    его явно зелёным. Первый Chromium smoke дополнительно поймал, что HTML `maxLength` обрезал
    paste до React-нормализации; ограничение удалено, а pure normalizer всё равно жёстко оставляет
    четыре символа. Smoke теперь проверяет invalid `O0I1` и paste `a-b c d → ABCD` до создания
    каждой комнаты. Local `ZQ8T` и production `2EAD` прошли восемь joins, readiness за 12.808 /
    13.747 секунды, persisted cue, report и cleanup. Для воспроизводимого deploy `vercel@56.3.1`
    закреплён в lockfile после отказа повреждённого transient `vercel@latest`. Deployment
    `dpl_6Re3EkJeZD1VCBo21SHgTtgv2iF3` имеет статус `Ready`; ближайший rollback —
    `dpl_pYvWNdny3WNMdVLQbn55qr3iVnoS`.
33. `guest-room-recovery` (programmatic gate закрыт; physical crowd-entry gate открыт) — прямая
    guest-ссылка больше не сваливает неверный формат, отсутствующую комнату и временный сетевой
    сбой в один ложный **Room not found**. Невалидный или неоднозначный код отсекается до Supabase;
    пятисимвольная строка больше не считается валидной после молчаливого truncation. Recovery
    сохраняет введённые символы, автофокусирует редактируемое поле, нормализует исправленный paste
    и позволяет проверить тот же код повторно без возврата на landing. Отдельные состояния
    **Check the room code**, **Room … is not live** и **Couldn’t check room …** дают гостю точное
    следующее действие, не показывая backend error. `useRoom` очищает старую ошибку после успешного
    retry и не выбрасывает уже загруженную комнату при кратком sync failure. Browser smoke перед
    созданием каждой комнаты открывает `/play/O0I1`, доказывает disabled lookup и исправление
    `a-b c d → ABCD`. Visual QA на 390×844 отдельно прошла invalid link, уже удалённую local-комнату
    `AHAS`, offline retry и возврат сети. Production `BRSM` затем проверил private host handoff,
    восемь joins, readiness за 15.604 секунды, persisted cue, privacy-safe report и точечный cleanup.
    Deployment `dpl_GR6xb9fg7fESkubwbqvoucb7jnCt` имеет статус `Ready`; ближайший rollback —
    `dpl_6Re3EkJeZD1VCBo21SHgTtgv2iF3`.
34. `room-capacity-contract` (programmatic gate закрыт; physical 30-phone gate открыт) — обещание
    8–30 участников теперь является одним shared contract для quick start, field-report audit и
    browser smoke. Server-authoritative join принимает новую identity только пока в комнате меньше
    30 игроков и возвращает bounded `409 room is full (30 players)` на 31-го; уже вошедший игрок
    может безопасно восстановить ту же identity при 30/30. Guest UI заранее показывает отдельный
    экран **30/30 · Room is full** с просьбой позвать ведущего. До первого live cue ведущий видит
    компактный **Remove** у каждого участника и может убрать дубликат/неактивный телефон; после
    старта roster нельзя разрушить этой командой. Legacy room выше лимита не получает ложный
    green readiness, а launch coach ведёт к player list. Unit tests фиксируют 29/30/31, rejoin,
    lobby-only removal и exact-30 copy. Mobile 390×844 QA проверила full-room recovery, desktop QA —
    30-row roster и доступные remove controls. Local `R2FH` прошёл 30 joins, блокировку 31-го,
    readiness за 26.437 секунды, cue, report и cleanup. Первый production burst `F2ZU` честно
    обнаружил Vercel Security Checkpoint: старый smoke отправлял 30 Playwright POST строго
    одновременно. Оркестрация теперь подключает быстрыми параллельными группами по четыре, не
    меняя server boundary; повторный production `9Z54` прошёл 30 joins, UI + direct 31st rejection,
    readiness за 86.452 секунды, cue `festival-rally-180`, privacy-safe report и точечный cleanup.
    Deployment `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm` имеет статус `Ready`; ближайший rollback —
    `dpl_GR6xb9fg7fESkubwbqvoucb7jnCt`.
35. `field-report-draft-survival` (programmatic gate закрыт; physical evidence collection открыт) —
    18 ручных деклараций полевого отчёта больше не живут только в React state. Для текущего
    quick-start run они сохраняются как один mutable host-only `party_records` draft, жёстко
    привязанный к `configuredAt`; новый party получает другой identity и не наследует старые
    наблюдения. Exact bounded schema не принимает лишние поля или oversized notes. Draft не входит
    ни в public room state, ни в realtime, ни в player API. UI сначала загружает приватную копию,
    затем сохраняет изменения последовательной очередью, поэтому медленный старый request не может
    затереть новую редакцию; ошибка синхронизации не блокирует локальную форму или честный экспорт.
    Local `ZQNS` и production `DCUT` подключили восемь изолированных игроков, достигли readiness за
    13.176 / 23.372 секунды, сохранили первый cue, дождались фактического save, восстановили те же
    поля после refresh основного host и на отдельном backup-host, выгрузили privacy-safe report и
    удалили комнаты. 390×844 и desktop QA подтвердили отсутствие horizontal clipping и читаемый
    sync status. Deployment `dpl_5CvFoV599PtuJJJywctxJu4dWmE5` имеет статус `Ready`; ближайший
    rollback — `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm`.
36. `grounded-story-thread-in-games` (programmatic gate закрыт; physical callback gate открыт) —
    уже опубликованные события больше не ждут следующего interlude или финала: до трёх последних
    bounded public reveals входят в каждый следующий party-mode AI prompt как JSON-quoted
    **STORY SO FAR**. Контракт запрещает выполнять строки как инструкции, показывать internal ids,
    делать чувствительные выводы или ослаблять schema/rubric и разрешает не больше одного короткого
    естественного callback. Classic prompts остались byte-for-byte совместимыми, finale не
    дублирует свой отдельный evidence payload, а prewarm cache инвалидируется при изменении
    публичной истории. Структурный validator переживает перестановку JSONB-ключей и по-прежнему
    отбрасывает extra/private fields; успешный ответ host-команды сразу обновляет собственный экран
    ведущего, не дожидаясь realtime. Late Photo Hunt generation после выхода считается отменённым
    раундом, а не browser error. Полный pack — 492 теста в 107 файлах. Local `UJ2K` достиг readiness
    за 41.342 секунды и перенёс Soundscape callback в Challenge, Photo Hunt, Who Among Us и общий
    host/player finale. Production `ATDJ` повторил путь за 48.507 секунды и был удалён; первый
    production probe `EB2D` подтвердил перенос в Challenge, затем поймал транзиентный hub timeout и
    тоже был удалён. Deployment `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA` имеет статус `Ready`; ближайший
    rollback — `dpl_5CvFoV599PtuJJJywctxJu4dWmE5`.
37. `monotonic-host-room-convergence` (programmatic gate закрыт; physical network gate открыт) —
    host UI больше не принимает room snapshots в порядке прихода. Публичный REST read и realtime
    UPDATE несут серверный `rooms.updated_at`; клиент сохраняет только строго более новую ревизию,
    а равную намеренно игнорирует, потому что успешная host-команда уже могла применить свой ответ
    локально. Ответ `/api/host-command` теперь возвращает `updatedAt` именно подтверждённой CAS-
    записи, поэтому даже промежуточный player-update, который сервер видел раньше клиента, не может
    временно воскресить покинутую игру. До появления первой валидной ревизии legacy payloads
    сохраняют прежний last-arrival-wins contract; после неё unversioned snapshot не понижает state.
    Browser gate требует валидную committed revision на каждом реальном **Back to hub**. Unit-
    контракт покрывает older/equal/newer, sub-millisecond Postgres timestamps и legacy fallback.
    Полный pack — 496 тестов в 107 файлах; rehearsal 28/28, lint, typecheck и production build
    проходят. Local `RFDW` достиг readiness за 11.615 секунды и завершил весь connected journey;
    production `8GYE` повторил его за 21.927 секунды, вернул один Soundscape callback в следующие
    три игры и общий host/player finale, затем был удалён. Deployment
    `dpl_BFEJtCNWx6MGFFx4gAtyTQWtmzRA` имеет статус `READY`; ближайший rollback —
    `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA`.
38. `automatic-launch-signal-evidence` (programmatic gate закрыт; physical comprehension gate открыт) —
    общий ручной ответ больше не притворяется доказательством каждого показанного сигнала.
    Field-report schema v5 автоматически сохраняет уникальную first-seen последовательность
    `REBUILD.` / `CHECK.` / `FIX.` / `REDUCE.` / `INVITE.` / `START.` без времени, имён, story text
    или private state. Private draft v3 честно мигрирует v1/v2 с пустой последовательностью и
    монотонно объединяет наблюдения primary/backup host. In-product PASS требует автоматически
    увидеть `INVITE.` и `START.`, после чего отдельно спрашивает, выполнил ли ведущий каждый
    видимый сигнал без подсказки. Aggregate verifier показывает machine evidence отдельным gate;
    physical first-time-host observation всё ещё обязательно. Локально проходят 513 тестов в 110
    файлах, lint, TypeScript и production build; БД и browser smoke не затрагивались.
39. `venue-aware-soundscape-story-entry` (programmatic gate закрыт; physical audio gate открыт) —
    Soundscape больше не начинает универсальный quick-start как старый англоязычный park-event.
    Для party packs генерация тем, пространственного микса и вердикта теперь проходит через
    versioned `PromptSpec`: получает серверный act environment для парка, бара, дома или фестиваля,
    `contentLocale`, Tonight's thread и до трёх уже публичных reveals. Темы обязаны превращать
    реальные звуки и доступные предметы текущего места в материал игры; mix и judgment получают
    имена и STT summary только как bounded JSON-quoted data. Signed media URL в prompt не входит,
    transcript не может менять safety/schema/rubric, а party-mode speaker slots больше не называют
    домашние или фестивальные колонки `Oak Spirit` и `Squirrel Gossip`. У каждого venue есть
    локализованный schema-valid offline fallback. Classic DIMAS Soundscape сохраняет прежнюю
    persona, английский язык и исходные три fallback-темы. Полный regression pack — 518 тестов в
    111 файлах; lint, TypeScript и production build проходят. БД и browser smoke не затрагивались.
40. `venue-aware-secret-story-thread` (programmatic gate закрыт; physical social-dynamics gate
    открыт) — Smoke Screen больше не является скрытой привилегией bar-route. Все 12 quick-start
    сценариев для парка, бара, дома и фестиваля теперь начинают длинную фоновую интригу приватными
    миссиями, выдерживают не меньше 30 минут между раздачей и раскрытием и сохраняют точные 120 /
    180 / 240 минут за счёт перераспределения interlude, а не раздувания обещанной длительности.
    Park, home и festival получают собственные физические словари, EN/RU few-shots и
    schema-valid offline decks; правила запрещают незнакомцев, выход из группы, опасные действия и
    чувствительные выводы. В single-act packs полный sealed lifecycle разрешён внутри `classic`,
    тогда как Smoke & Neon по-прежнему не раскрывает grill-миссии до bar/finale. Host/player copy
    больше не обещает несуществующий переход в бар, private records остаются server-only, а
    анонимный recap попадает в общий finale evidence. Все 24 репетиции на границах 8/30 игроков
    проходят. Полный regression pack — 522 теста в 112 файлах; lint, TypeScript и production build
    проходят. БД и browser smoke не затрагивались.
41. `automatic-first-secret-prewarm` (programmatic gate закрыт; live latency gate открыт) —
    ведущему больше не нужно замечать и нажимать **Prepare AI now** между вступлением и первой
    секретной раздачей. Как только первый route interlude становится live, conductor автоматически
    готовит ближайшую Smoke Screen колоду в фоне; ручная кнопка остаётся честным retry/fallback,
    если провайдер не ответил. Все 12 park/bar/home/festival × 2/3/4-hour routes доказывают один и
    тот же upcoming target. Cache identity теперь учитывает площадку, content locale, AI mode,
    Tonight's thread, public story evidence, точный roster и `configuredAt` конкретного запуска:
    новая история, смена режима или **Start new party** не могут получить старую колоду. Подготовка
    остаётся idempotent в private `party_records`, а public DOM получает только несекретный game id
    для будущего browser gate. Полный regression pack — 524 теста в 112 файлах; lint, TypeScript и
    production build проходят. БД и browser smoke не затрагивались.
42. `arrival-soundscape-topic-prewarm` (programmatic gate закрыт; live latency gate открыт) —
    arrival window теперь готовит не произвольный список будущих игр, а короткий непрерывный
    фрагмент маршрута: ближайший background-start и только первый foreground-game. Поэтому все 12
    quick-start routes по-прежнему прогревают Smoke Screen, а восемь park/home/festival routes,
    где сразу следом стоит Soundscape, дополнительно готовят его venue-aware темы. Четыре маршрута
    без Soundscape не тратят запрос на далёкие Toast/Contraband сцены. Темы лежат в host-only
    `party_records`, не появляются в public room state и не запускают voting timer; при реальном
    старте Soundscape валидный подготовленный payload сначала проходит ту же schema и sanitizer,
    затем одним CAS-write получает новый `topicsEndsAt`. Обычный provider call выполняется только
    при отсутствии подходящей записи. Soundscape cache не зависит от roster, потому поздний join
    не выбрасывает уже готовые общие темы, но venue, locale, act, AI mode, Tonight's thread,
    public evidence и `configuredAt` по-прежнему защищают от stale reuse. Полный regression pack —
    526 тестов в 112 файлах; lint, TypeScript и production build проходят. БД и browser smoke не
    затрагивались.
43. `bounded-parallel-soundscape-ai` (programmatic gate закрыт; live latency gate открыт) —
    Soundscape больше не делает полный AI round-trip для каждой команды строго по очереди. Mix и
    post-vote judgment проходят через общий ordered worker pool с максимум двумя одновременными
    задачами: стандартные две команды ждут одну волну, а большее число команд обрабатывается
    предсказуемыми парами без неконтролируемого burst. Результаты возвращаются в исходном team
    order, ошибка одного mix изолируется и даёт этой команде playable local mix, не отменяя
    остальных; ошибка одного judgment не блокирует подсчёт человеческих голосов и общий results
    screen. AI budget idempotency теперь привязана к стабильному `teamId`, поэтому две команды с
    одинаковым отображаемым названием не делят один receipt и не превращают второй запрос в
    ложный replay. В prompt по-прежнему входят только bounded team name, topic и public clip facts,
    без host credentials или team id. Полный regression pack — 529 тестов в 113 файлах; lint,
    TypeScript и production build проходят. БД и browser smoke не затрагивались.
44. `arrival-impostor-question-prewarm` (programmatic gate закрыт; live latency gate открыт) —
    единственный quick-start маршрут, где первая foreground-игра не требует фото и при этом не
    является Soundscape, больше не начинает с видимого AI wait. Во время `home/120` arrival cue
    conductor готовит приватно и Smoke Screen deck, и первый venue-aware вопрос **Who's the Bot?**;
    остальные 11 маршрутов не получают лишний Impostor-запрос. Подготовленный payload остаётся в
    host-only `party_records`, проходит тот же строгий output schema и используется только в первом
    раунде при совпадении venue, locale, act, AI mode, Tonight's thread, public evidence и
    `configuredAt`; последующие раунды всегда строятся из server-authoritative истории уже заданных
    вопросов. Roster не входит в identity общего вопроса, поэтому поздний join не выбрасывает
    полезный prewarm. Заодно offline deck перестал переносить дым и гриль в дом, парк или фестиваль:
    EN/RU fallback теперь различает bar, home, festival, park и grill-site. Полный regression pack —
    531 тест в 113 файлах; lint, TypeScript и production build проходят. БД и browser smoke не
    затрагивались.
45. `post-step-photo-task-prewarm` (programmatic gate закрыт; live latency gate открыт) —
    автоматическая подготовка больше не ограничена arrival interlude. После завершённого шага и
    возврата в conductor, когда результат предыдущей игры уже мог попасть в public story evidence,
    следующий поддерживаемый scripted route action получает один фоновый prewarm без отдельной
    команды ведущего. Это намеренно происходит не во время предыдущей игры: иначе новое событие
    вечера изменило бы story-aware cache key и сделало ранний payload устаревшим. Первым к этому
    пути подключён Photo Hunt: девять park/home/festival маршрутов могут заранее получить первое
    задание после предыдущей foreground-игры. Payload остаётся в host-only `party_records`, повторно
    проходит strict schema и используется только при пустой server-authoritative истории заданий;
    extra fields и второй раунд его не принимают. Roster-independent identity переживает late join,
    но venue, locale, act, AI mode, Tonight's thread, public callbacks и `configuredAt` по-прежнему
    инвалидируют stale task. Offline Photo Hunt deck теперь отдельно покрывает bar, home, festival,
    park и grill-site на EN/RU, не отправляя домашнюю или фестивальную группу фотографировать дым и
    щипцы. Полный regression pack — 534 теста в 113 файлах; lint, TypeScript и production build
    проходят. БД и browser smoke не затрагивались.
46. `story-preserving-in-game-exit` (programmatic gate закрыт; physical host-flow gate открыт) —
    внутренние result/recovery-кнопки семи legacy foreground-игр больше не записывают `lobby`
    напрямую из устаревающего React snapshot. Soundscape, Challenge, Photo Hunt, Real or AI,
    Spectrum Court, Who Among Us и Who's the Bot получают единый `onBackToHub` от `HostInner` через
    typed registry и вызывают ту же server-authoritative `force-hub` команду, что control bar.
    Поэтому сервер сначала фиксирует все доступные public results в полном finale ledger и до трёх
    последних bounded reveals в story context следующей игры, а уже затем очищает foreground state;
    подтверждённый CAS snapshot немедленно применяется на host. Восемь обходных прямых записей
    удалены, registry test доказывает callback для всех семи адаптеров, а state-level regression
    одновременно захватывает evidence каждого legacy результата перед cleanup. Полный regression
    pack — 536 тестов в 113 файлах; TypeScript, ESLint и production build проходят. БД и browser
    smoke не затрагивались.
47. `cross-examination-immediate-story-capture` (programmatic gate закрыт; physical callback gate
    открыт) — Cross-Examination остаётся единственной foreground-игрой, которая сама возвращает
    conductor после финальной пары или прерванной curation. Этот auto-exit теперь публикует уже
    раскрытые pair verdicts в finale ledger и bounded story context в той же server-side
    CAS-транзакции, прежде чем сбросить `currentGame`. Поэтому следующий interlude сразу видит новую
    улику, а post-step prewarm строит payload уже с verdict этого вечера, не ожидая следующего
    `launch-game`. Повторный final/dismiss request остаётся idempotent и заодно восстанавливает
    story evidence у старого results-state. Тесты покрывают нормальное завершение, interrupted
    dismiss и replay. Полный regression pack — 537 тестов в 113 файлах; ESLint, TypeScript и
    production build проходят. БД и browser smoke не затрагивались.
48. `post-step-challenge-task-prewarm` (programmatic gate закрыт; live latency gate открыт) —
    Scene Challenge подключён к тому же story-aware post-step prewarm, что Photo Hunt. После
    Soundscape во всех трёх park routes и после Photo Hunt во всех трёх festival routes conductor
    готовит первое ensemble-задание до launch, уже с последней публичной уликой вечера. Подготовка
    использует нейтральное имя camera operator и roster-independent cache, потому late join не
    выбрасывает общий task; venue, locale, act, AI mode, Tonight's thread, public callbacks и
    `configuredAt` всё ещё инвалидируют stale payload. При запуске output повторно проходит strict
    schema и принимается только при пустой server-authoritative истории заданий; extra fields и
    второй раунд уходят в обычный provider/fallback path. Одновременно party fallback исправлен:
    park, home и festival больше не получают русский дым, фольгу и щипцы, а все park/bar/home/
    festival/grill-site варианты имеют собственные безопасные EN/RU сцены. Полный regression pack —
    540 тестов в 113 файлах; ESLint, TypeScript и production build проходят. БД и
    browser smoke не затрагивались.
49. `full-roster-game-scale-contract` (programmatic gate закрыт; physical crowd gate открыт) —
    обещание 8–30 теперь покрывает не только join cap и две крайние dress rehearsal. Registry
    matrix запускает все 15 игр при каждом целом размере группы от 8 до 30, проверяет неизменность
    и уникальность live roster, готовность правильного game-state и честное foreground/background
    поведение. Отдельная role matrix доказывает, что Grill Oracle, Smoke Screen, Contraband и
    Tongs of Truth не теряют участников; полный Tongs speaker order не содержит дублей;
    Cross-Examination сохраняет всех гостей как audience и выбирает уникальные 3–4 пары; Sommelier
    честно ограничивает capture десятью уникальными бокалами, а Challenge и Toast назначают
    существующих игроков. Это покрывает также нечётные группы и все промежуточные размеры, а не
    только 8/30. Полный regression pack — 542 теста в 113 файлах; ESLint, TypeScript и production
    build проходят. БД и browser smoke не затрагивались.
50. `host-ready-story-bridge` (programmatic gate закрыт; physical callback gate открыт) — последняя
    публичная улика вечера больше не исчезает после interlude и не остаётся сырой заметкой, которую
    ведущему нужно на ходу превращать в переход. Conductor детерминированно собирает короткую EN/RU
    реплику из bounded evidence и названия следующего route step, показывает её в паузе, а затем
    сохраняет прямо над запуском каждой следующей scripted game. Reveal и finale получают отдельные
    формулировки, пустая улика ничего не рендерит. Component regression проходит переход
    `Kitchen diplomacy → Spectrum Court` на одном реальном Soundscape callback; selector tests
    покрывают EN/RU, whitespace normalization, reveal/finale и пустой detail. Полный regression
    pack — 543 теста в 113 файлах; ESLint, TypeScript и production build проходят. БД, browser
    smoke и Paper не затрагивались.
51. `cross-act-and-verdict-story-bridge` (programmatic gate закрыт; physical delivery gate открыт) —
    аудит conductor обнаружил два оставшихся разрыва: готовая story bridge показывалась в interlude
    и перед scripted game, но исчезала именно при смене локации и на пороге финала. Transition теперь
    получает собственную произносимую EN/RU реплику: реальная улика «едет с нами», опечатывается и
    передаёт дело следующей локации. Finale возвращает тот же факт как Exhibit A прямо перед
    `Show the finale`. Component regression переносит один Soundscape callback через
    `grill → transition → party verdict`; selector regression проверяет обе локали и отдельную
    transition-формулировку. Полный regression pack — 544 теста в 113 файлах; ESLint, TypeScript и
    production build проходят. БД, browser smoke, Paper и deploy не затрагивались.
52. `story-seed-to-live-evidence-handoff` (programmatic gate закрыт; first-cue delivery gate открыт) —
    выбранная в quick start **Tonight's thread** раньше доходила до brief и AI prompts, но исчезала
    из live conductor до первой публичной улики. Теперь conductor превращает bounded seed в готовую
    стартовую EN/RU реплику для первого interlude, scripted game, transition, reveal и finale.
    Как только вечер публикует настоящую evidence, она автоматически получает приоритет и полностью
    заменяет seed в host-facing связке; повреждённая пустая legacy evidence безопасно откатывается к
    исходной нити. Component regression проходит `story seed → first cue → first game → Soundscape
    evidence`, selector regression покрывает обе локали, whitespace normalization и все особые
    route kinds. Полный regression pack — 545 тестов в 113 файлах; ESLint, TypeScript и production
    build проходят. БД, browser smoke, Paper и deploy не затрагивались.
53. `all-games-public-evidence-contract` (programmatic gate закрыт; physical evidence-quality gate
    открыт) — связная история теперь защищена не несколькими примерами, а registry-wide матрицей.
    Public-results fixture для всех 15 зарегистрированных игр доказывает ровно одну непустую bounded
    finale evidence на игру, уникальные ids и лимиты `80/100/280`. В fixture намеренно помещены
    private audio/photo/video/source URLs, transcripts и secret words; ни один маркер не выходит в
    публичный ledger. Второй regression последовательно завершает все 15 игр как отдельные snapshots:
    полный finale ledger переживает cleanup каждого game state, а prompt context сохраняет только
    три последних публичных callback в правильном порядке. Полный regression pack — 547 тестов в
    113 файлах; ESLint, TypeScript и production build проходят. БД, browser smoke, Paper и deploy
    не затрагивались.
54. `content-locale-evidence-projection` (programmatic gate закрыт; bilingual field gate открыт) —
    evidence collector больше не оборачивает русские результаты английскими служебными фразами.
    Все 15 адаптеров теперь используют `party.contentLocale` для собственных title/detail templates:
    Soundscape counts, Track Guess verdict, Spectrum clue, Who/Impostor result, Oracle count,
    Contraband outcome, Toast summary и остальные названия имеют отдельную RU projection с
    корректными формами числительных. Уже публичные AI/participant comments не переписываются и не
    «переводятся» задним числом. Полная RU matrix подтверждает locale-stable evidence ids, тот же
    состав 15 игр, сохранность исходного public result и прежнее исключение private URLs/transcripts/
    secret words. Полный regression pack — 548 тестов в 113 файлах; ESLint, TypeScript и production
    build проходят. БД, browser smoke, Paper и deploy не затрагивались.
55. `russian-finale-crowd-grammar` (programmatic gate закрыт; spoken-delivery gate открыт) —
    no-provider finale fallback теперь корректно говорит о любом поддерживаемом составе 8–30:
    `21 гость вошёл`, `22 гостя вошли`, `25 гостей вошли`; одна команда называется `команда`, а
    несколько — `команды`. Player count перед вставкой bounded до `0–30`, как в provider prompt.
    Если старый public result ссылается на уже отсутствующего игрока, русская evidence использует
    `Гость`, а не английское `A guest`. Boundary regression покрывает 8/11/21/22/25/30, строгую
    finale schema и grounded no-evidence output. Полный regression pack — 549 тестов в 113 файлах;
    ESLint, TypeScript и production build проходят. БД, browser smoke, Paper и deploy не
    затрагивались.
56. `all-game-host-exit-evidence` (programmatic gate закрыт; physical transition gate открыт) —
    аудит реальных путей завершения закрыл разницу между «адаптер умеет собрать улику» и «ведущий
    действительно успевает её сохранить». Все 12 foreground-игр проходят через общий control bar и
    server-authoritative `force-hub`, который захватывает public results до очистки state. Три
    background-игры теперь делают тот же capture прямо в своей финальной server-side transition:
    Smoke Screen при окончательном recap, Contraband при закрытии дела, Tongs of Truth после
    последнего ответа. Поэтому следующий conductor cue сразу видит только что завершённое событие,
    даже если новой foreground-игры ещё не запускали. Повторный finalize/next request остаётся
    idempotent и восстанавливает evidence у старого `results` snapshot. Registry-wide regression
    последовательно проводит все 15 игр через их реальные host completion paths и сохраняет полный
    finale ledger плюс bounded последние три story callback. Полный regression pack — 549 тестов в
    113 файлах; ESLint, TypeScript и production build проходят. БД, browser smoke, Paper и deploy
    не затрагивались.
57. `clean-party-restart-boundary` (programmatic gate закрыт; repeated-event field gate открыт) —
    граница между завершённым и новым вечером теперь очищает не только 12 foreground-веток, но и
    все долгоживущие фоновые состояния: Smoke Screen, Contraband, Tongs of Truth и cross-act
    Oracle memory. Раньше `finish-party → One more game` мог снова показать старые background
    панели, а `start-new-party` переносил их в новый run и заставлял conductor считать будущий шаг
    уже запущенным. Общий typed cleanup теперь используется и финалом, и resume старого finished
    snapshot; `force-hub` намеренно сохраняет background runs внутри того же вечера. Перед очисткой
    finale по-прежнему захватывает public results всех 15 игр, поэтому live state исчезает, а
    связный ledger остаётся. Regression проверяет finish, resume legacy snapshot и полный
    server-authoritative new-party reset со сброшенными route/story/score runtime границами. Полный
    regression pack — 549 тестов в 113 файлах; ESLint, TypeScript и production build проходят. БД,
    browser smoke, Paper и deploy не затрагивались.
58. `reusable-room-private-session-boundary` (programmatic gate закрыт; repeated-event field gate
    открыт) — повторный вечер в той же комнате теперь отделён не только в public snapshot, но и в
    server-only памяти. Party context хранит совместимый optional `sessionStartedAt`; смена акта его
    сохраняет, а `start-new-party` начинает новую сессию. Любой host/player list закрытых
    `party_records` обязан указать `runId` и дополнительно получает server-side session filter;
    generic seal/reveal и Cross Examination используют ту же границу, поэтому старые пророчества,
    фотографии и результаты нельзя прочитать, изменить или включить в новое дело. `start-new-party`
    и ручной `reset-scores` после успешного optimistic
    commit сразу вызывают существующую идемпотентную reconciliation RPC; сетевой retry повторяет
    этот безопасный шаг даже при уже сохранённом command receipt. Finale ledger и field report
    распознают последнюю full-team zero boundary, дополнительно ограничивают события временем
    текущей сессии и потому не смешивают старые титулы/highlights с новым вечером, включая редкий
    zero-sum предыдущий счёт и изменившийся roster. Полный regression pack — 557 тестов в 113
    файлах; ESLint, TypeScript, production build и `git diff --check` проходят. Поставленная на
    паузу БД, browser smoke, Paper, provider и deploy не затрагивались.
59. `ai-budget-restart-isolation` (programmatic gate закрыт; repeated-event provider gate открыт) —
    аудит подтвердил, что отдельного скрытого DB-ledger для AI usage нет: authoritative budget и
    idempotency receipts живут в `room.state.aiRuntime`. `start-new-party` сохраняет настроенный
    лимит, но очищает used credits, input/output tokens, provider requests, failed/blocked calls,
    recent receipts и prepared-deck cache. Поэтому запоздалый provider completion от прошлого
    вечера не может снова начислить расход: его receipt key уже отсутствует в новом runtime.
    Освобождённый deterministic operation id при этом разрешено заново зарезервировать в следующей
    сессии. Regression фиксирует одновременно late-completion no-op, отсутствие восстановленного
    prepared payload и корректную свежую reservation с тем же id. Полный regression pack — 558
    тестов в 113 файлах; ESLint, TypeScript, production build и `git diff --check` проходят.
    Поставленная на паузу БД, browser smoke, Paper, provider и deploy не затрагивались.
60. `multi-host-field-report-convergence` (programmatic gate закрыт; physical takeover gate открыт) —
    private field report больше не зависит от принципа «последний сохранивший победил». Каждый новый
    autosave передаёт bounded base observations; сервер трёхсторонне сливает только действительно
    изменённые поля с актуальным private draft, а recovery drills — по отдельным пунктам. Явная
    очистка текста остаётся изменением и не теряется, автоматические launch signals по-прежнему
    только накапливаются. `payload.updatedAt` теперь монотонная revision даже для двух запросов в
    одну миллисекунду; PostgREST update сравнивает прежнюю JSON revision, а при конфликте до четырёх
    раз перечитывает свежую строку и повторяет merge. Гонка первого insert также переводится в этот
    путь через существующий idempotent replay. Клиент применяет удалённые поля к локальной форме,
    сохраняя правки, сделанные пока запрос был в пути. Полный regression pack — 561 тест в 113
    файлах; ESLint, TypeScript, production build и `git diff --check` проходят. Поставленная на
    паузу БД, browser smoke, Paper, provider и deploy не затрагивались.
61. `late-finale-restart-isolation` (programmatic gate закрыт; repeated-event provider gate открыт) —
    запоздалый AI-эпилог прошлого вечера не может появиться после **One more game**. Finale
    generation получает CAS lease только у finished snapshot; `start-new-party` удаляет captured
    finale вместе с lease, evidence и narrative. Completion перечитывает текущую room revision и
    принимает результат только при совпадении исходного `requestId`, поэтому после restart получает
    conflict/no-op вместо записи старого текста в новую сессию. Уже проверенная AI-budget boundary
    одновременно не возвращает usage старого provider call и разрешает новой сессии собственный
    deterministic operation. Regression проводит точную последовательность `claim old finale →
    start-new-party → late complete` и требует пустой новый finale. Полный regression pack — 562
    теста в 113 файлах; ESLint, TypeScript, production build и `git diff --check` проходят.
    Поставленная на паузу БД, browser smoke, Paper, provider и deploy не затрагивались.
62. `private-record-session-identity` (local schema/code gate закрыт; migration/live race gate открыт) —
    временной фильтр `created_at >= sessionStartedAt` усилен явной identity каждой private record.
    Additive migration `20260719120000` добавляет `session_started_at BIGINT`: записи активной
    сессии получают безопасный backfill из server room state, более старые остаются в legacy
    session `0`, а составной индекс ускоряет room/session/run reads. Любой новый `party_record`
    захватывает session из того server snapshot, который разрешил операцию. Поэтому media или AI
    write, завершившийся уже после **New party**, может иметь новый `created_at`, но всё равно
    остаётся в старой session и не входит в generic host/player list, seal/reveal или Cross
    Examination evidence. Idempotent replay дополнительно проверяет совпадение session; backend
    release-health теперь запрашивает новый столбец и не даст развернуть код до миграции. Полный
    regression pack — 563 теста в 113 файлах; ESLint, TypeScript, production build и
    `git diff --check` проходят. Миграция подготовлена только локально: поставленная на паузу БД,
    browser smoke, Paper, provider и deploy не затрагивались.
63. `self-serve-room-creation-recovery` (programmatic gate закрыт; live failure gate открыт) —
    первый host-facing шаг больше не показывает исходный Supabase/network/schema error. Чистый
    classifier различает потерю сети, rate limit, временную недоступность backend и неизвестный
    сбой, но в каждом случае отдаёт только безопасное следующее действие и явно говорит, что
    выбранный setting, длительность, размер группы и **Tonight's thread** остались в форме для
    повтора. Raw URL, relation, trace и credential-like значения не попадают в UI; сообщение
    объявляется как accessibility alert. Regression закрепляет все четыре класса и sentinel-утечки.
    Полный regression pack — 568 тестов в 114 файлах; ESLint, TypeScript, production build и
    `git diff --check` проходят. Поставленная на паузу БД, browser smoke, Paper, provider и deploy
    не затрагивались.
64. `room-load-recovery-continuity` (programmatic gate закрыт; live disconnect gate открыт) —
    host и speaker больше не превращают краткий refresh/realtime сбой в ложное **Room not found**:
    пока существует последний рабочий room snapshot, он остаётся на экране, а connection state
    может восстановиться без повторного setup. Когда snapshot действительно отсутствует, общий
    recovery-блок различает закрытую комнату, offline-устройство и временно недоступный service,
    предлагает проверить тот же код и оставляет отдельный путь домой. `useRoom` хранит только
    публичные error sentinels, поэтому Supabase payload, URL и schema detail не могут попасть ни в
    host, ни в player/speaker UI. Rejected fetch приватной backup-host ссылки также превращается в
    фиксированную recovery-инструкцию без URL или credential. Existing guest invalid-code repair
    сохранён. Полный regression pack — 572 теста в 114 файлах; ESLint, TypeScript, production build
    и `git diff --check` проходят. Поставленная на паузу БД, browser smoke, Paper, provider и deploy
    не затрагивались.
65. `common-live-error-boundaries` (programmatic gate закрыт; live failure-copy gate открыт) —
    общие host/player/media fallback больше не вставляют неизвестный `.message` в интерфейс.
    Известные случаи остаются точными: permissions объясняют browser settings, network предлагает
    retry, большой файл — более короткую запись, stale round — сверку с host screen, потерянная
    авторизация — повторный вход. Неизвестный host action даёт **try again → pause → reopen**,
    player action — **try again → follow host**, а media capture/upload удерживает человека на
    текущем экране. Старое указание «check Supabase Storage» удалено полностью. Теми же безопасными
    fallback теперь пользуются верхнеуровневые host command, release-health и AI-prewarm ошибки.
    Sentinel regressions запрещают вывод raw relation, URL, device, bucket и upload payload.
    Полный regression pack — 576 тестов в 114 файлах; ESLint, TypeScript, production build и
    `git diff --check` проходят. Поставленная на паузу БД, browser smoke, Paper, provider и deploy
    не затрагивались.
66. `party-game-error-boundaries` (programmatic gate закрыт; injected-failure field gate открыт) —
    все party-native grill/bar host и player views, background rituals и finale score ledger теперь
    переводят direct async catches через общие host/player/media recovery helpers. Host phase
    conflict не печатает server text, а сообщает, что шаг изменился, и ведёт к текущей game panel;
    player stale action возвращает к host screen. Load/prepare/open/send/complete используют
    естественный глагол вместо одинакового «save». Cross testimony остаётся media upload, поэтому
    сохраняет сетевую и file-size диагностику; Grill Oracle сохраняет отдельный безопасный manual
    reading path. Source-level regression перечисляет весь party-native surface и падает, если view
    снова попытается положить raw `Error.message` в rendered state. Полный regression pack — 580
    тестов в 115 файлах; ESLint, TypeScript, production build и `git diff --check` проходят.
    Поставленная на паузу БД, browser smoke, Paper, provider и deploy не затрагивались.
67. `public-api-error-sanitization` (programmatic gate закрыт; live injected-failure gate открыт) —
    24 HTTP routes больше не возвращают произвольный `error.message`. Намеренные domain failures
    создаются через `statusError` с отдельным bounded `publicMessage`: поэтому 400/401/403/404/409,
    media 413 и AI 429 сохраняют полезный status и понятную phase/auth/input формулировку. Любой
    Supabase, Postgres, provider или неизвестный error object сохраняет только корректный HTTP
    status, но body заменяется route-specific fallback. Score ledger больше не помечает raw
    database conflict как публичный; четыре SQL code получают стабильную доменную семантику.
    Validator routes также перестали отдавать raw Zod issue text. Общий responder убирает control
    characters и ограничивает публичную строку 240 символами. Regression обходит всю `src/routes/api`
    и запрещает возврат raw `Error.message` из catch. Полный regression pack — 585 тестов в 116
    файлах; ESLint, TypeScript, production build и `git diff --check` проходят. Поставленная на
    паузу БД, browser smoke, Paper, provider и deploy не затрагивались.

Следующий атомарный срез: `physical-field-tests` — пройти матрицу на 8–12 физических
телефонах и два полных вечера, отдельно измерить quick-start `room created → 8 players ready`,
дать ведущему без доступа к runbook самостоятельно выбрать сценарий по встроенной памятке,
проверить хотя бы один естественный callback к **Tonight's thread** в игре и финале без исполнения
вложенных инструкций, каждый setting и 2/3/4-hour pacing, реальные camera/mic, late join/team
switch, budget exhaustion, prepared-deck latency и реальные AI/STT/TTS/Supabase failures; затем
пропустить schema-v5 отчёты через строгий verifier и принять его production cap по фактической
телеметрии и стоимости.
