# DIMAS fest

Jackbox-style AI-вечеринка для парка. Один экран-ведущий, все игроки заходят с телефона по QR-коду, дополнительные телефоны становятся «духами» — пространственными колонками. Три игры:

- **Звуковой баттл** — команды записывают звуки, AI-оркестратор играет их через 5 телефонов-колонок.
- **Челлендж духа парка** — оператор снимает видео, Gemini судит и озвучивает вердикт.
- **Фотоохота** — все делают по одному кадру на абсурдное задание, AI ранжирует.

Проект собран на Lovable, но полностью работает в любом окружении — ниже инструкция для разработки в своей IDE.

---

## Стек

- **TanStack Start v1** (React 19 + Vite 7, SSR под Cloudflare Workers)
- **TailwindCSS v4** (`src/styles.css`, без tailwind.config.js)
- **Supabase** — БД, Realtime, Storage (bucket `recordings`)
- **Lovable AI Gateway** — Gemini 2.5 Flash (vision), GPT-4o mini TTS, Whisper-mini STT
- **shadcn/ui** — компоненты в `src/components/ui`
- **Bun** — пакетный менеджер (можно заменить на pnpm/npm)

## Требования

- Node.js 20+ или Bun 1.1+
- Supabase-проект (свой или существующий Lovable Cloud)
- Ключ Lovable AI Gateway **или** ключи OpenAI/Gemini, если решишь переписать `src/lib/ai-gateway.server.ts`

## Быстрый старт

```bash
# 1. Установить зависимости
bun install         # или: npm install / pnpm install

# 2. Скопировать переменные окружения
cp .env.example .env
#    заполнить значениями из Supabase Dashboard → Project Settings → API

# 3. Запустить dev-сервер
bun run dev         # http://localhost:8080
```

Сборка и предпросмотр:

```bash
bun run build           # прод-сборка (Cloudflare Worker через nitro)
bun run build:dev       # прод-сборка в dev-режиме (без минификации)
bun run preview         # локальный запуск собранной версии
bun run lint            # ESLint
```

## Переменные окружения

Все переменные — в `.env.example`. Правила:

| Переменная                      | Где доступна     | Назначение                             |
| ------------------------------- | ---------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`             | браузер + сервер | URL Supabase-проекта                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | браузер + сервер | Anon/publishable key                   |
| `VITE_SUPABASE_PROJECT_ID`      | браузер          | Ref проекта                            |
| `SUPABASE_URL`                  | только сервер    | То же, для server functions            |
| `SUPABASE_PUBLISHABLE_KEY`      | только сервер    | То же, для server functions            |
| `SUPABASE_SERVICE_ROLE_KEY`     | только сервер    | Bypass RLS. **Никогда не в браузере.** |
| `LOVABLE_API_KEY`               | только сервер    | AI Gateway (TTS, STT, Gemini vision)   |

`process.env.*` доступен только внутри `createServerFn().handler(...)` и в файлах `*.server.ts` / `src/routes/api/*`. В браузере — только `import.meta.env.VITE_*`.

## База данных

Все миграции лежат в `supabase/migrations/`. Применить к своему Supabase-проекту:

```bash
# через Supabase CLI (https://supabase.com/docs/guides/cli)
supabase link --project-ref <your-ref>
supabase db push
```

Таблицы: `rooms`, `submissions`, `votes`, `challenges`, `photos`.
Bucket: `recordings` (private).

RLS-политики намеренно открытые (party-режим без аутентификации) — если разворачиваешь публично, ужесточи их.

## Замена Lovable AI Gateway

`src/lib/ai-gateway.server.ts` вызывает `https://ai.gateway.lovable.dev/v1` в формате OpenAI. Если ключа нет, замени `BASE` и модели на:

- `https://api.openai.com/v1` — для TTS (`gpt-4o-mini-tts`) и Whisper (`gpt-4o-mini-transcribe` → `whisper-1`)
- `https://generativelanguage.googleapis.com/v1beta/openai` — для Gemini через OpenAI-совместимый endpoint

Модели, используемые в коде:

- `google/gemini-3-flash-preview` — судейство в челлендже, ранжирование фотоохоты, генерация тем и заданий
- `openai/gpt-4o-mini-tts` — голос духа парка
- `openai/gpt-4o-mini-transcribe` — расшифровка записей в звуковом баттле

## Структура

```
src/
  routes/
    index.tsx              # лендинг + создание комнаты
    host.$code.tsx         # экран ведущего (хаб игр)
    play.$code.tsx         # экран игрока
    speaker.$code.tsx      # экран «духа» (колонки)
    api/
      speak.ts             # TTS endpoint
      transcribe.ts        # STT endpoint
  games/
    soundscape/            # звуковой баттл
    challenge/             # челлендж духа парка
    phototunt/             # фотоохота
  lib/
    room.ts                # realtime-движок комнат
    types.ts               # общие типы состояния
    ai-gateway.server.ts   # обёртка над AI Gateway
    ai/                    # server functions для каждой игры
  integrations/supabase/   # авто-генерируемые клиенты — не редактировать
  components/ui/           # shadcn
```

## Развёртывание

Проект настроен под **Cloudflare Workers** (`vite.config.ts` → nitro). Альтернативы:

- **Vercel / Netlify** — заменить `nitro` preset в vite-конфиге. См. https://tanstack.com/start/latest/docs/framework/react/hosting
- **Node.js** — `nitro` умеет собирать под `node-server`.
- **Обратно в Lovable** — просто открыть проект в Lovable, все правки подхватятся.

## Что нельзя редактировать

Авто-генерируется Lovable / TanStack плагинами — при ручных правках сломается:

- `src/routeTree.gen.ts`
- `src/integrations/supabase/client.ts`, `client.server.ts`, `types.ts`, `auth-middleware.ts`, `auth-attacher.ts`
- `supabase/config.toml`

Если разрабатываешь только вне Lovable — эти файлы можно удалить из ignore-списка и вести вручную.

## Лицензия

Приватный проект вечеринки. Делай что хочешь.
