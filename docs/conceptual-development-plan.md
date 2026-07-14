# Концептуальный план развития AI Game Hub

Дата: 2026-07-14
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
`Smoke & Neon / Nørrebro` добавляется вторым pack. Никакие названия локаций, время или русские
тексты не должны навсегда зашиваться в общий движок.

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

| Область | Реальное состояние | Вывод |
| --- | --- | --- |
| Игры | 7 игр: Soundscape, Challenge, Photo Hunt, Track Guess, Spectrum Court, Who Among Us, Impostor | Старые документы с числами 4 и 6 устарели |
| Контекст | `Venue = "park" | "bar"`; prompt context используют только Challenge, Photo Hunt и Impostor | Это переключатель локации, а не полноценная модель вечера |
| Room state | Один публично читаемый JSONB с отдельным optional-полем на каждую игру | Секреты хранить нельзя; добавление восьми игр раздует тип и reset-логику |
| Host UI | `HostInner` вручную запускает и рендерит каждую игру; `Lobby` вручную рисует карточки | Нужен registry и orchestration layer |
| Player UI | Такой же ручной conditional router | Каждая новая игра требует синхронных правок в нескольких местах |
| Конкурентные writes | Host отправляет полный snapshot; сервер вручную сливает player data по каждой игре | Стоимость поддержки растёт с каждой новой механикой |
| Очки | Только итоговый `Team.score` | Нельзя честно получить очки по фазам, личные титулы и audit trail |
| AI | Общий gateway есть, но schema validation и prompts распределены по файлам | Нужен типизированный prompt contract и единый context builder |
| Артефакты | Старые `submissions`, `votes`, `photos`, `challenges` читаются публично; media выдаётся signed URL | Подходит для публичных результатов, не подходит для тайных назначений |
| Язык | Текущий UI переведён на английский; creative spec написан по-русски | Язык должен стать настройкой experience, а не новым глобальным хардкодом |
| Качество | lint, TypeScript и 129 unit tests проходят | Начальная точка стабильна; foundation можно делать аддитивно |

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
type ExperienceId = "classic-park" | "smoke-neon-norrebro";
type PartyActId = "classic" | "grill" | "transition" | "bar" | "finale";
type VenueKind = "park" | "grill-site" | "bar";
type ContingencyPlan = "normal" | "bar-only" | "compact";

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

| Приоритет | Игра | Зачем сейчас | Главный риск |
| --- | --- | --- | --- |
| 1 | Grill Oracle | Проверяет всю cross-act архитектуру | sealed state и повторное начисление |
| 2 | Smoke Screen | Делает среду и людей главным контентом | приватные назначения |
| 3 | Toast Syndicate | Быстро использует готовый STT pipeline | темп и качество транскрипта |
| 4 | Still Life | Переиспользует Photo Hunt/vision | subjective AI score |
| 5 | Sommelier | Сильный bar reveal | анонимность владельца |
| 6 | Contraband | Сильная фоновая механика | спорные обвинения и privacy |
| 7 | Tongs of Truth | Естественно встроена в готовку | нельзя обещать lie detection |
| 8 | Cross Examination | Сильный финал и callbacks | сложный UX, аудио и чувствительные данные |

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

| Риск | Защита |
| --- | --- |
| Scope из 8 игр съест качество | Выпускать вертикальными срезами; после Oracle провести live test до следующей волны |
| Сетка из 15 игр перегрузит host | Curated playlist + `Next recommended`; библиотека вторична |
| Full-state writes потеряют player data | Новые игры только через server commands и idempotency |
| Секреты утекут через realtime | Server-only `party_records`, filtered endpoints, privacy tests |
| AI спорно определит победителя | Human vote/deterministic formula; AI bonus capped и прозрачен |
| «Детектор лжи» создаст ложное доверие | Явно театральная формулировка; оценивается конкретность ответа |
| Русская спека конфликтует с английским UI | Раздельные `uiLocale` и `contentLocale` в experience pack |
| Плохая погода уничтожит программу | Contingency route bar-only, выбранный до старта или host override |
| Аудио/vision затормозят вечер | Pre-generation, короткие media limits, timeout/fallback, manual verdict |
| История вечера раздует room JSON | Public projection + private records; media только в Storage |

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
