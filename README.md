# DIMAS fest

Jackbox-style AI-вечеринка для парка. Один экран-ведущий, игроки заходят с телефона по QR-коду, дополнительные телефоны становятся пространственными колонками. Три игры:

- **Звуковой баттл** — команды записывают звуки, AI-оркестратор играет их через 5 телефонов-колонок.
- **Челлендж духа парка** — оператор снимает видео, AI судит и озвучивает вердикт.
- **Фотоохота** — все делают по одному кадру на абсурдное задание, AI ранжирует.

Проект полностью независим: сборка, AI и деплой работают напрямую через open-source tooling, Supabase, OpenAI-compatible API и Cloudflare Workers.

## Стек

- **TanStack Start v1** (React 19 + Vite 8, SSR под Cloudflare Workers)
- **TailwindCSS v4** (`src/styles.css`, без `tailwind.config.js`)
- **Supabase** — БД, Realtime, Storage (bucket `recordings`)
- **OpenAI-compatible API** — JSON judging/vision, TTS, STT
- **shadcn/ui** — компоненты в `src/components/ui`
- **Bun** — пакетный менеджер

## Требования

- Bun 1.1+ или Node.js 20+
- Supabase-проект
- OpenAI API key или совместимый endpoint
- Cloudflare account для production deploy

## Быстрый старт

```bash
bun install
cp .env.example .env
bun run dev
```

Dev server: `http://localhost:8080`

Сборка и предпросмотр:

```bash
bun run lint
bunx tsc --noEmit
bun run build
bun run preview
```

## Переменные окружения

| Переменная                      | Где доступна     | Назначение                             |
| ------------------------------- | ---------------- | -------------------------------------- |
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

`process.env.*` доступен только внутри `createServerFn().handler(...)`, файлов `*.server.ts` и `src/routes/api/*`. В браузере — только `import.meta.env.VITE_*`.

## AI

`src/lib/ai-gateway.server.ts` напрямую вызывает OpenAI-compatible endpoints:

- `POST /chat/completions` для генерации заданий, JSON-вердиктов и vision judging;
- `POST /audio/speech` для TTS;
- `POST /audio/transcriptions` для STT.

По умолчанию используются:

- `gpt-4o-mini` для text/JSON и vision;
- `gpt-4o-mini-tts` для озвучки;
- `gpt-4o-mini-transcribe` для расшифровки.

Если нужен другой провайдер, укажи `OPENAI_BASE_URL` и модели через env.

## База данных

Все миграции лежат в `supabase/migrations/`. Применить к Supabase-проекту:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Таблицы: `rooms`, `submissions`, `votes`, `challenges`, `photos`.
Bucket: `recordings` (private).

RLS-политики намеренно открытые для party-mode без аутентификации. Для публичного постоянного деплоя нужно добавить rate limiting, cleanup старых комнат и более строгие политики.

## Cleanup

`POST /api/cleanup` удаляет комнаты, не обновлявшиеся дольше retention window, связанные строки
`submissions`, `votes`, `challenges`, `photos` и storage objects из bucket `recordings` по префиксу
`roomId/`.

Запрос требует `Authorization: Bearer $CLEANUP_SECRET`. По умолчанию retention — 24 часа:

```bash
curl -X POST "$CLEANUP_URL/api/cleanup" \
  -H "Authorization: Bearer $CLEANUP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"retentionHours":24,"dryRun":true}'
```

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
  games/
    soundscape/
    challenge/
    phototunt/
  lib/
    room.ts
    types.ts
    ai-gateway.server.ts
    ai/
  integrations/supabase/
  components/ui/
```

## Развёртывание

Проект собирается под **Cloudflare Workers** через TanStack Start/Nitro:

```bash
bun run build
npx wrangler deploy --config wrangler.json --cwd dist/server --secrets-file .deploy.env --keep-vars
```

В GitHub Actions есть:

- `CI` — lint, typecheck, build на push/PR;
- `Deploy Cloudflare` — ручной production deploy после настройки secrets.
- `Cleanup old rooms` — scheduled/manual cleanup старых комнат и uploads.

## Документы

- `docs/production-readiness-plan.md` — стабилизация, тестирование и подготовка к продакшену.
- `docs/development-roadmap.md` — долгосрочные продуктовые и технические цели.

## Лицензия

Приватный проект вечеринки. Делай что хочешь.
