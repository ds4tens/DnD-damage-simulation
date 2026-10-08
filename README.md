# DnD damage simulation

TypeScript-движок боя D&D 2024 для сравнения урона допустимых билдов и боевых стратегий.

## Структура

```text
src/
  character/
    build/                  проверка и построение билда
    origins/                backgrounds и species
    support/                границы поддержки особенностей
  classes/
    barbarian/
      subclasses/           выбранные подклассы Barbarian
  combat/
    engine/                 CombatEngine и порядок ходов
    state/                  состояние столкновения и ресурсы
    attacks/                оружейные атаки и Weapon Mastery
    damage/                 компоненты и разрешение урона
    health/                 HP, Temporary HP и death saves
    saves/                  спасброски
  dice/                     кости и источники случайности
  feats/
    catalog/                каталог и метаданные черт
    selection/              выбор, требования и повышения характеристик
    features/               реализация боевых особенностей
  items/
    weapons/                оружие, каталог и Weapon Mastery
  modifiers/                состояния и модификаторы
  monster/                  модель цели
  simulation/
    runtime/                независимые испытания, перенос состояния и seed
    scenario/               сценарии и условия испытаний
    metrics/                урон, агрегирование и статистика
  examples/                 демонстрационные сценарии
  index.ts                  запуск демонстраций
tests/                      тесты по областям движка
  fixtures/                 общие тестовые данные
  combat/integration/       проверки взаимодействий механик
scripts/                    инструменты разработки
```

Модули движка находятся в `src/`, тесты — в `tests/`, демонстрации — в
`src/examples/`. Новые файлы размещаются по ответственности, рядом с соответствующими
модулями или тестами. Названия каталогов пишутся в нижнем регистре.

`CombatEngine` экспортируется из `src/combat/engine/AttackResolver.ts`,
`EncounterState` — из `src/combat/state/EncounterState.ts`.
Публичный вход серий симуляций — `src/simulation/index.ts`:
`runDprTrial`, `runDprBatch`, `aggregateDprTrials` и типы их параметров и результатов.
Движок возвращает структурированные результаты; вывод демонстраций выполняется внешним слоем.

## Запуск и проверки

Требуется Node.js ≥20.17.0; проект проверен на Node.js 20.20.2.

```sh
npm ci
npm start
npm run typecheck
npm run lint
npm test
npm run check
```

`npm run check` последовательно запускает TypeScript, Biome и все тесты.
`npm test` рекурсивно находит `*.test.ts` внутри `tests/` и запускает их через
`node:test` с `tsx`. Глубина вложенности не ограничивает обнаружение тестов.
Дополнительные параметры Node.js передаются после `--`, например:

```sh
npm test -- --test-name-pattern="Rage"
```

Линтер и Git-проверка изменённых файлов охватывают `src/`, `tests/` и `scripts/`.
Локальные `AGENTS.md`, `.agents/` и `docs/` содержат дополнительные инструкции
и проверенные контракты; они исключены из Git и могут отсутствовать в новом клоне.
