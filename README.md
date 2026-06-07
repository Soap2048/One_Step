# 考研倒计时闭环记录器

一个本地优先的考研倒计时闭环记录器，现在已配置为 Tauri macOS 桌面应用。前端仍保留原有功能，数据继续保存在 `localStorage` 中。

## 功能

- 自定义考试日期、起始日期、科目、阶段
- Dashboard 显示 D 日、剩余天数、当前阶段、今日完成率、连续完成天数
- 添加每日任务：科目、任务名、备注、完成状态
- 每个任务填写闭环记录：输入、输出、检查、修正、明天继续点
- 每天自动评级：A/B/C/D
- 默认错因标签和自定义错因标签
- 固定周期复盘、评级日历和周期统计
- AI 周复盘：基于最近 7 天结构化学习记录生成具体复盘
- 桌面端窗口、Dock 图标、应用名称和 macOS 打包配置

## 数据保存

当前数据使用浏览器标准 `localStorage`。Tauri 在 macOS 上会为应用 WebView 保存独立的本地存储，关闭应用后不会丢失。

如果更换应用 `identifier`，macOS 会把它视为另一个应用，localStorage 位置也会变化。

## 安装依赖

需要先安装：

- Node.js 18 或更高版本
- Rust 工具链
- Xcode Command Line Tools

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
npm install
```

如需构建 Apple Silicon + Intel 通用包，还需要安装 Rust target：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

## 本地运行

```bash
npm run dev
```

这会启动 Tauri 桌面窗口，应用名称为“考研倒计时闭环记录器”。

## 打包 macOS App

生成当前架构的 `.app` 和 `.dmg`：

```bash
npm run build:mac
```

生成 Apple Silicon + Intel Mac 通用包：

```bash
npm run build:mac:universal
```

## 生成文件位置

打包完成后，产物位于：

```text
src-tauri/target/release/bundle/macos/
src-tauri/target/release/bundle/dmg/
```

通用包通常位于：

```text
src-tauri/target/universal-apple-darwin/release/bundle/macos/
src-tauri/target/universal-apple-darwin/release/bundle/dmg/
```

## 纯浏览器打开

如果只想查看前端页面，也可以直接打开：

```text
index.html
```
