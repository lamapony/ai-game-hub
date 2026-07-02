# DIMAS fest

Jackbox-style AI-вечеринка для мероприятий. Один экран-ведущий, гости заходят с телефона по QR-коду, дополнительные телефоны могут становиться пространственными колонками, а virtual host layer ведёт фестивальный run-of-show: opening, переходы между раундами, call-and-response, финал и operator-approved реплики. Пять игр:

- **Звуковой баттл** — команды записывают звуки, AI-оркестратор играет их через 5 телефонов-колонок.
- **Челлендж духа парка** — оператор снимает видео, AI судит и озвучивает вердикт.
- **Фотоохота** — все делают по одному кадру на абсурдное задание, AI ранжирует.
- **Угадай трек** — гости угадывают AI-generated музыкальные/звуковые подсказки.
- **Spectrum Court** — аудитория занимает позиции на шкале, а ведущий превращает расклад в короткий суд.

Проект полностью независим: сборка, AI и деплой работают напрямую через open-source tooling, Supabase, OpenAI-compatible API и Vercel.

## Стек

- **TanStack Start v1** (React 19 + Vite 8, SSR под Vercel через Nitro)
- **TailwindCSS v4** (`src/styles.css`, без `tailwind.config.js`)
- **Supabase** — БД, Realtime, Storage (bucket `recordings`)
- **OpenAI-compatible API** — JSON judging/vision, TTS, STT
- **Realtime voice providers** — OpenAI Realtime WebRTC или xAI Voice Agent через ephemeral credentials
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
| `SPIRIT_PROVIDER`               | только сервер    | `auto`, `xai` или `openai` для lobby Q&A |
| `VOICE_PROVIDER`                | только сервер    | `auto`, `openai` или `xai`             |
| `OPENAI_REALTIME_MODEL`         | только сервер    | OpenAI Realtime model                  |
| `OPENAI_REALTIME_VOICE`         | только сервер    | OpenAI realtime/TTS voice              |
| `XAI_API_KEY`                   | только сервер    | xAI API key для Responses/Voice Agent  |
| `XAI_CHAT_MODEL`                | только сервер    | xAI model для Park Spirit concierge    |
| `XAI_REALTIME_MODEL`            | только сервер    | xAI realtime voice model               |

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

## Park Spirit

Lobby concierge живёт в `WaitingPanel` на экране игрока. Это не always-on чат: игрок нажимает
`Ask 30s`, получает 30-секундное окно, 3 быстрых вопроса, optional text prompt и push-to-talk.
`POST /api/spirit` проверяет `playerId` в комнате, работает только в lobby/briefing phases и лимитирует
до 3 вопросов на игрока за 10 минут. Ответ возвращается текстом и озвучивается через `/api/speak`.

`SPIRIT_PROVIDER=auto` сначала пробует xAI Responses API (`XAI_CHAT_MODEL`), затем OpenAI-compatible chat,
затем локальные fallback answers из `game-guide.ts`. Built-in web/X tools не включены: дух отвечает только
по локальному контексту комнаты, команде игрока, director segment и правилам 5 игр.

## Virtual Host

`src/lib/event-director.ts` управляет полуавтоматическим run-of-show: playlist, текущий сегмент,
pending cue, transcript, mic capture, provider health и fallback flags. Дорогие и управляющие действия
идут через host-authorized endpoints `POST /api/director` и `POST /api/voice-session`; они проверяют
`host_secret`, а не полагаются на открытую party-mode RLS.

`VOICE_PROVIDER=auto` выбирает xAI при наличии `XAI_API_KEY`, иначе OpenAI; если xAI session minting
падает, server-side adapter пробует OpenAI перед полным отказом. Browser voice path: OpenAI получает
WebRTC client secret, xAI получает ephemeral WebSocket credentials. Если realtime voice недоступен,
host panel откатывается на сгенерированный текст и `/api/speak` MP3.

## Event profile

Базовая настройка события лежит в `src/lib/event-profile.ts`: название, SEO-тексты, имя ведущего
по умолчанию, storage key prefix, персона ведущего и 5 speaker slots. Это простой code config без
dashboard; для нового события меняй его и проверяй `bun test && bun run build`.

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
      director.ts          # protected virtual host/director actions
      spirit.ts            # player lobby concierge Q&A
      voice-session.ts     # protected realtime voice credentials
      speak.ts             # TTS endpoint
      transcribe.ts        # STT endpoint
  components/
    DirectorPanel.tsx      # host operator controls
  games/
    soundscape/
    challenge/
    phototunt/
    trackguess/
    spectrumcourt/
  lib/
    event-director.ts
    director-actions.server.ts
    game-guide.ts
    spirit-agent.server.ts
    voice-provider.server.ts
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
- `docs/development-roadmap.md` — долгосрочные продуктовые и технические цели.

## Лицензия

Приватный проект вечеринки. Делай что хочешь.
