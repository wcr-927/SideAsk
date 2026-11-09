# SideAsk

读一篇很长的回答时，如果只对其中一步推导有疑问，可以复制那一句，按 **⌥ Option + 空格** 呼出 SideAsk，在浮页里追问。点回原来的窗口就能接着读，对话和旁注留在 SideAsk，下次还可以继续。

SideAsk 是一款 macOS 桌面应用，通过本机已登录的 OpenAI Codex CLI 回答问题，支持 Markdown、数学公式和代码。当前提供源码构建方式。已验证的环境为 Apple Silicon、macOS 27.2 和独立 Codex CLI 0.162.1。

## 安装与登录

1. **准备 Mac 开发工具。** 已安装 Xcode 或命令行工具的用户，可以在终端运行 `swiftc --version` 和 `/usr/bin/python3 --version` 确认。首次安装命令行工具可运行 `xcode-select --install`。
2. **准备 Codex。** 按官方说明安装 Codex CLI，在终端运行 `codex login`，按提示使用自己的账户登录，再运行 `codex login status` 确认。SideAsk 会复用本机登录，提问和自动生成探索标题会使用相应的模型额度。[Codex CLI 安装指南](https://developers.openai.com/codex/cli/)
3. **下载并构建 SideAsk。** 在 GitHub 仓库页面选择 **Code → Download ZIP** 并解压。在终端输入 `cd `（末尾留一个空格），把解压后的项目文件夹拖进终端，按回车。然后运行：

   ```sh
   ./scripts/build.sh
   open build/SideAsk.app
   ```

首次打开会看到管理台。若要长期使用，把 `build` 文件夹里的 `SideAsk.app` 拖到「应用程序」。

## 第一次提问

**想直接问一个问题**，在管理台点 **＋ 新建 → 随问**。例如输入「为什么点电荷的电势与距离成反比？」并发送。第一次发送后，这条对话会出现在「随问」列表。

**想读懂一篇已有的回答**，选 **＋ 新建 → 探索**：

1. 在上框粘贴完整回答。如果回答基于一份论文或课件，把对应的 PDF、DOCX 或 PPTX 拖入下框，然后点「创建」。
2. 回到原来的应用继续读。遇到不懂的句子，复制它，按 **⌥ Option + 空格** 唤出浮页，输入「这一步为什么成立？」。也可以直接提问，或点输入框左侧的引号手动添加引用。
3. 如果 SideAsk 的回答又引出了疑问，选中那段解释，点「再问」。以后点原段落旁的 **Ⅱ** 或 **Ⅲ** 就能重开这条旁注。一个原回答下的追问都归在同一篇探索里。

点浮页外收起，再按快捷键可回到上次的位置。点顶栏篇名可切换最近的探索或随问；点应用图标可返回管理台。快捷键、自动引用剪贴板、模型和推理强度都可在管理台右上角的设置中调整。

## 对话和资料如何使用

对话、草稿、阅读位置和导入的资料保存在本机。创建探索时，SideAsk 会将粘贴的原文交给 Codex 概括标题；在探索中提问时，会发送原文、当前对话路径、问题及引用。附件在本机提取文字，相关节选会随问题发送。回答中的资料引用可以点开，对照文件页码、段落或幻灯片。每次模型请求使用 Codex 临时线程。

## 遇到问题

- **快捷键没反应。** 点 macOS 菜单栏里的 **S** 打开浮页或管理台。若组合键已被占用，进入设置，点击快捷键键帽重新录入。
- **提示找不到 Codex。** 先在终端运行 `codex --version` 和 `codex login status`。如果终端能找到 CLI，而应用找不到，可在项目目录用下面的命令启动，让 SideAsk 使用同一个可执行文件：

  ```sh
  SIDEASK_CODEX="$(command -v codex)" ./build/SideAsk.app/Contents/MacOS/SideAsk
  ```

## 开发与许可

[技术方案](docs/技术方案.md) · [需求与 macOS 验收记录](docs/需求与验收.md)

SideAsk 采用 [MIT 许可证](LICENSE)。随包的 Markdown 解析器、公式渲染器和数学字体保留各自的授权，详见[第三方声明](THIRD_PARTY_NOTICES.md)。
