# SideAsk

**[下载 macOS 安装包（DMG · Apple Silicon）](https://github.com/wcr-927/SideAsk/releases/latest/download/SideAsk-AppleSilicon.dmg)** · [所有版本](https://github.com/wcr-927/SideAsk/releases)

按 **⌥ Option + 空格**，在正在使用的 Mac 应用旁呼出一张 AI 聊天卡片。用完点回原窗口，就能接着手头的事。

| 想做什么 | 选择 |
| --- | --- |
| 临时碰到一个概念、想问一句话，或者围绕同一个话题连续聊几轮 | **随问**。直接输入就能开始，也可以带上一段引用。 |
| 正在读一篇长回答，想补全某步推导，又想记住每个疑问来自哪一段 | **探索**。把长回答作为背景，按原句展开旁注，还能关联 PDF、Word 和 PPT 资料。 |

SideAsk 通过本机已登录的 OpenAI Codex CLI 流式显示回答，支持 Markdown、数学公式和代码。安装包的系统目标为 macOS 26.0 起，实际验收环境为 Apple Silicon、macOS 27.2 和独立 Codex CLI 0.162.1。

## 安装与登录

1. **下载安装包。** 点击上方的 DMG 链接，双击下载的文件，将 **SideAsk** 拖入旁边的 **Applications（应用程序）**，然后从「应用程序」中打开。当前版本采用本地签名，尚未经过 Apple 公证，首次打开时 macOS 可能提示无法验证开发者。[Apple 关于打开应用的说明](https://support.apple.com/zh-cn/102445)
2. **准备 Codex。** SideAsk 使用本机已登录的 Codex。使用独立 CLI 时，先在终端运行 `codex login`，再用 `codex login status` 确认。提问和自动生成探索标题会使用相应的模型额度。[Codex CLI 安装指南](https://developers.openai.com/codex/cli/)
3. **首次运行。** 打开管理台，点 **＋ 新建 → 随问** 测试提问。当前版本通过 `/usr/bin/python3` 调用 Codex 和处理资料；如果系统提示缺少开发者工具，按提示安装命令行工具即可。使用 DMG 可以跳过编译，也无需下载完整 Xcode。

<details>
<summary>从源码构建</summary>

安装 Xcode 或 macOS 命令行工具（`xcode-select --install`），下载并解压仓库源码，在项目根目录运行：

```sh
./scripts/build.sh
open build/SideAsk.app
```

在 Apple Silicon 上运行 `./scripts/package-dmg.sh` 可生成 `build/SideAsk-AppleSilicon.dmg`。

</details>

## 随问：从一个问题开始

在管理台选 **＋ 新建 → 随问**。如果浮页已经打开，点顶栏篇名，选 **随问 → ＋** 就能另开一条对话。

例如，先问「为什么点电荷的电势与距离成反比？」，再问「那为什么电场强度与距离的平方成反比？」。在同一条随问里直接接着输入，模型会结合前面的问答继续解释。想针对某句话提问时，点输入框左侧的引号添加引用；也可以选中回答中的句子，点 **再问** 把它带入下一轮。

第一次发送后，这条随问才会出现在列表里，标题取自首个问题。收起浮页后可按快捷键继续上次的对话；想找另一条，点顶栏篇名下的 **随问**。更早的记录可以在管理台搜索、重命名或归档，也可以从「归档」恢复。

## 探索：沿着一篇长回答追问

在管理台选 **＋ 新建 → 探索**。

1. 在上框粘贴完整回答。如果回答基于一份论文或课件，把对应的 PDF、DOCX 或 PPTX 拖入下框，然后点「创建」。
2. 回到原来的应用继续读。遇到不懂的句子，复制它，按 **⌥ Option + 空格** 唤出浮页，输入「这一步为什么成立？」。也可以直接提问，或点输入框左侧的引号手动添加引用。
3. 如果 SideAsk 的回答又引出了疑问，选中那段解释，点「再问」。以后点原段落旁的 **Ⅱ** 或 **Ⅲ** 就能重开这条旁注。一个原回答下的追问都归在同一篇探索里。

## 管理台与设置

点浮页顶栏的应用图标可回到管理台。「近况」展示累计探索数、近期活跃天数、已记录的追问 Token 用量和默认 AI 接入。点探索篇名可续读，点「旁支」可展开问题并直接跳转。

管理台右上角的设置可以更换全局快捷键、调整模型与推理强度，以及决定是否在唤出浮页时自动引用刚复制的文字。

## 对话和资料如何使用

对话、草稿、阅读位置和导入的资料保存在本机。随问会把当前这条对话的问答和引用发给 Codex。创建探索时，SideAsk 会将粘贴的原文交给 Codex 概括标题；在探索中提问时，会发送原文、当前对话路径、问题及引用。附件在本机提取文字，相关节选会随问题发送。回答中的资料引用可以点开，对照文件页码、段落或幻灯片。每次模型请求使用 Codex 临时线程。

## 遇到问题

- **快捷键没反应。** 点 macOS 菜单栏里的 **S** 打开浮页或管理台。若组合键已被占用，进入设置，点击快捷键键帽重新录入。
- **提示找不到 Codex。** 先在终端运行 `codex --version` 和 `codex login status`。如果终端能找到 CLI，而应用找不到，通过 DMG 安装后可用下面的命令启动，让 SideAsk 使用同一个可执行文件：

  ```sh
  SIDEASK_CODEX="$(command -v codex)" /Applications/SideAsk.app/Contents/MacOS/SideAsk
  ```

## 开发与许可

[技术方案](docs/技术方案.md) · [需求与 macOS 验收记录](docs/需求与验收.md)

SideAsk 采用 [MIT 许可证](LICENSE)。随包的 Markdown 解析器、公式渲染器和数学字体保留各自的授权，详见[第三方声明](THIRD_PARTY_NOTICES.md)。
