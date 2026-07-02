# План стабилизации и подготовки к проду

Дата: 2026-07-02

## Текущее состояние

- Production URL: `https://ai-game-hub-tau.vercel.app`.
- Production deploy идет через Vercel/Nitro prebuilt output из GitHub Actions `Deploy Vercel`.
- GitHub repository: `https://github.com/lamapony/ai-game-hub`, visibility `PUBLIC`.
- Production build проходит: `bun run build`.
- TypeScript-проверка проходит: `bunx tsc --noEmit`.
- ESLint проходит без ошибок и предупреждений: `bun run lint`.
- `.env` и `.env.local` исключены из git; публично коммитится только `.env.example`.

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

## Стабилизация перед live-тестом

1. Проверить комнаты:
   - создание комнаты на `/`;
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
  - `bunx tsc --noEmit`;
  - `bun run build`;
  - `bun run preview`.

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
  - добавить browser smoke test для маршрутов `/`, `/play`, `/host/$code`, `/speaker/$code`.

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
6. Выполнить `bun run build`.
7. Выполнить production deploy через GitHub Actions `Deploy Vercel` или локально:
   `bun run deploy:vercel`.
8. После деплоя пройти smoke test на production URL.
9. Проверить cleanup workflow в dry-run: `Cleanup old rooms` с `dry_run=true`.

## GitHub Actions

- `CI` запускается на push и pull request в `main`: install, lint, test, typecheck, build.
- `Deploy Vercel` запускается вручную через GitHub Actions после настройки secrets.
  Workflow сначала запускает `bun run verify:prod-env`, чтобы показать конкретные отсутствующие
  keys до build/deploy.
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

На 2026-07-02 GitHub и Vercel production config заведены полностью:

- `bun run verify:github-prod --repo=lamapony/ai-game-hub` проходит без missing vars/secrets.
- `Deploy Vercel` прошел успешно: run `28570852103`.
- Production alias: `https://ai-game-hub-tau.vercel.app`.
- `Cleanup old rooms` dry-run прошел успешно: run `28570895779`, `roomsMatched: 0`, `errors: []`.

## Риски, которые стоит проверить до публичного мероприятия

- Синхронизация speaker playback всё ещё зависит от реальных устройств, Bluetooth и сети: перед мероприятием провести smoke test с тем же Wi-Fi/мобильным интернетом и теми же колонками.
