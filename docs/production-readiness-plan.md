# План стабилизации и подготовки к проду

Дата последней проверки: 2026-07-19

## Acceptance-матрица продуктовой цели

Цель: новый ведущий без разработчика за две минуты запускает цельный AI-сценарий на 2–4 часа
для 8–30 человек в парке, баре, доме или на фестивале; участники, предметы и события вечера
возвращаются в играх, тайных заданиях, переходах и общем финале.

| Обещание | Что уже доказано локально и автоматикой | Что ещё нужно доказать |
| --- | --- | --- |
| Самостоятельный запуск за 2 минуты | Landing собирает setting, 120/180/240 минут, размер группы и Tonight's thread; host получает встроенный brief, один launch signal, QR и private backup link. Readiness считает время от настройки до восьмого игрока и первого cue. Browser matrix ранее уложилась в 8.488–49.093 секунды. | First-time host должен без подсказки и без runbook пройти тот же путь на физических телефонах. |
| 2–4 часа | Контрактный тест проходит все 12 комбинаций `4 setting × 3 duration`; сумма route steps всегда ровно 120, 180 или 240 минут. | Сверить реальный pacing с обещанием в пределах ±15%. |
| 8–30 участников | Единые границы `MIN_ROOM_PLAYERS=8` и `MAX_ROOM_PLAYERS=30` используются setup, join-capacity, readiness и release audit. | Подтвердить минимум восемь готовых реальных телефонов в каждом полевом прогоне. |
| Парк, бар, дом, фестиваль | Для каждой среды есть отдельный experience pack, persona, environment context, комплект оборудования и три маршрута. | Пройти все четыре setting физически. |
| Связная история | Tonight's thread безопасно входит в prompt context; bounded public evidence накапливает конкретных участников, предметы, реплики и игровые события; conductor возвращает последнюю улику в следующем переходе. | Наблюдатель должен отметить естественный callback в игре и отсутствие instruction following. |
| Игры, секреты и переходы | В registry есть все восемь party-native игр; Smoke Screen и Contraband используют private records, а каждый quick-start route содержит secret assign → минимум 30 минут живой игры → reveal. Conductor ведёт следующий cue без внешнего расписания. | Проверить late join, refresh, team switch и recovery на реальных устройствах. |
| Запоминающийся общий финал | Finale собирает bounded evidence из legacy и party-native игр, требует реальные evidence ids, показывает одинаковый epilogue host/player и сверяет score ledger. | В каждом физическом прогоне нужен grounded finale и наблюдаемый callback к Tonight's thread. |
| Без разработчика во время вечера | UI содержит backup-host handoff, manual AI mode, pause/resume, retry, skip/hub и privacy-safe recovery; release audit требует `sqlStateEdits=none`. | Два полных вечера должны завершиться без SQL/state repair и пройти schema-v5 verifier. |

Программная часть цели закрыта: `585` тестов в `116` файлах, TypeScript, ESLint, production build
и `git diff --check` проходят. Финальный acceptance gate теперь состоит только из внешних
доказательств:

1. После снятия паузы с БД применить `20260719120000`, затем получить зелёные
   `bun run verify:backend` и release health.
2. Собрать минимум четыре schema-v5 физических отчёта за два разных вечера: все четыре setting,
   все три длительности, 8–30 участников и не меньше восьми проверенных телефонов на прогон.
3. Получить `PASS` от `bun run verify:field-reports`; этот verifier одновременно проверяет
   двухминутный запуск, автономность first-time host, pacing, connected finale, приватность,
   recovery drills, ledger и provider-cost calibration.

## Текущее состояние

- Production URL: `https://ai-game-hub-tau.vercel.app`.
- Production deploy идет через Vercel/Nitro prebuilt output из GitHub Actions `Deploy Vercel`.
- GitHub repository: `https://github.com/lamapony/ai-game-hub`, visibility `PUBLIC`.
- Production build проходит: `bun run build`.
- TypeScript-проверка проходит: `bunx tsc --noEmit`.
- ESLint проходит без ошибок и предупреждений: `bun run lint`.
- `.env` и `.env.local` исключены из git; публично коммитится только `.env.example`.
- На linked Supabase target 2026-07-16 применены `20260715143000` (private party memory),
  `20260715151500` (score ledger) и идемпотентная `20260716120000`, которая восстановила и
  приватизировала drifted `recordings` bucket и повторно удалила legacy anon policies.
  `supabase migration list` подтверждает совпадающие local/remote versions для всех миграций.
  Авторизованный `bun run verify:backend` возвращает `READY` по private memory, score ledger,
  private storage и AI runtime. Ready-backend browser smoke создал комнату `TGZN`, подключил восемь
  изолированных игроков, получил зелёный host readiness за 14.801 секунды, серверно сохранил cue
  `park-arrival-120` после **Start the party** и удалил точную комнату.
- Локальная additive migration `20260719120000` добавлена после этой проверки и намеренно ещё не
  применена: пользователь поставил БД на паузу. Перед следующим deploy обязательны
  `supabase db push` и обновлённый `bun run verify:backend`; release gate теперь читает
  `party_records.session_started_at` и останется красным на старой схеме.
- 2026-07-18 production alias продвинут на grounded-story-thread deployment
  `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA`; проверенный field-report-draft deployment
  `dpl_5CvFoV599PtuJJJywctxJu4dWmE5` сохранён как ближайшая точка отката. `vercel inspect`
  показывает `target=production`,
  `status=Ready`, а публичный URL отвечает HTTP 200. Полная удалённая ready-backend matrix прошла
  `park/120/8` (`KJ3H`, 10.219 с), `bar/180/8` (`N5WA`, 8.556 с), `home/240/8` (`4W3Y`, 8.488 с) и
  `festival/180/30` (`JX8Y`, 49.093 с). Каждый сценарий скопировал приватную backup host-ссылку,
  авторизовал новый storage-isolated browser и очистил credential fragment, дождался всех игроков,
  сохранил первый route cue, скачал schema-v2 privacy-safe JSON field report с
  `runKind=automated` и `hostHandoff=verified`, затем удалил точную комнату. Повторные
  `verify:backend` и `supabase db push --dry-run` подтвердили READY и отсутствие ожидающих миграций.
  Production journey `WT8V` достиг readiness за 12.920 секунды, прошёл все
  шесть предфинальных шагов park/120, вернул Soundscape evidence в одинаковый host/player finale и
  удалил комнату. Два поздних Challenge/Photo Hunt AI write получили safe `skipped=true` уже при
  активных Photo Hunt/Who Among Us; runtime 500-ошибок не зафиксировано.
- Новый self-serve host brief выводит до создания комнаты и в host readiness точный состав
  выбранного route, понятные медиатребования и venue-specific комплект. Setup-only Chrome matrix
  прошла `park/120/8`, `bar/180/8`, `home/240/8`, `festival/180/30`; комнаты `PTBJ`, `44L4`, `J5C4`,
  `BFUG` удалены точечно. После deploy удалённая matrix повторила тот же контракт и удалила `PZNG`,
  `NMHN`, `Q3TL`, `YP7R`. Desktop/mobile visual QA, unit tests, lint, TypeScript и production build
  проходят. Физически ещё нужно доказать, что новый ведущий обходится только этой памяткой.
- Новая публичная деталь **Tonight's thread** ограничена 160 символами, хранится в room/party
  context и подмешивается во все party-mode AI prompts только после явной safety-границы как
  JSON-quoted untrusted flavor. Local matrix сохранила её в `ZXWL`, `8VTN`, `AFAB`, `4VDX`;
  production matrix на текущем alias повторила контракт в `Q7H2`, `RQWM`, `UKRM`, `VU7N`. Все
  комнаты удалены по точному `roomId`. Физический gate требует естественного callback в игре и
  финале без исполнения текста как инструкции.
