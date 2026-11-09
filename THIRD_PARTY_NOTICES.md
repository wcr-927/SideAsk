# SideAsk 第三方声明

SideAsk 自有代码采用 MIT 许可证，见项目根目录的 `LICENSE`。下表列出随应用分发的第三方资源。源码中的文件位于 `macOS/vendor/`，构建后对应 `SideAsk.app/Contents/Resources/` 中的同名路径。

| 组件 | 随包内容 | 许可证及声明 |
| --- | --- | --- |
| KaTeX 0.19.1 | `katex.min.js`、`katex.min.css` | MIT，版权属于 Khan Academy 和其他贡献者。完整原文见 `katex-LICENSE.txt`。 |
| KaTeX 数学字体（随 0.19.1 发布） | `fonts/` 下的 20 个 WOFF2 文件 | SIL Open Font License 1.1。版权归属、12 个保留字体名称及许可证全文见 `fonts/OFL.txt`。 |
| Marked 17.0.5 | `marked.umd.js` | MIT，版权属于 MarkedJS 和 Christopher Jeffrey。上游文件还包含 John Gruber 的 Markdown 三条款再分发声明，两部分均保存在 `marked-LICENSE.md`。 |

以上 JavaScript、CSS、WOFF2 及原有的两份上游许可文件已与对应版本的 npm 发布包逐字节比对。字体保留原始文件及内嵌授权信息。[KaTeX 发布包](https://www.npmjs.com/package/katex/v/0.19.1) · [Marked 发布包](https://www.npmjs.com/package/marked/v/17.0.5) · [SIL OFL 官方原文](https://openfontlicense.org/open-font-license-official-text/)

## 系统资源与外部程序

界面的宋体、苹方、Optima、Georgia 等通过字体名称或系统字体族调用，设置齿轮通过 AppKit 调用系统符号。字体文件清单仅含上表的 KaTeX 数学字体。AppKit、WebKit、PDFKit、Vision 等框架由 macOS 提供。Python 解释器、Swift 工具链和 OpenAI Codex CLI 由用户环境提供，分发包中包含 SideAsk 自己编写的 Python 适配脚本。

## 项目图标

`macOS/Assets/SideAsk.png` 是维护者使用 AI 工具生成的项目图标，维护者已确认有权随项目发布。`SideAsk.icns` 和构建生成的顶栏图标源自该图。
