# План стабилизации и подготовки к проду

Дата: 2026-07-01

## Текущее состояние

- Production build проходит: `bun run build`.
- TypeScript-проверка проходит: `bunx tsc --noEmit`.
- ESLint проходит без ошибок и предупреждений: `bun run lint`.
- `.env` исключен из git; публично коммитится только `.env.example`.
- Сборка ориентирована на Cloudflare Workers через Nitro/TanStack Start.

## Уже закрыто

- Приведен формат исходников к Prettier.
- Убраны lint-ошибки в `VideoRecorder` и host share flow.
- Server functions переведены с deprecated `.inputValidator()` на `.validator()`.
- В `Orchestra` устранен риск stale callback при срабатывании scheduled audio cues.
- Media helpers вынесены из React-компонентов в отдельные utility-модули.
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
   - отсутствует `LOVABLE_API_KEY`;
   - AI Gateway возвращает 4xx/5xx;
   - STT/TTS timeout;
   - Gemini возвращает невалидный JSON;
   - fallback-тексты не ломают UI.

5. Проверить Supabase:
   - применены все миграции;
   - bucket `recordings` создан и private;
   - RLS-политики соответствуют party-mode;
   - retention/cleanup для старых комнат и записей.

## Тестирование

- Локально перед каждым релизом:
  - `bun install --frozen-lockfile`;
  - `bun run lint`;
  - `bunx tsc --noEmit`;
  - `bun run build`;
  - `bun run preview`.

- Ручной smoke test:
  - создать комнату;
  - подключить игрока;
  - подключить speaker;
  - пройти по одному раунду Soundscape, Challenge и Photo Hunt;
  - проверить, что host может вернуться в hub после игры.

- Минимальный regression pack после live-теста:
  - добавить unit-тесты для state transitions в `src/lib/room.ts`;
  - добавить тесты для sanitization AI-ответов в `src/lib/ai/*`;
  - добавить browser smoke test для маршрутов `/`, `/play`, `/host/$code`, `/speaker/$code`.

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
   - `LOVABLE_API_KEY`.
4. Выполнить `bun run build`.
5. Задеплоить prebuilt Nitro output: `npx nitro deploy --prebuilt`.
6. После деплоя пройти smoke test на production URL.

## Риски, которые стоит закрыть до публичного мероприятия

- Публичный party-mode без auth: добавить rate limiting или cleanup, если URL станет широко доступен.
- Большой client chunk `index` выше 500 kB: после функциональной стабилизации вынести тяжелые игровые ветки в lazy imports.
- Зависимость от Lovable AI Gateway: подготовить прямой OpenAI/Gemini fallback или понятное сообщение host-у при недоступности AI.
- Синхронизация speaker playback зависит от устройств и сети: перед мероприятием провести тест с тем же Wi-Fi/мобильным интернетом и теми же колонками.