- Новый launch signal заменяет ложное «One action left» одним крупным глаголом и одним действием:
  **REBUILD.**, **CHECK.**, **FIX.**, **REDUCE.**, **INVITE.** или **START.** Unit tests покрывают
  route mismatch, checking/degraded/error, 0/7/8 и 29/30/31 игроков. Local комнаты `9XDZ`, `QEHA`,
  `KD7V`, `F3SV`, `W4HY` и production `7CEG`, `BF7K`, `LTH7`, `XH98`, `9B3K` прошли setup/full
  gates и были удалены. `9B3K` достиг readiness за 11.864 секунды, сохранил первый cue и выгрузил
  field report. Физически ещё требуется проверить, что новый ведущий правильно понимает launch signal без
  runbook.
- Field-report schema v3 добавляет privacy-safe доказательства `hostExperience`, независимого
  прохождения launch signal, callback к Tonight's thread в игре/финале и отсутствия instruction
  following. Исходный seed не сериализуется. Verifier требует эти условия во всех четырёх setting
  и хотя бы одного first-time host; schema v2 больше не может закрыть release gate. Local `JTRC` и
  production `725Q` выгрузили v3 через настоящий host UI, сохранили cue и были удалены точечно.
- Field evidence coach добавляет отдельную календарную дату события, считает 18 обязательных
  PASS-деклараций и показывает одно следующее действие. Неполный PASS нельзя скачать, но pending и
  FAIL остаются доступны. Audit теперь доказывает два вечера по двум различным датам, а не по
  свободным названиям. Local `8KFF` и production `4RDQ` проверили блокировку, v3 download,
  приватность и cleanup; `4RDQ` достиг readiness за 12.066 секунды.
- Первый мобильный viewport теперь явно разделяет **Host a party** → двухминутная настройка и
  **Join a party** → ввод room code, поэтому fallback-вход гостя не спрятан после всей host-формы.
  Browser smoke кликает и проверяет оба anchor перед каждым сценарием. 390×844 visual QA прошла;
  local `MUVQ` и production `59BL` завершили восьмипользовательский start/report/cleanup flow за
  9.034 / 13.505 секунды readiness.
- Один room-code contract теперь связывает генератор, root fallback и `/play`: ровно четыре
  символа без `I/O/0/1`, paste-normalization для пробелов/дефисов, disabled invalid state,
  Enter/Go submit и autofocus на dedicated player screen. Browser smoke проверяет `O0I1` и
  `a-b c d → ABCD`; local `ZQ8T` и production `2EAD` завершили start/report/cleanup за 12.808 /
  13.747 секунды readiness. `vercel@56.3.1` закреплён как devDependency после отказа transient CLI,
  поэтому deploy использует локальный lockfile-бинарник.
- Guest recovery на `/play/:code` различает неверный формат, отсутствующую комнату и временный
  lookup/network failure. Код остаётся в редактируемом autofocus-поле; исправленный код можно
  отправить на месте, а тот же — проверить повторно без возврата на landing. Строгая validation
  больше не принимает пять символов через truncation. Mobile 390×844 QA прошла invalid, not-live,
  offline и restored-network состояния; browser smoke закрепил прямой `/play/O0I1` regression.
  Production `BRSM` завершил private handoff, восемь joins, persisted cue, report и cleanup за
  15.604 секунды readiness на deployment `dpl_GR6xb9fg7fESkubwbqvoucb7jnCt`.
- Room capacity теперь имеет один server-authoritative максимум 30: новый 31-й player получает
  HTTP 409 и отдельный recovery screen, существующая identity безопасно rejoin при 30/30, а host
  может убрать duplicate/inactive phone только до первого cue. Production `9Z54` подключил 30
  изолированных игроков быстрыми группами по четыре, проверил UI и direct-server overflow,
  достиг readiness за 86.452 секунды, сохранил cue `festival-rally-180`, выгрузил privacy-safe
  report и был удалён. Первый полностью одновременный Playwright burst `F2ZU` получил Vercel
  Security Checkpoint, поэтому automation больше не имитирует атаку 30 синхронными POST. Текущий
  deployment — `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm`; ближайший rollback —
  `dpl_GR6xb9fg7fESkubwbqvoucb7jnCt`.
- Приватный field-report draft теперь переживает refresh и передачу управления backup-host.
  Сервер хранит только bounded observations в host-only `party_records`, привязанных к
  текущему `quickStart.configuredAt`; player API и public room state их не видят, новый party не
  наследует старый draft. Autosave выполняется последовательно и не позволяет позднему старому
  запросу затереть новую редакцию. Local `ZQNS` и production `DCUT` прошли восемь joins, readiness
  за 13.176 / 23.372 секунды, persisted cue, save, primary-host refresh, recovery на изолированном
  backup-host, privacy-safe download и точечный cleanup. Desktop и 390×844 QA не нашли clipping;
  полный regression pack после этого среза — 487 тестов в 106 файлах.
- Текущий field-report schema v5 автоматически хранит first-seen launch-signal sequence без
  participant data или текста истории. Private draft v3 мигрирует v1/v2 без выдуманной истории и
  объединяет сигналы primary/backup host монотонно. PASS-readiness требует `INVITE.` и `START.`
  отдельно от ручной классификации понимания; aggregate verifier выводит отдельный автоматический
  gate. БД и публичный room state не менялись. Локально проходят 513 тестов в 110 файлах, lint,
  TypeScript и production build; browser smoke не запускался при остановленной БД.
- Grounded story thread переносит до трёх последних уже публичных reveals в следующие party-mode
  AI prompts через bounded JSON-quoted untrusted block. Internal evidence ids, transcripts, media,
  private records и hidden assignments туда не входят; prompt разрешает не больше одного
  естественного callback и не может менять schema, rubric или safety. JSONB key reorder больше не
  откатывает валидный party в classic, prewarm учитывает текущую публичную историю, а собственный
  экран host немедленно принимает подтверждённый command state. Local `UJ2K` и production `ATDJ`
  доказали перенос одного Soundscape evidence id в Challenge, Photo Hunt и Who Among Us prompt
  context и в одинаковый host/player finale; readiness 41.342 / 48.507 секунды, обе комнаты
  удалены. Первый production probe `EB2D` подтвердил Challenge context, но поймал транзиентный hub
  timeout и также был удалён; точный повтор прошёл. Полный regression pack теперь 492 теста в 107
  файлах. Текущий deployment — `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA`; ближайший rollback —
  `dpl_5CvFoV599PtuJJJywctxJu4dWmE5`. Физическое наблюдение естественности callback остаётся
  обязательным.
- Soundscape в универсальных quick-start pack теперь использует серверный act environment,
  `contentLocale`, Tonight's thread и публичную story evidence при генерации тем, пространственного
  микса и verdict. Bounded имена/STT summary сериализуются как quoted data, signed clip URL в prompt
  не отправляется, а speaker slots в party-mode называются нейтрально и не переносят park-персону в
  дом или на фестиваль. Venue-specific offline темы покрывают park/bar/home/festival/grill на EN/RU;
  classic DIMAS path сохраняет старую английскую persona и fallback. Локально проходят 518 тестов в
  111 файлах, lint, TypeScript и production build. БД и browser smoke при остановленной БД не
  запускались; физический audio/STT прогон остаётся открытым.

## Уже закрыто

