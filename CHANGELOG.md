# Changelog

## beta v0.1 - 2026-06-07

首个本地 beta 版本，用于归档当前可用 MVP。

### 已完成

- 本地 WebApp：考研倒计时闭环记录器。
- 多视图布局：Dashboard、今日任务、阶段、复盘、设置。
- Dashboard 显示 D 日、剩余天数、当前阶段、今日完成率、连续完成天数。
- 今日任务支持添加、完成、删除任务，并填写闭环记录。
- 闭环记录包含输入、输出、检查、修正、明天继续点。
- 每日自动评级 A/B/C/D。
- 错因标签支持默认标签和自定义标签。
- Review 页面支持普通日历、评级颜色、复盘周期、周期统计和任务详情。
- 复盘周期支持 3 天、5 天、7 天、30 天、90 天、全部。
- AI 周期复盘支持读取最近 7 天结构化学习记录并生成复盘结果。
- AI API 设置支持主流厂商预设、Base URL 自动填充、模型下拉、API Key 本地保存、显示/隐藏、测试连接。
- DeepSeek 模型列表更新为 `deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-chat`、`deepseek-reasoner`。
- 全局 toast、按钮 loading、危险操作确认、空状态和轻量页面切换反馈。
- 使用 localStorage 自动保存数据。
- 移除 JSON 导入/导出，保留本地自动保存。
- 添加 Tauri macOS 桌面应用配置、应用图标和打包脚本。

### 备注

- 当前版本不内置具体学习计划，由用户自行设置考试日期、起始日期、科目和阶段。
- Anthropic Claude 和 Google Gemini 已提供厂商预设，但 AI 周期复盘调用暂未完全适配其非 OpenAI-compatible API。
- macOS 打包依赖本机 Node.js、Rust、Tauri CLI 和 Xcode Command Line Tools。
