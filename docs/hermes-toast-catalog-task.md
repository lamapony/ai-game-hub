# Hermes task — Toast Syndicate fallback catalog

Дата: 2026-07-14
Приоритет: P1 после текущего задания Hermes
Сложность: низкая, изолированная

## Контекст

AI Game Hub готовится к experience pack «Дым и неон». Архитектурный план находится в
`docs/conceptual-development-plan.md`, creative spec — в `docs/grill-bar-party-upgrade.md`,
секция 3.5.

Твоя задача — подготовить только детерминированный offline/fallback-каталог для будущей игры
Toast Syndicate. Не интегрируй игру в приложение и не меняй общую архитектуру.

## Разрешённый scope

Создать только:

- `src/games/toastsyndicate/fallback-catalog.ts`
- `src/games/toastsyndicate/fallback-catalog.test.ts`

Если папки нет, создай её. Другие файлы не менять.

## Требования

1. Экспортируй типы и данные для:
   - минимум 10 жанров тоста;
   - минимум 36 абсурдно-конкретных контрабандных слов;
   - английского и русского текста для каждого элемента;
   - стабильного строкового `id`, не зависящего от локализованного текста.
2. Обязательные жанры из спеки:
   - noir detective;
   - investor pitch;
   - courtroom defense;
   - TED talk about the obvious;
   - weather forecast;
   - IKEA instruction;
   - sports commentary.
3. Слова не должны быть барными терминами. Нужны предметы/понятия уровня «карбюратор», «фьорд»,
   «ламинат», которые можно произнести, но трудно спрятать в тосте.
4. Экспортируй pure function `pickToastFallback`:
   - принимает `locale: "en" | "ru"`;
   - принимает числовой `seed`;
   - optional списки недавно использованных genre/word ids;
   - возвращает один жанр, instructions и ровно три разных слова;
   - при достаточном каталоге не повторяет recent ids;
   - одинаковый input всегда даёт одинаковый output;
   - не использует `Math.random`, сеть, storage, время или React.
5. Не добавляй AI prompts, Zod, GameId, RoomState, UI, routes, Supabase migration или score logic.
6. Комментарий в файле: `// Adapted from grill-bar-party-upgrade.md section 3.5`.

## Тесты

Покрой минимум:

- одинаковый seed даёт одинаковое задание;
- возвращаются ровно три разных word ids;
- recent genre/words исключаются, когда доступна альтернатива;
- EN и RU используют те же ids, но локализованный текст;
- каталог имеет требуемый минимальный размер;
- у каждого элемента заполнены id/en/ru;
- обязательные семь жанров присутствуют.

## Проверка

Запусти:

```bash
bun test src/games/toastsyndicate/fallback-catalog.test.ts
bun run lint
bunx tsc --noEmit
```

## Definition of Done

- Изменены только два разрешённых файла.
- Все проверки зелёные.
- В отчёте перечислены размеры каталогов и команды проверки.
- Не создана карточка игры и не тронуты общие типы.

## Copy-paste prompt для Hermes

```text
Read AGENTS.md, docs/hermes-toast-catalog-task.md, and section 3.5 of
docs/grill-bar-party-upgrade.md in full. Implement exactly the isolated Hermes task. Change only
src/games/toastsyndicate/fallback-catalog.ts and fallback-catalog.test.ts. Do not integrate the
game or edit shared architecture. Run the three verification commands and report the result.
```