- Приведен формат исходников к Prettier.
- Убраны lint-ошибки в `VideoRecorder` и host share flow.
- Server functions переведены с deprecated `.inputValidator()` на `.validator()`.
- В `Orchestra` устранен риск stale callback при срабатывании scheduled audio cues.
- Media helpers вынесены из React-компонентов в отдельные utility-модули.
- Добавлены fallback-задания, fallback-судейство и graceful STT fallback для AI outage.
- Fallback-режимы AI теперь помечаются в room state и показываются ведущему в Challenge,
  Photo Hunt и Soundscape, чтобы аварийная логика не выглядела как обычный AI-вердикт.
- Добавлены host controls для активной игры: pause/resume, skip phase, restart game, force back to hub.
- Добавлен protected cleanup endpoint и GitHub scheduled workflow для старых комнат и uploads.
- Добавлены понятные player-facing ошибки для camera, microphone, photo read и media upload failures.
- Добавлен базовый `bun test` regression pack для host controls и player-facing media/upload errors.
- Добавлен lightweight structured JSON logging для AI gateway, API routes и cleanup endpoint.
- Structured logging расширен на room lifecycle events и upload failures в Soundscape,
  Challenge и Photo Hunt без signed URL/media body/host secret.
- Добавлен retry/backoff для transient AI provider errors и Supabase Storage upload/signed URL calls.
- Добавлены unit-тесты для базового контракта `src/lib/room.ts`: room code/id generation,
  create/fetch/update room flows, duplicate-code retry и persisted player identity.
- Game launch transitions вынесены в pure helpers и покрыты regression tests:
  Soundscape/Challenge/Photo Hunt start, cleanup старого game state и минимальное число игроков.
- Добавлены pure sanitizers и regression tests для AI JSON responses: topics/tasks, challenge
  judgement, soundscape mix/judgement и photo ranking.
- Добавлен простой `eventProfile` config без dashboard: brand/SEO, default host name, storage
  prefix, host persona и speaker slot names.
- Добавлен production env preflight для deploy workflow: проверяет обязательные GitHub
  vars/secrets до build и пишет `.deploy.env` с defaults для optional OpenAI настроек.
- Тяжелые Host/Player views для Soundscape, Challenge и Photo Hunt вынесены в lazy imports:
  warning Vite про client chunk `index` выше 500 kB больше не воспроизводится в production build.
- Добавлен best-effort per-IP rate limiting для AI-затратных API endpoints `/api/speak` и
  `/api/transcribe` с 429/Retry-After headers и regression tests.
- Добавлен heartbeat для `/speaker/$code`: ведущий видит свежие, stale и offline дополнительные
  колонки, а readiness логика покрыта unit tests.
- Добавлен GitHub production config audit: `bun run verify:github-prod --repo=lamapony/ai-game-hub`
  проверяет имена обязательных repo vars/secrets без чтения их значений.
- Fast Refresh правило отключено только для `src/components/ui`, где shadcn/ui ожидаемо экспортирует variants рядом с компонентами.
- Локальный `.codebase-memory/` исключен из публичного репозитория.
- Проект отвязан от Lovable/Cloudflare Workers для production path: deploy выполняется напрямую через
  GitHub Actions -> Vercel project `ai-game-hub`.
- Vercel project linked locally; runtime env для Production/Preview синхронизирован с GitHub Actions env.
- Первый Vercel production deploy выполнен и alias назначен на `https://ai-game-hub-tau.vercel.app`.
- GitHub `CLEANUP_URL` настроен на production alias; cleanup workflow dry-run проходит на production.
- Критические host controls и управление командами переведены с клиентских state snapshots на
  server-authoritative идемпотентные команды с retry тем же command id при transient failure.
- Room realtime показывает host/player состояние `live/reconnecting/offline`, заново читает свежий
  snapshot после возврата вкладки и восстановления сети и сохраняет экран при временной ошибке.
- В Live safety card добавлен room-level manual AI mode: prompt runtime и Soundscape пропускают
  provider-вызовы и используют schema-validated fallback; score и private records не сбрасываются.
- Все text/vision/STT/TTS provider-вызовы учитываются в server-authoritative per-party ledger.
  Ведущий видит credits, provider requests и token usage, выбирает cap 60/120/240; повтор одного
  operation id не списывает бюджет дважды, а исчерпание cap включает deterministic fallback до
  старта внешнего запроса. `Start new party` очищает usage, сохраняя выбранный cap.
- Conductor умеет заранее подготовить следующий AI deck для Smoke Screen, Contraband, Toast
  Syndicate и Still Life. Payload хранится только в host-visible `party_records`; public room state
  получает cache key, act, participant count, timestamp и fallback flag. При смене roster/context
  кеш автоматически перестаёт считаться совместимым, а game lifecycle сначала использует
  совместимый prepared payload и только затем вызывает provider.
- Landing создаёт валидированный quick-start сценарий для парка, бара, дома или фестиваля на
  2 / 3 / 4 часа и 8–30 ожидаемых участников. Programmatic tests подтверждают exact-duration для
  всех 12 комбинаций. Host readiness проверяет маршрут, QR и восемь реально подключившихся
  игроков. При полном release-health ведущий получает одно действие `Start the party`: typed
  `begin-run-step` принимает только следующий interlude, ставит server time, не сбрасывает его при
  retry и очищает active cue после completion. Classic free play остаётся совместимым режимом.
- Host readiness теперь включает авторизованный server-side release check: доступны ли
  `party_records`, `score_events`, приватный `recordings` bucket и `OPENAI_API_KEY`. Ответ содержит
  только bounded booleans и безопасные инструкции; raw Supabase/provider errors и env values не
  уходят в браузер. При `degraded` программа и classic free play остаются доступны, но обещание
  полного сценария и `Ready inside 2 minutes` не становятся зелёными.
- `bun run test:rehearsal` проходит все 12 quick-start маршрутов с 8 и 30 участниками через
  server-authoritative host commands. Каждый interlude проходит `begin → active → complete`;
  lifecycle completion отдельно закрывает поздние Smoke reveal, Oracle verify, compact Tongs и
  finale, поэтому завершённый этап не возвращается в conductor. Каждая из 24 репетиций дополнительно
  строит schema-valid grounded epilogue fallback, включая маршрут без накопленных callbacks;
  маршруты с Soundscape доказывают, что ранняя улика переживает последующие запуски игр.
- Перед `force-hub` и каждым новым foreground launch сервер атомарно накапливает bounded public
  evidence, а `finish-party` захватывает результат последней игры. Conductor показывает последнюю
  сохранённую улику в следующем interlude как grounded host callback. Server-authoritative finale
  endpoint берёт CAS lease, списывает один budget operation, проверяет evidence ids AI-ответа и
  сохраняет один общий connected epilogue. Host и player видят тот же case file; transcript,
  storage/media URL, secret words и private records исключены тестами.
- Добавлен host-side **Field-test report**: `.md`/`.json` можно скачать из Live safety без CLI.
  `quickStart.startedAt` фиксируется сервером при первом scripted cue и не исчезает после его
  completion; `finishedAt` фиксируется на finale и очищается при resume/new party. Экспорт отдельно
  считает восьмой join, launch latency, фактическую длительность, device readiness, AI
  credits/tokens/failures, manual-fallback time и агрегаты ledger. Он не сериализует raw room state,
  имена/id людей и команд, private records, transcripts/media, score reasons/rubrics, prompt
  operation/cache keys или finale evidence text; sentinel-тесты фиксируют эту границу. Legacy
  full-state merge сохраняет текущие server-owned `party`, `quickStart`, `aiRuntime` и finished
  status, поэтому поздний stale UI write не стирает timing/usage уже после события.
