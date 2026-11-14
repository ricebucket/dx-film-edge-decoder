# 开发与部署

向 `main` 推送就会发布网站：GitHub 先运行一部分测试，然后部署 `site/`。本页按先后顺序列出与此有关的每一个步骤。各条命令的作用见 [README](README.zh-CN.md#测试)；胶片数据的步骤见 [data/README.zh-CN.md](data/README.zh-CN.md#更新数据)。

## 在一台新机器上，只做一次

1. 安装 [Node.js](https://nodejs.org/) 22 或更高版本。
2. 在本文件夹之外安装 Playwright 和 axe-core，以及它们的浏览器：

   ```sh
   cd ~ && npm install @playwright/test @axe-core/playwright && npx playwright install --with-deps chromium webkit
   ```

3. 在本文件夹之外安装 TypeScript 和 Node 自带模块的类型：

   ```sh
   cd ~ && npm install typescript @types/node
   ```

4. 安装 REUSE 工具：`pipx install reuse`。
5. 中文截图和视频需要中文字体（在 Ubuntu 上是 `fonts-noto-cjk` 软件包）。
6. 只有重新转录 I3A 列表时才需要：带 PyMuPDF 的 Python 3。
7. 在 GitHub 上对仓库设置一次：在 Settings → Pages 中，把 “Source” 设为 “GitHub Actions”。

本文件夹中不安装任何东西。`package.json` 没有依赖，并且一直保持这样。

## 每一次修改

- 修改编解码器之前，先读 [research/01](research/01-edge-code-format.zh-CN.md) 和 [research/02](research/02-frame-numbers.zh-CN.md)。修改胶片数据之前，先读 [research/03](research/03-dx-numbers-and-registry.zh-CN.md) 和 [research/04](research/04-community-database.zh-CN.md)。
- 一次修改只做一件事。
- 同时添加或调整测试：单元测试放在 `tests/unit/`，浏览器测试放在 `tests/e2e/`。
- 如果一项浏览器测试在手机上表现不同或只在手机上运行，给它加上 `@phone` 标记。缺少标记时 `npm test` 会失败。
- 在浏览器测试中，必须相互一致的大小和位置要在同一步（一次 `page.evaluate`）中测量：手机上的片条在画出之后片刻才滚动。
- 在 `tests/mutants.mjs` 中为它添加一个变异体：把这次修改重新去掉，旁边写明此时必须失败的测试。
- 页面上的文字用 `t()` 查找，并在同一次修改中写入 `site/js/i18n/` 中的每一个语言文件。来源页面要在它的每个版本中修改。
- 文档要在同一次修改中改动它的两个版本：`X.md` 和 `X.zh-CN.md`。
- 页面显示的值（胶片、感光厂、规则、数字）只能来自 [research/06](research/06-sources-and-licensing.zh-CN.md) 中列出的来源。新的来源要加入其中。
- 关于格式或数据的发现，写入负责该主题的研究报告，两个版本都写。关于数据的发现用 `npm run stats:community-data` 打印的数量来表述。研究报告从不说明工具做什么：那属于代码注释、测试和 README。
- 代码中指某一种胶片时，用它的记录编号（`lookup.byId`），而不用DX码、暗盒编号或名称。页面从不显示记录编号。
- 新文件需要在 `REUSE.toml` 中有许可证。来自别处的文件还需要在其中单独添加一项，在 `LICENSES/` 中放入许可证全文，并在 research/06 中写明来源。
- 生成或检查项目某一部分的脚本放在 `scripts/` 中。
- 页面加载的脚本或样式表放在 `site/js/` 或 `site/css/` 下，部署时会在那里写入部署标记。
- 页面不向其他网站发出请求，并且仍然可以直接从磁盘打开（`site/index.html`）：使用传统脚本，不用模块，也不用 worker。
- 不使用不推荐的浏览器功能（`document.write`、同步请求等）；页面的布局或运行所依赖的东西，也不使用只有较新的浏览器才有的功能。

## 当一项修改不应该移动任何东西时

1. 修改之前，把 `site/` 复制到项目之外的一个文件夹。
2. 修改之后，运行 `npm run check:regressions -- --against <那个文件夹>`。它会列出页面上位置或大小发生变化的每一个元素。
3. 在三种设备上运行浏览器测试：`npm run test:e2e`。

## 当某个特定部分发生变化时

- **片条，或者鼠标悬停和按键在其中的行为：**用浏览器的性能面板，在放慢处理器的情况下，分别在像素比为 1 和 2 时测量鼠标划过各个单元的开销。仓库中没有做这件事的脚本。
- **片条或结果中用背景或遮罩绘制的内容：**查看打印出来的页面。
- **胶片的图（片条、照片示例、图示、暗盒）：**保持按比例绘制，以单元为单位确定大小（[research/05](research/05-reading-real-film.zh-CN.md)）。
- **照片读取功能：**7 根细条的编码仍然必须读得出来。把它从 7 根细条的照片中读出的结果与修改之前的版本比较。
- **编解码器，或图示的标签：**运行 `npm run figures`（它是 `npm run media` 的一部分）。图示过时期间 `npm test` 会失败。
- **胶片数据：**按 [data/README.zh-CN.md](data/README.zh-CN.md#更新数据) 操作。
- **新增一种语言：**按 [README](README.zh-CN.md#语言) 操作，然后运行 `npm run check:regressions -- --update`，它会为这种语言写出快照。
- **GitHub 工作流：**`npm test` 会检查它列出了哪些测试。工作流本身只在 GitHub 上运行：请留意它的第一次运行。

## 每次推送之前

1. `npm run before-push`。它依次运行下面各项，遇到第一项失败就停下；`npm run before-push -- --keep-going` 则照样运行其余各项。大约需要十分钟；修改过的浏览器测试多时会更久。
   - `npm test`：单元测试。它们还检查数据文件、图示、每种语言的文字、变异体列表和文档中的链接是否都是最新的。
   - `npm run check:types` 和 `npm run check:styles`。
   - `reuse lint`。
   - `npm run check:regressions`：把页面与它的快照比较。
   - `npm run test:e2e`：在桌面、Android 手机和 iPhone 上运行每一项浏览器测试。Android 手机只在这里运行。端口 4173 必须空闲（或者设置 `E2E_PORT`）。
   - `npm run test:repeat`：自上次推送以来新增或修改过的每一项浏览器测试，在每种设备上运行 20 次。
   - `npm run test:mutants`。大约需要四分钟。
   - `npm run media`。只有截图发生变化时，它才重新录制视频。如果改动只在视频中看得到（例如照片读取功能），`npm run before-push -- --videos` 无论如何都会重新录制。
2. 快照有差异时，处理这一差异，然后重新运行第 1 步：
   - 并非有意的差异：修正它。
   - 有意的差异：运行 `npm run check:regressions -- --update`，并阅读 `git diff tests/regressions`。
3. 如果这条命令指出浏览器测试的某个文件在各项测试之外有改动（例如一个辅助函数）：对用到这一部分的测试，逐项运行 `npm run test:repeat -- -g "测试名称中的词"`。
4. 查看这条命令列为有变化的图片，观看它列出的视频：`.github/` 中的截图和四段视频（两种画幅、两种语言），以及 `research/img/` 中的图示。
5. 提交之前查看 `git status`：
   - 有变化的快照、截图和视频都在这次提交中；
   - 每一份改动过的文档，它的另一个版本也在其中（缺少时这条命令会指出）；
   - `site/` 中没有文件带着部署标记（`BUILD = ''` 保持为空）。

## GitHub 运行什么，哪些留给上面的步骤

每次推送和每个拉取请求，GitHub 都会运行：

- `npm test`；
- 桌面上的每一项浏览器测试，分成四份；
- iPhone 上标记为 `@phone` 的浏览器测试。

这些在 `main` 上全部通过后，它把提交编号写入 `site/` 的一份副本并发布这份副本。它不从拉取请求发布，也不从复刻的仓库（fork）发布。

GitHub 不运行：

- Android 手机上的浏览器测试；
- 每种语言在第二种主题下对整个页面的无障碍检查；
- `npm run check:regressions`、`npm run test:mutants` 和 `npm run test:repeat`；
- `npm run check:types` 和 `npm run check:styles`；
- `reuse lint`；
- `npm run media`。

## 推送之后

1. 在仓库的 Actions 标签页中打开这次运行。每个任务都必须通过；“Deploy to GitHub Pages” 排在最后。
2. 失败的浏览器任务会把它的跟踪记录保留七天，作为这次运行的产物。
3. 只有 `main` 上最新的提交会被发布。如果网站落后于 `main`（例如较新一次推送的运行失败了），在 Actions 标签页中对 `main` 使用 “Run workflow” 可以重新发布。
4. 打开已发布的页面并刷新。部署之前就已打开的标签页在加载照片读取功能时可能会显示“此页面已过时。请刷新。”
