# План стабилизации и подготовки к проду

Дата: 2026-07-01

## Текущее состояние

- Production build проходит: `bun run build`.
- TypeScript-проверка проходит: `bunx tsc --noEmit`.
- ESLint проходит без ошибок и предупреждений: `bun run lint`.
- `.env` исключен из git; публично коммитится только `.env.example`.
- Сборка ориентирована на Cloudflare Workers через TanStack Start и официальный Cloudflare Vite plugin.

## Уже закрыто

- Приведен формат исходников к Prettier.
- Убраны lint-ошибки в `VideoRecorder` и host share flow.
- Server functions переведены с deprecated `.inputValidator()` на `.validator()`.
- В `Orchestra` устранен риск stale callback при срабатывании scheduled audio cues.
- Media helpers вынесены из React-компонентов в отдельные utility-модули.
- Добавлены fallback-задания, fallback-судейство и graceful STT fallback для AI outage.
- Добавлены host controls для активной игры: pause/resume, skip phase, restart game, force back to hub.
- Добавлен protected cleanup endpoint и GitHub scheduled workflow для старых комнат и uploads.
- Добавлены понятные player-facing ошибки для camera, microphone, photo read и media upload failures.
- Добавлен базовый `bun test` regression pack для host controls и player-facing media/upload errors.
- Добавлен lightweight structured JSON logging для AI gateway, API routes и cleanup endpoint.
- Добавлен retry/backoff для transient AI provider errors и Supabase Storage upload/signed URL calls.
- Fast Refresh правило отключено только для `src/components/ui`, где shadcn/ui ожидаемо экспортирует variants рядом с компонентами.
- Локальный `.codebase-memory/` исключен из публичного репозитория.

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
  - расширить unit-тесты для state transitions в `src/lib/room.ts`;
  - добавить тесты для sanitization AI-ответов в `src/lib/ai/*`;
  - добавить browser smoke test для маршрутов `/`, `/play`, `/host/$code`, `/speaker/$code`.

- Базовая observability:
  - AI gateway пишет `ai.chat_json.*`, `ai.tts.*`, `ai.stt.*` с duration/status/model без prompt body;
  - API routes пишут `api.speak.*`, `api.transcribe.*`, `api.cleanup.*`;
  - cleanup summary пишет rooms/storage counts и errorCount;
  - secrets/tokens/api keys редактируются в structured logger.

- Retry/backoff:
  - AI gateway ретраит network errors и HTTP `408`, `409`, `425`, `429`, `5xx`;
  - количество AI retry attempts можно переопределить через `OPENAI_RETRY_ATTEMPTS`, по умолчанию 3;
  - Soundscape, Challenge и Photo Hunt ретраят transient Supabase Storage upload/createSignedUrl failures.

## Подготовка к прод-развертыванию

1. Создать отдельный Supabase-проект для production.
2. Применить миграции: `supabase link --project-ref <prod-ref>` и `supabase db push`.
3. Настроить production secrets:
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
4. Выполнить `bun run build`.
5. Задеплоить prebuilt Worker output: `npx wrangler deploy --config wrangler.json --cwd dist/server --secrets-file .deploy.env --keep-vars`.
6. После деплоя пройти smoke test на production URL.

## GitHub Actions

- `CI` запускается на push и pull request в `main`: install, lint, test, typecheck, build.
- `Deploy Cloudflare` запускается вручную через GitHub Actions после настройки secrets.
- Required repo variables:
  - `CLEANUP_URL`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - `OPENAI_BASE_URL`
  - `OPENAI_CHAT_MODEL`
  - `OPENAI_VISION_MODEL`
  - `OPENAI_TTS_MODEL`
  - `OPENAI_TRANSCRIBE_MODEL`
  - `OPENAI_RETRY_ATTEMPTS` (optional, default `3`)
- Required repo secrets for deploy:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CLEANUP_SECRET`
  - `OPENAI_API_KEY`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`

На 2026-07-01 в GitHub уже заведены `CLEANUP_SECRET` и `CLOUDFLARE_ACCOUNT_ID`.
Для первого production deploy ещё нужны `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` и
`CLOUDFLARE_API_TOKEN`. После первого deploy нужно добавить repo variable `CLEANUP_URL`.

## Риски, которые стоит закрыть до публичного мероприятия

- Публичный party-mode без auth: добавить rate limiting или cleanup, если URL станет широко доступен.
- Большой client chunk `index` выше 500 kB: после функциональной стабилизации вынести тяжелые игровые ветки в lazy imports.
- Зависимость от внешнего AI-провайдера: подготовить понятное сообщение host-у при недоступности API и fallback для TTS/STT.
- Синхронизация speaker playback зависит от устройств и сети: перед мероприятием провести тест с тем же Wi-Fi/мобильным интернетом и теми же колонками.