- Field-report schema v3 сохраняет явный тип доказательства (`physical`/`automated`), декларации
  no-SQL/state-repair, no-secret-incident и pacing-reviewed. `bun run verify:field-reports` строго
  проверяет набор физических JSON против release gate: четыре setting, 120/180/240 минут, два
  event labels, уникальные комнаты, 8–30 участников/восемь ready phones, launch до 120 секунд,
  finished finale, backend health, полный reconciled ledger и privacy boundary. Он не принимает
  browser smoke как физический вечер и рассчитывает рекомендацию 60/120/240 по observed
  same-currency cost с 20% headroom. V3 дополнительно требует independent launch-signal use,
  first-time host sample и безопасный Tonight's-thread callback в игре и финале для каждого run;
  raw seed не экспортируется. Форма монтируется заново по server `configuredAt`, поэтому **New
  party** не наследует human declarations предыдущего run.
- Добавлен private host handoff без разработчика: Live safety копирует full-control backup link
  только по явному действию, credential находится в fragment и очищается из address bar до
  server-side проверки. Auth-only endpoint возвращает только room id/code, invalid/expired links
  получают безопасную ошибку без echo секрета, а успешный доступ сохраняется для code и room id.
  Новые комнаты получают 192-bit crypto-random host secret. Local smoke `AMHE` открыл ссылку в
  полностью изолированном context, подтвердил тот же host runtime и отсутствие fragment, после
  чего прошёл обычный 8-player launch/report/exact-cleanup flow. Field report сохраняет bounded
  `hostHandoff`, а release verifier требует `verified` для физического PASS.
- Локальный `bun run smoke:browser:matrix` проходит реальный landing и проверяет сохранённые
  venue/duration/expected/joined для `park/120/8`, `bar/180/8`, `home/240/8` и
  `festival/180/30`. Последний прогон создал `P3P3`, `UDJV`, `H7JY`, `5C57`; зелёный host
  readiness получен за 11.808 / 7.401 / 7.150 / 17.968 секунды, каждый сценарий проверил private
  host handoff и field report, затем удалил комнату по точному `roomId`. Тест требует явного
  разрешения на mutation и запрещает remote target по умолчанию.
- Player-action endpoint использует per-room runtime queue перед optimistic CAS: это убирает
  локальные retry storms, не отменяя межинстансную защиту. В local festival burst `UJDY` все 30
  joins завершились с `attempts=1`, без conflicts и с maximum queue wait 4.297 секунды. На
  production в `JX8Y` все 30 уникальных joins завершились за 5.822 секунды server time; maximum
  queue wait 5.582 секунды, maximum CAS attempts 8 вместо 15 на предыдущем deployment.
- Исторический pre-migration `bun run smoke:browser:backend` создал комнату `PPSY`, подключил восемь
  изолированных игроков и за 10.95 секунды подтвердил `program-ready=true`,
  `backend-status=degraded`, `ready=false`, видимый `Backend setup required` и disabled launch
  control; точная комната удалена.
- После миграций обычный ready-backend smoke создал `TGZN`, подключил восемь игроков, достиг
  `Ready inside 2 minutes` за 14.801 секунды, нажал **Start the party**, дождался persisted active
  cue `park-arrival-120` и удалил точную комнату. Ни SQL-, ни room-state repair не понадобились.
- После promotion deployment `dpl_7r8KHTs1bjZFZbYwN5innr721aZa` тот же ready-backend browser flow
  пройден прямо на публичном production alias: комната `JFN9`, восемь игроков, readiness за
  7.742 секунды, persisted cue `park-arrival-120`, точечный cleanup. Предыдущий production
  deployment записан как rollback target; автоматизированный прогон не закрывает physical field gate.
- Field-report deployment `dpl_4eFeLjomgPRifybzdpWHe6ZZwdVV` прошёл расширенный production flow:
  `D39M`, восемь игроков, readiness 11.317 секунды, persisted first cue, скачанный через UI JSON с
  server launch timestamp, roster/ledger evidence и privacy flags, проверка отсутствия имён
  тестовых игроков, точечный cleanup. Предыдущий `dpl_7r8KHTs1bjZFZbYwN5innr721aZa` сохранён как
  rollback target; physical field gate остаётся открытым.
- Конкурентные player actions используют bounded CAS retry до 32 попыток с jittered backoff:
  первый browser-прогон воспроизвёл потерю двух из восьми join при трёх попытках, повторный прогон
  после исправления сохранил все восемь, а 30-player пик завершился без потерь максимум за 18
  попыток на запрос.
- `bun run smoke:browser:resilience` на реальной комнате подтверждает: host refresh сохраняет
  авторизацию/readiness, player refresh сохраняет id, team switch не меняет identity, host и player
  возвращаются `offline → live` с прежним state, поздний девятый join обновляет roster и переживает
  refresh. Provider-required прогон за 15.06 секунды достигает lobby readiness, проходит первый
  interlude, запускает Soundscape и сохраняет provider-generated `soundscape/topics` через
  launch-time host refresh без fallback или второго provider request. Темы остаются теми же через
  player refresh, pause → host refresh → resume и повторные `offline → live`. Десятый игрок
  подключается уже во время раунда и сохраняет identity после refresh; `To hub` открывает
  `park-challenge-180`, не возвращая завершённый `park-soundscape-180`. Каждая комната удаляется по
  точному `roomId` в `finally`.
- `bun run smoke:browser:media` с управляемыми fake media devices проходит полный resilience flow,
  начиная в lobby с self-serve phone preflight: deny фиксируется на сервере и виден host как
  blocked, grant+retry меняет тот же player на ready, а refresh сохраняет identity и результат.
  Затем стабильный player id проходит Soundscape microphone deny → понятная ошибка → grant →
  retry → запись и реальную загрузку audio blob. На следующем шаге маршрута случайный Challenge
  operator с тем же identity проходит camera+microphone deny → grant → retry и открывает video
  preview. Затем Photo Hunt принимает кадр через native capture input, делает canvas-downscale,
  загружает JPEG и сохраняет artifact с тем же player identity; маршрут доходит до следующего
  interlude, точная комната удаляется. Прогон обнаружил и закрыл две StrictMode AI-гонки: поздний
  дублированный ответ больше не откатывает Challenge после `force-hub` и Photo Hunt после старта
  охоты. Это не закрывает проверку реальных iOS/Android устройств, background/resume и сети.
- `bun run smoke:browser:journey` проходит полный park/120 run-of-show через UI, а не только первый
  cue: завершает два interlude, запускает Soundscape, Challenge, Photo Hunt и Who Among Us,
  переводит conductor в finale act и открывает story-first финал при нулевом счёте. Локальная
  комната `ALGK` и production-комната `WT8V` вернули один и тот же Soundscape evidence id в
  transition callback, host finale и player finale, после чего были удалены. Guarded host-state
  writes превращают поздние AI-ответы Challenge/Photo Hunt в idempotent `skipped=true`, поэтому
  быстрая contingency-навигация больше не воскрешает старую игру.
- Все 12 quick-start routes теперь несут один длинный секретный сюжет Smoke Screen: приватная
  раздача идёт в начале, анонимное раскрытие — минимум через 30 минут и до финала. Park, home и
  festival используют собственные предметы и социальные возможности места; single-act lifecycle
  не требует выдуманного перехода в бар, а двухактный Smoke & Neon сохраняет grill → bar границу.
  Точные 120/180/240 минут не изменились. 24 детерминированные репетиции на 8/30 игроков доказывают
  завершение маршрута и попадание recap в finale evidence. Полный локальный контур: 522 теста в
  112 файлах, TypeScript, ESLint и production build. БД и browser smoke не запускались из-за
  поставленной пользователем паузы.
