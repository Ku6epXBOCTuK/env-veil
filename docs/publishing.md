# Публикация Env Veil

Документ для владельца расширения. Описывает, что нужно изменить, что проверить и как опубликовать. Ничего из перечисленного не сделано автоматически: часть пунктов требует твоего аккаунта и решений по названию.

## 0. Что нужно решить до публикации

| Вопрос             | Сейчас в проекте                   | Почему это важно                                                                                        |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Publisher ID       | `local-development`                | ID издателя создаётся один раз и **не меняется**. Он будет в URL расширения навсегда.                   |
| Имя расширения     | `env-veil`                         | Имя и display name должны быть уникальны глобально. Если занято — придётся переименовать до публикации. |
| Владелец в LICENSE | `Env Veil contributors` (заглушка) | MIT требует настоящего владельца.                                                                       |
| Версия             | `0.0.1`                            | Для первого публичного релиза обычно `0.1.0`.                                                           |
| URL репозитория    | отсутствует                        | Без него `vsce` не резолвит относительные ссылки и ругается при сборке.                                 |

## 1. Проверить, что имя свободно

Открой в браузере:

```text
https://marketplace.visualstudio.com/search?term=env%20veil&target=VSCode&category=All%20categories&sortBy=Relevance
```

Проверь дважды: нет ли расширения с именем `env-veil` и нет ли с display name `Env Veil`. Оба должны быть свободны.

Если `env-veil` занят, а `env-veil-mask` или `dotenv-veil` свободны — переименуй сейчас. После публикации **удаление расширения необратимо, и имя зарезервировано навсегда**, даже за тобой.

## 2. Создать издателя

1. Открой [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) и войди тем же аккаунтом Microsoft, который будет владельцем расширения.
2. Слева нажми **Create publisher**.
3. Укажи **ID** (латиница, уникально) и **Name** (отображаемое имя). Остальные поля по желанию.
4. Создай и запомни ID.

ID нельзя изменить после создания. Он подставляется в `package.json` в поле `publisher`.

## 3. Авторизация

### Важно про сроки

**1 декабря 2026 года в Azure DevOps прекращают работу глобальные Personal Access Token.** PAT-публикация проработает примерно до этой даты. Дальше нужен переход на Microsoft Entra ID с workload identity federation и managed identity — это настройка пайплайна, а не разовая команда.

Если публикуешься один раз и не собираешься обновлять расширение регулярно, PAT достаточно. Если планируешь релизы — сразу закладывай Entra ID.

### Вариант с PAT (проще, временно)

1. Создай организацию Azure DevOps, если её ещё нет: [https://dev.azure.com](https://dev.azure.com)
2. В портале: аватар → **Personal access tokens** → **New Token**.
3. Поля:
   - **Organization**: обязательно **All accessible organizations**. Частая причина ошибки 403.
   - **Scopes**: **Custom defined** → **Show all scopes** → в списке найти **Marketplace** и выбрать **Manage**.
4. Скопируй токен — он показывается один раз.
5. Проверь издателя:

```text
npx vsce login <publisher id>
```

Вставь токен. Успех выглядит так:

```text
The Personal Access Token verification succeeded for the publisher '<publisher id>'.
```

### Вариант без PAT (долгосрочный)

`vsce publish --azure-credential` в пайплайне Azure DevOps с Workload Identity Federation и user-assigned managed identity. Полные шаги в [официальной документации](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)

## 4. Изменить package.json

```json
{
  "publisher": "<publisher id>",
  "version": "0.1.0",
  "license": "MIT",
  "repository": { "type": "git", "url": "<url репозитория>" },
  "icon": "icon.png",
  "galleryBanner": { "color": "#1e1e1e", "theme": "dark" },
  "keywords": ["env", "dotenv", "secrets", "mask", "security"]
}
```

И **удалить** `"private": true` — расширение для публикации не должно быть приватным пакетом.

`keywords` максимум 30, иначе публикация падает с ошибкой. `icon` — PNG не меньше 128×128, SVG запрещён. `repository` должен указывать на публичный репозиторий: тогда `vsce` сам починит относительные ссылки в README.

## 5. Добавить файлы для маркетплейса

Маркетплейс показывает их на странице расширения:

- `CHANGELOG.md` — история изменений. Обязателен, чтобы пользователи видели, что было в новой версии.
- `SUPPORT.md` — куда писать о проблемах.
- `icon.png` — иконка 128×128 или больше.
- `LICENSE` — уже есть, но впиши настоящего владельца вместо `Env Veil contributors`.

## 6. Финальная проверка перед публикацией

Все команды запускать из корня проекта.

```text
npm run lint
npm run typecheck
npm test
npm run package
npx vsce ls
```

`npx vsce ls` печатает, что попадёт в пакет. В списке должно быть ровно:

```text
LICENSE
package.json
README.md
dist/extension.js
dist/webview/main.js
dist/webview/styles.css
```

Ни TypeScript, ни тестов, ни `.env.manual-*` быть не должно. Если что-то лишнее появилось — правь `.vscodeignore`.

## 7. Обкатать на своей машине

Установи собранный VSIX:

```text
code --install-extension dist/env-veil.vsix
```

Либо через интерфейс: Extensions view → **Views and More Actions…** → **Install from VSIX…**.

Пройди пользовательский сценарий из `docs/manual-testing.md`, пункты 1–12.

Если расширение ставится в portable VS Code — там Extensions view тот же, путь к папке расширений другой, команда `code` указывает на обычную установку.

Осторожно: не запускай расширение из исходников и установленный VSIX одновременно на одном файле, иначе две копии расширения будут мешать друг другу.

## 8. Опубликовать

Разово, с указанием версии:

```text
npx vsce publish 0.1.0
```

Или с автоматическим повышением:

```text
npx vsce publish minor
```

`vsce publish` внутри git-репозитория дополнительно создаст коммит и тег с номером версии. Если это не нужно, добавь `--no-git-tag-version`.

После публикации проверь страницу расширения на маркетплейсе и установи его как обычный пользователь — так проверяется, что в пакет попало всё необходимое.

## 9. Обновление Later

Каждый следующий релиз требует **нового номера версии**. Номер нельзя переиспользовать, последнюю версию удалить нельзя.

```text
npm test
npm run package
npx vsce publish patch
```

## 10. Если что-то пошло не так

- **403 / 401** — в PAT выбрана конкретная организация вместо **All accessible organizations**, либо нет scope `Marketplace (Manage)`.
- **The extension 'name' already exists** — имя занято. Вернися к шагу 1.
- **You exceeded the number of allowed tags of 30** — сократи `keywords`.
- **Ссылка в README не работает** — не задан `repository` либо репозиторий приватный.

Снять с публикации: https://marketplace.visualstudio.com/manage → **More Actions → Unpublish**. Расширение перестаёт быть доступным, но остаётся discoverable. Полное удаление (**Remove**) необратимо и освобождает ли ID издателя, но **не освобождает имя расширения**.