- Первый Smoke Screen deck теперь прогревается автоматически во время live arrival interlude во
  всех 12 quick-start routes. Ключ private prewarm record включает venue, locale, AI mode,
  Tonight's thread, public callbacks, roster и `quickStart.configuredAt`, поэтому смена истории,
  режима или новый запуск в той же комнате не переиспользует stale missions. Ручная подготовка
  остаётся retry, а не обязательным знанием ведущего. Локальный контур: 524 теста в 112 файлах,
  TypeScript, ESLint и production build; live provider latency ещё требует browser/field gate после
  снятия паузы с БД.
- На восьми quick-start routes, где Soundscape идёт сразу после фоновой раздачи секретов, тот же
  arrival interlude теперь заранее готовит только три общие venue-aware темы. Private payload не
  попадает в room state и не запускает `topicsEndsAt`: voting timer создаётся только CAS-записью
  после фактического старта Soundscape. На четырёх маршрутах без ближайшего Soundscape лишнего
  запроса нет. Подготовленная schema-valid запись потребляется до обычного provider call, а
  roster-independent identity переживает late join, сохраняя stale guards для venue, locale, act,
  AI mode, публичной истории и нового quick-start run. Локальный контур: 526 тестов в 112 файлах,
  TypeScript, ESLint и production build; БД и browser smoke остаются на паузе.
- Soundscape mix и финальный AI verdict больше не ждут команды последовательно. Общий bounded pool
  выполняет максимум две team-задачи одновременно и сохраняет исходный порядок результатов:
  обычные две команды проходят одну latency-волну, а расширенный состав не создаёт provider burst.
  Ошибка одной команды изолирована local mix/fallback-поведением и не отменяет соседние результаты.
  Budget operation identity использует стабильный `teamId`, а не редактируемое название команды,
  поэтому одинаковые названия не коллидируют. Локальный контур: 529 тестов в 113 файлах,
  TypeScript, ESLint и production build; фактический p50/p95 выигрыш остаётся измерить после снятия
  паузы с БД.
- `home/120` больше не оставляет первый видимый AI wait после раздачи секретов: live arrival cue
  автоматически готовит первый вопрос **Who's the Bot?** вместе со Smoke Screen deck. Остальные 11
  quick-start routes не тратят на него запрос. Ответ хранится только в host-only `party_records`,
  потребляется только в первом раунде после повторной schema validation и инвалидируется при смене
  venue, locale, act, AI mode, Tonight's thread, public evidence или quick-start run; late join не
  инвалидирует общий вопрос. Server-authoritative history не даёт повторно использовать его в
  следующих раундах. Offline fallback теперь отдельно локализован для bar, home, festival, park и
  grill-site вместо прежнего ложного дыма/гриля во всех non-bar сценариях. Локальный контур: 531
  тест в 113 файлах, TypeScript, ESLint и production build; live provider latency остаётся измерить
  после снятия паузы с БД.
- После завершённого scripted route step conductor автоматически готовит следующий поддерживаемый
  AI payload уже после фиксации доступной public story evidence. Первым подключён Photo Hunt: в
  девяти park/home/festival маршрутах его первое задание может быть готово до нажатия launch, но
  запуск не блокируется и при miss/stale остаётся штатный provider/fallback путь. Host-only record
  потребляется только при пустой server-authoritative истории заданий и после strict schema parse;
  второй раунд и payload с extra fields его не принимают. Cache переживает late join, но меняется
  вместе с venue, locale, act, AI mode, Tonight's thread, public callbacks или новым quick-start run.
  EN/RU offline decks теперь различают все пять venue вместо переноса grill-реквизита в дом и на
  фестиваль. Локальный контур: 534 теста в 113 файлах, TypeScript, ESLint и production build;
  фактический cache-hit/latency gate остаётся на live provider после снятия паузы с БД.
- Восемь внутренних result/recovery-выходов из семи legacy foreground-игр больше не очищают game
  state прямой записью из браузера. Typed `onBackToHub` проходит от host route через registry в
  Soundscape, Challenge, Photo Hunt, Real or AI, Spectrum Court, Who Among Us и Who's the Bot и
  вызывает общую server-authoritative `force-hub` команду. Она атомарно захватывает полный finale
  evidence и bounded последние public callbacks до очистки игры, возвращая host подтверждённый CAS
  snapshot. Regression проверяет прокладку действия во все семь view adapter и одновременную
  сохранность каждого типа legacy result. Локальный контур: 536 тестов в 113 файлах, TypeScript,
  ESLint и production build; БД и browser smoke не запускались из-за поставленной пользователем
  паузы.
- Cross-Examination auto-exit после последней пары и interrupted curation теперь в той же
  server-side transition захватывает все уже публичные pair verdicts до сброса `currentGame`.
  Conductor и post-step AI prewarm поэтому сразу получают новый bounded callback, а не ждут
  следующего foreground launch. Idempotent replay results-state также восстанавливает отсутствующий
  story capture для старой комнаты. Regression покрывает normal finish, dismiss и повторный запрос;
  локальный контур после среза — 537 тестов в 113 файлах. БД и browser smoke не запускались из-за
  поставленной пользователем паузы.
- Scene Challenge теперь автоматически готовит первое story-aware задание сразу после предыдущего
  scripted step: это закрывает все три park маршрута после Soundscape и все три festival маршрута
  после Photo Hunt. Host-only payload использует roster-independent identity, повторно проходит
  strict schema на launch и принимается только при пустой server-authoritative истории задач;
  extra fields, второй раунд или изменённые venue/locale/act/mode/thread/evidence/run получают
  штатный provider/fallback path. Offline deck одновременно разделён на park, bar, home, festival и
  grill-site на EN/RU, поэтому non-grill группа больше не видит дым, фольгу и щипцы. Локальный
  контур после среза — 540 тестов в 113 файлах; live cache-hit/latency остаётся измерить после
  снятия паузы с БД.
- Registry scale-contract теперь запускает все 15 игр при каждом целом размере группы 8–30 и
  проверяет, что launch не меняет roster, foreground/background состояние остаётся корректным, а
  server-assigned participant, speaker и pair ids уникальны и принадлежат текущей комнате. Полные
  participant lists Grill Oracle, Smoke Screen, Contraband и Tongs покрывают весь состав; Tongs
  сохраняет полный speaker order, Cross оставляет всех audience при уникальных 3–4 парах,
  Sommelier ограничивает capture десятью уникальными участниками, Challenge и Toast выбирают
  существующего игрока. Локальный контур после среза — 542 теста в 113 файлах; physical crowd и
  live provider gates остаются внешними.
- Conductor теперь превращает последнюю bounded public evidence в готовую EN/RU реплику ведущего:
  она остаётся видимой во время interlude и переносится прямо к запуску следующей scripted game,
  поэтому связный сюжет не требует импровизации между экранами. Для reveal/finale используются
  отдельные формулировки, пустой detail не выводится. Regression проходит полный переход
  `Kitchen diplomacy → Spectrum Court`; локальный контур после среза — 543 теста в 113 файлах.
  Реальную естественность callback всё ещё должен подтвердить physical host gate.
- Та же host-ready реплика теперь не исчезает в двух ключевых orchestration states: смене локации и
  входе в finale. Transition говорит, какую реальную улику забрать с собой и опечатать; verdict
  возвращает её как Exhibit A перед открытием общего финала. Regression проводит один Soundscape
  callback через `grill → transition → party verdict` и проверяет EN/RU; локальный контур после
  среза — 544 теста в 113 файлах. Естественную подачу вслух ещё проверяет physical host gate.
- Quick-start Tonight's thread теперь остаётся на live host screen с первого cue: conductor делает
  из bounded seed короткую EN/RU opening line для interlude, game, transition, reveal и finale.
  Первая настоящая public evidence автоматически заменяет seed, поэтому маршрут переходит от
  заявленной темы к событиям самой комнаты без ручной импровизации; пустая legacy evidence не может
  стереть рабочий fallback. Локальный контур после среза — 545 тестов в 113 файлах; естественность
  первой реплики и момент handoff остаются частью physical first-time-host gate.
- Registry-wide public-evidence contract теперь покрывает все 15 игр: каждая выдаёт одну непустую
  bounded улику с уникальным id, а fixture с private audio/photo/video/source URLs, transcripts и
  secret words доказывает, что приватный payload не выходит в finale ledger. Последовательный
  15-game regression дополнительно подтверждает сохранность полного ledger после каждого cleanup и
  правильное bounded окно из трёх последних callback для следующих AI prompts. Локальный контур
  после среза — 547 тестов в 113 файлах; качество реальных формулировок остаётся physical gate.
- Public evidence projection теперь следует `party.contentLocale`: deterministic titles и glue для
  всех 15 игр имеют EN/RU варианты, включая числительные и outcomes, при этом уже публичные
  participant/AI comments остаются исходными. RU registry matrix подтверждает неизменные ids,
  полный состав и отсутствие private URLs/transcripts/secret words. Локальный контур после среза —
  548 тестов в 113 файлах; смешанные UI/content locale и естественность речи ещё проверяются в поле.
- Русский no-provider finale fallback теперь грамматически корректен на границах 8–30 и различает
  одну/несколько команд; missing-player label в русской evidence больше не откатывается к `A guest`.
  Boundary matrix проходит 8/11/21/22/25/30, strict schema и grounded empty-evidence finale.
  Локальный контур после среза — 549 тестов в 113 файлах; естественность произнесения остаётся
  physical spoken-delivery gate.
- Реальные host completion paths теперь сохраняют story evidence для всех 15 игр. Двенадцать
  foreground-игр используют общий server-authoritative `force-hub` до cleanup; Smoke Screen,
  Contraband и Tongs of Truth захватывают public result непосредственно при фоновой финализации,
  до возврата управления conductor. Idempotent replay финализатора заодно восстанавливает
  отсутствующую evidence у legacy `results` state. Registry-wide regression проходит все 15
  путей, проверяет полный finale ledger и bounded окно последних трёх callback. Локальный контур
  после среза — 549 тестов в 113 файлах; реальную своевременность и естественность перехода ещё
  проверяет physical host gate.
- Finished-room cleanup теперь охватывает все live game branches: 12 foreground state, Smoke
  Screen, Contraband, Tongs of Truth и Oracle memory. Поэтому `One more game` не возвращает старые
  фоновые панели, а `New party` не переносит их в новый route и не помечает будущие conductor steps
  уже запущенными. `force-hub` внутри текущего вечера по-прежнему сохраняет фоновые runs; на
  финальной границе сначала фиксируется полный 15-game evidence ledger, затем очищается live state.
  Regression покрывает обычный finish, восстановление legacy finished snapshot и
  server-authoritative new-party reset. Локальный контур после среза — 549 тестов в 113 файлах;
  повторный реальный вечер в одной комнате остаётся field gate.
- Повторная вечеринка в том же room id теперь имеет отдельную server-data boundary. Новый
  `sessionStartedAt` сохраняется между актами и обновляется только для нового вечера; private-record
  list требует конкретный `runId`, а server-side session filter также защищает reads, generic
  seal/reveal и межигровые доказательства Cross Examination. После `start-new-party` и
  `reset-scores` host command до ответа идемпотентно
  материализует нулевой score-ledger cut, включая command retry. Finale и field report читают
  только текущий score cycle плюс session-time window, поэтому не наследуют старые awards,
  highlights или zero-sum историю; retired team также не мешает распознать reset. Локальный контур
  после среза — 557 тестов в 113 файлах; повторный реальный вечер остаётся physical field gate.
- AI budget тоже имеет явную границу повторного вечера. Его authoritative usage и idempotency
  receipts хранятся только в `room.state.aiRuntime`, без отдельного исторического DB-ledger;
  `start-new-party` сохраняет cap, но очищает credits, token/provider/error counters, recent usage
  и prepared cache. Поздний completion старого provider request становится no-op, потому что его
  receipt больше не существует, а тот же operation id можно безопасно зарезервировать заново для
  новой сессии. Regression проверяет оба края этой гонки. Локальный контур после среза — 558 тестов
  в 113 файлах; реальный provider completion через restart остаётся physical integration gate.
- Shared field-report draft теперь сходится при одновременной работе основного и backup host:
  клиент отправляет bounded base snapshot, сервер трёхсторонне применяет только локально изменённые
  поля и сливает recovery drills по ключам. Монотонный `payload.updatedAt` используется как
  PostgREST compare-and-swap revision; конфликт перечитывает свежую строку и повторяет merge, а
  concurrent first insert входит в тот же путь через idempotent replay. Ответ сервера аккуратно
  добавляет удалённые изменения в открытую форму, не стирая более новые несохранённые локальные
  правки. Regression покрывает независимые edits, явную очистку и same-millisecond revision.
  Локальный контур после среза — 561 тест в 113 файлах; реальный двухустройственный takeover
  остаётся physical field gate.
- Запоздалый finale provider response теперь имеет отдельный restart regression. Генерация может
  claim’ить lease только в finished room; `start-new-party` очищает finale/lease/evidence, а
  completion после повторного чтения комнаты требует прежний `requestId`. Последовательность
  `claim → new party → late complete` возвращает no-op/conflict и не вставляет старый эпилог в
  новую сессию; AI-runtime reset отдельно не возвращает его usage. Локальный контур после среза —
  562 теста в 113 файлах; реальный provider race остаётся physical integration gate.
- Private party memory теперь несёт exact `session_started_at`, а не полагается только на момент
  вставки. Additive migration backfill’ит записи нынешней активной сессии из server room state,
  оставляет более старые в legacy session `0` и добавляет room/session/run index. Все новые writes
  захватывают session из авторизовавшего server snapshot; list и seal/reveal требуют одновременно
  exact session и прежнюю time boundary. Поэтому in-flight media/AI callback прошлого вечера не
  попадёт в Cross evidence нового, даже если физически вставился после restart. Idempotent replay
  также сравнивает session, а release-health проверяет наличие столбца. Локальный контур после
  среза — 563 теста в 113 файлах; миграция не применялась из-за паузы БД и остаётся обязательным
  pre-deploy gate.
- Создание комнаты теперь имеет отдельную privacy-safe recovery boundary: landing классифицирует
  network loss, 429, backend/schema outage и неизвестный сбой, но никогда не печатает исходный
  Supabase payload, URL, relation, trace или credential-like строку. Каждый ответ даёт ведущему
  конкретный retry и подтверждает, что setup не потерян; React state действительно остаётся на
  форме, а ошибка озвучивается через `role="alert"`. Sentinel regressions закрывают утечки для всех
  веток. Локальный контур после среза — 568 тестов в 114 файлах; реальный offline/429/outage проход
  остаётся live failure gate.
- Host и speaker room-load теперь сохраняют последний рабочий snapshot при transient refresh
  failure вместо ложного выхода в **Room not found**. Без snapshot общий recovery различает
  not-found, offline и временный service outage, даёт retry того же кода и не показывает raw
  backend detail; `useRoom` хранит только публичные error sentinels. Backup-host verification также
  санитизирует rejected browser fetch до фиксированной инструкции. Guest code-repair flow остаётся
  совместимым. Локальный контур после среза — 572 теста в 114 файлах; реальный disconnect/reconnect
  на host и speaker остаётся physical network gate.
- Общие live-action и media fallback больше не показывают неизвестный `.message`. Распознанные
  permission/network/size/stale/auth ветки сохраняют конкретное восстановление, неизвестные host и
  player ошибки ведут через retry/pause/reopen или host screen, а capture/upload удерживает человека
  на текущем экране. Техническое указание проверить Supabase Storage удалено. Top-level host
  command, release-health и AI-prewarm также проходят через безопасный helper. Локальный контур
  после среза — 576 тестов в 114 файлах; отдельные direct error catches внутри новых grill/bar
  views остаются следующим programmatic gate.
- Все direct catches в party-native grill/bar host/player views, background rituals и finale
  ledger теперь проходят через те же safe helpers. Host получает отдельную phase-conflict
  инструкцию открыть текущую game panel, player — свериться с host screen; load/prepare/open/send
  формулируются по действию, а media сохраняет собственную recovery-ветку. Source-level regression
  перечисляет полный surface и запрещает raw `Error.message` в rendered state. Локальный контур
  после среза — 580 тестов в 115 файлах; injected API/network/media failure на реальных устройствах
  остаётся field gate.
- Все 24 catch-based HTTP routes теперь используют единый public error responder. Только ошибки,
  явно созданные как public `statusError`, сохраняют bounded domain copy; unknown Supabase,
  Postgres и provider payload сохраняет status, но получает route fallback. Raw score-ledger SQL
  messages заменены стабильными conflict/not-found/invalid фразами, raw Zod issues также не выходят
  наружу. Policy regression сканирует всю `src/routes/api` и запрещает возврат `Error.message` из
  catch. Локальный контур после среза — 585 тестов в 116 файлах; реальная 4xx/5xx injection matrix
  остаётся pre-event failure gate.
- `/api/transcribe` теперь требует player authorization и открыт только для активной media-фазы;
  `/api/speak` требует room scope. Оба endpoint расходуют тот же cap, что text/vision calls.
- Старые artifact signed URLs ограничены шестью часами; тесты подтверждают private Storage policies,
  удаление storage objects и private records до удаления комнаты.
- Добавлен `docs/host-live-runbook.md` с 60-секундным emergency flow без ручного SQL/state repair.

## Стабилизация перед live-тестом

1. Проверить комнаты:
   - создание комнаты на `/`;
   - выбрать каждый из четырёх quick-start setting и проверить корректный первый act/context;
   - выбрать 2 / 3 / 4 часа и получить route duration 120 / 180 / 240 минут;
   - без внешней инструкции объяснить по встроенному brief, что подготовить и где нужны camera,
     mic или playback; после создания комнаты найти ту же памятку у QR;
   - измерить `room created → 8 players ready`, целевое время — не больше 120 секунд;
   - подключение игрока через `/play/$code`;
   - восстановление host/player состояния после refresh;
   - корректный `Room not found` для неверного кода.

2. Проверить realtime:
   - минимум 1 host, 2 player, 1 speaker в одной комнате;
   - обновление lobby без ручного refresh;
   - disconnect/reconnect speaker;
   - одновременные отправки player actions без потери состояния.

3. Проверить медиа на реальных телефонах:
   - camera permissions на iOS Safari и Android Chrome;
   - microphone permissions;
   - запись видео для Challenge;
   - запись аудио для Soundscape;
   - фото и downscale для Photo Hunt.

4. Проверить AI failure modes:
   - отсутствует `OPENAI_API_KEY`;
   - OpenAI-compatible API возвращает 4xx/5xx;
   - STT/TTS timeout;
   - JSON/vision model возвращает невалидный JSON;
   - fallback-тексты не ломают UI.
   - cap исчерпан до text/vision/STT/TTS запроса: provider не вызывается, fallback помечен;
   - prepared deck используется после запуска игры, но инвалидируется после смены roster/context.

5. Проверить Supabase:
   - применены все миграции;
   - bucket `recordings` создан и private;
   - RLS-политики соответствуют party-mode;
   - cleanup workflow проходит в dry-run и затем в реальном режиме на production.

## Тестирование

- Локально перед каждым релизом:
  - `bun install --frozen-lockfile`;
  - `bun run lint`;
  - `bun test`;
  - `bun run test:rehearsal`;
  - `bunx tsc --noEmit`;
  - `bun run build`;
  - `SMOKE_BASE_URL=https://ai-game-hub-tau.vercel.app bun run smoke:http`;
  - `bun run preview`;
  - при запущенном локальном сервере:
    `BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser`;
  - для проверки честного красного gate до применения backend-схемы:
    `BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:backend`;
  - перед physical field gate:
    `BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:matrix`;
  - перед network/reconnect fault injections:
    `BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:resilience`;
  - перед physical camera/mic gate:
    `BROWSER_SMOKE_ALLOW_MUTATION=YES BROWSER_SMOKE_EXPECT_AI=YES bun run smoke:browser:media`.
  - перед полным программным rehearsal до связанного финала:
    `BROWSER_SMOKE_ALLOW_MUTATION=YES bun run smoke:browser:journey`.

- Ручной smoke test:
  - создать комнату;
  - подключить игрока;
  - подключить speaker;
  - пройти по одному раунду Soundscape, Challenge и Photo Hunt;
  - проверить, что host может поставить раунд на паузу и продолжить без сгорания таймера;
  - проверить skip phase, restart game и force back to hub во время активной игры;
  - проверить, что host может вернуться в hub после игры.

- Минимальный regression pack после live-теста:
  - расширить unit-тесты для поздних game-specific state transitions после field test;
  - расширить AI sanitizer tests после field test новыми edge cases из реальных ответов;
  - расширять browser smoke новыми failure cases, найденными на физических устройствах.

- Базовая observability:
  - AI gateway пишет `ai.chat_json.*`, `ai.tts.*`, `ai.stt.*` с duration/status/model без prompt body;
  - API routes пишут `api.speak.*`, `api.transcribe.*`, `api.cleanup.*`;
  - room helpers пишут `room.create.*`, `room.fetch.*`, `room.update.*` без `host_secret`;
  - player upload paths пишут `upload.failure` с game/stage/room/round/player/team и размером blob;
  - cleanup summary пишет rooms/storage counts и errorCount;
  - secrets/tokens/api keys редактируются в structured logger.

- Retry/backoff:
  - AI gateway ретраит network errors и HTTP `408`, `409`, `425`, `429`, `5xx`;
  - количество AI retry attempts можно переопределить через `OPENAI_RETRY_ATTEMPTS`, по умолчанию 3;
  - конкурентные player actions перечитывают свежий room snapshot и повторяют CAS-запись до 32 раз
    с bounded jittered backoff;
  - Soundscape, Challenge и Photo Hunt ретраят transient Supabase Storage upload/createSignedUrl failures.

## Подготовка к прод-развертыванию

1. Создать отдельный Supabase-проект для production.
2. Применить миграции: `supabase link --project-ref <prod-ref>` и `supabase db push`.
3. Настроить production variables/secrets в GitHub Actions и Vercel runtime:
   - `VITE_SUPABASE_URL`;
   - `VITE_SUPABASE_PUBLISHABLE_KEY`;
   - `VITE_SUPABASE_PROJECT_ID`;
   - `SUPABASE_URL`;
   - `SUPABASE_PUBLISHABLE_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY`;
   - `CLEANUP_SECRET`;
   - `OPENAI_API_KEY`;
   - `OPENAI_BASE_URL`;
   - `OPENAI_CHAT_MODEL`;
   - `OPENAI_VISION_MODEL`;
   - `OPENAI_TTS_MODEL`;
   - `OPENAI_TRANSCRIBE_MODEL`.
4. Проверить GitHub Actions config: `bun run verify:github-prod --repo=lamapony/ai-game-hub`.
5. Выполнить preflight: `bun run verify:prod-env`.
6. Выполнить строгий backend release gate: `bun run verify:backend`.
7. Выполнить `bun run build`.
8. Выполнить production deploy через GitHub Actions `Deploy Vercel` или локально:
   `bun run deploy:vercel`.
9. После деплоя пройти smoke test на production URL.
10. Проверить cleanup workflow в dry-run: `Cleanup old rooms` с `dry_run=true`.

## GitHub Actions

- `CI` запускается на push и pull request в `main`: install, lint, test, typecheck, build.
- `Deploy Vercel` запускается вручную через GitHub Actions после настройки secrets.
  Workflow сначала запускает `bun run verify:prod-env`, затем read-only `bun run verify:backend`.
  Отсутствующий env, таблица, private bucket или AI runtime останавливают job до build/deploy.
- Required repo variables for first deploy:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
- Post-deploy repo variables:
  - `CLEANUP_URL`
- Optional repo variables with runtime defaults:
  - `OPENAI_BASE_URL`
  - `OPENAI_CHAT_MODEL`
  - `OPENAI_VISION_MODEL`
  - `OPENAI_TTS_MODEL`
  - `OPENAI_TRANSCRIBE_MODEL`
  - `OPENAI_RETRY_ATTEMPTS` (default `3`)
- Required repo secrets for deploy:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CLEANUP_SECRET`
  - `OPENAI_API_KEY`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_TOKEN`

GitHub и Vercel production config заведены полностью; состояние повторно проверено 2026-07-18:

- `bun run verify:github-prod --repo=lamapony/ai-game-hub` проходит без missing vars/secrets.
- `Deploy Vercel` прошел успешно: run `28570852103`.
- Production alias: `https://ai-game-hub-tau.vercel.app`.
- Текущий production deployment: `dpl_BFEJtCNWx6MGFFx4gAtyTQWtmzRA`, статус `Ready`, HTTP 200.
- Production browser matrix: `KJ3H` park/120/8 за 10.219 с, `N5WA` bar/180/8 за 8.556 с,
  `4W3Y` home/240/8 за 8.488 с и `JX8Y` festival/180/30 за 49.093 с; во всех сценариях проверены
  private host handoff, persisted first cue, schema-v2 privacy-safe field report с
  `hostHandoff=verified` и точечное удаление комнаты.
- Production launch-coach matrix: `7CEG` park/120/8, `BF7K` bar/180/8, `LTH7` home/240/8 и
  `XH98` festival/180/30 открыли full-screen QR из единственного coach action; полный `9B3K`
  переключился на start после восьмого join, достиг readiness за 11.864 секунды, сохранил cue и
  выгрузил field report. Все пять комнат удалены.
- Production schema-v3 download: `725Q` достиг readiness за 12.106 секунды, проверил backup host,
  восемь изолированных игроков, persisted cue, ledger и privacy-safe v3 report без raw story seed;
  комната удалена.
- Production field-evidence coach: `4RDQ` достиг readiness за 12.066 секунды, проверил восемь
  игроков, persisted cue, блокировку экспорта неполного PASS, структурированную дату в privacy-safe
  pending v3 report и точечный cleanup.
- Production first-viewport entry routing: `59BL` кликнул отдельные host/guest entry paths,
  подключил восемь игроков, достиг readiness за 13.505 секунды, сохранил первый cue, выгрузил
  privacy-safe report и удалил комнату.
- Production guest room-code contract: `2EAD` заблокировал `O0I1`, нормализовал paste
  `a-b c d → ABCD`, подключил восемь игроков, достиг readiness за 13.747 секунды, сохранил cue,
  выгрузил report и удалил комнату. Ближайший rollback —
  `dpl_pYvWNdny3WNMdVLQbn55qr3iVnoS`.
- Production guest room recovery: прямой `/play/O0I1` открыл editable invalid-code state без
  lookup и принял исправление `a-b c d → ABCD`; затем `BRSM` подключил восемь игроков, достиг
  readiness за 15.604 секунды, сохранил cue, выгрузил report и был удалён. Ближайший rollback —
  `dpl_6Re3EkJeZD1VCBo21SHgTtgv2iF3`.
- Production room-capacity contract: `9Z54` подключил 30 игроков, заблокировал 31-го через guest UI
  и direct HTTP 409, достиг readiness за 86.452 секунды, сохранил `festival-rally-180`, выгрузил
  report и был удалён. Join orchestration ограничивает automation четырьмя параллельными телефонами
  после зафиксированного Vercel Security Checkpoint на искусственных 30 одновременных POST.
  Ближайший rollback — `dpl_GR6xb9fg7fESkubwbqvoucb7jnCt`.
- Production field-report draft survival: `DCUT` достиг readiness за 23.372 секунды, сохранил
  `park-arrival-120`, записал private draft, восстановил его после refresh основного ведущего и на
  storage-isolated backup-host, выгрузил privacy-safe v3 report и удалил комнату. Deployment
  `dpl_5CvFoV599PtuJJJywctxJu4dWmE5`; ближайший rollback —
  `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm`.
- Production grounded story thread: deployment `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA` имеет статус
  `Ready`; `ATDJ` достиг readiness за 48.507 секунды, перенёс один Soundscape evidence id в
  Challenge, Photo Hunt и Who Among Us prompt context, затем показал тот же callback в host/player
  finale и был удалён. Первый probe `EB2D` доказал Challenge context, поймал транзиентный hub
  timeout и также был удалён. Ближайший rollback — `dpl_5CvFoV599PtuJJJywctxJu4dWmE5`.
- Production monotonic host convergence: deployment `dpl_BFEJtCNWx6MGFFx4gAtyTQWtmzRA`
  возвращает committed `rooms.updated_at` из каждой host-команды; клиент принимает REST/realtime
  snapshots только при строго более новой ревизии. Точный browser journey `8GYE` достиг readiness
  за 21.927 секунды, проверил committed revision на каждом возврате из Soundscape, Challenge,
  Photo Hunt и Who Among Us, вернул тот же callback в host/player finale и удалил комнату. Local
  `RFDW` повторил контракт за 11.615 секунды; ближайший rollback —
  `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA`.
- Production full-route journey: `WT8V` park/120/8 за 12.920 с; шесть предфинальных route steps,
  четыре foreground-игры, переход в finale act, одинаковый Soundscape callback у host/player,
  нулевой счёт без блокировки финала и точечный cleanup. Два stale AI write безопасно пропущены;
  500-ошибок deployment не зафиксировано.
- `Cleanup old rooms` dry-run прошел успешно: run `28570895779`, `roomsMatched: 0`, `errors: []`.

## Риски, которые стоит проверить до публичного мероприятия

- Синхронизация speaker playback всё ещё зависит от реальных устройств, Bluetooth и сети: перед мероприятием провести smoke test с тем же Wi-Fi/мобильным интернетом и теми же колонками.
