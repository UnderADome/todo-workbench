# 待办工作台 TodoList

一个面向个人的 Windows 桌面待办工具。以「功能区域 → 项目 → 日期 → 当日待办项 + 历史遗留项」五列组织任务，支持多级子项、状态机、软删除/回收站、提醒、托盘与本地 SQLite。

## 下载安装

Windows x64 安装包见 [GitHub Releases](../../releases/latest)。安装包未签名，Windows SmartScreen 可能提示。

## 已实现功能

- 五列布局：功能区域 / 项目 / 日期 / 当日待办项 / 历史遗留项。
- 三列导航可折叠为 48px 图标栏；历史栏可关闭为 0，右侧悬浮把手恢复。
- 列宽拖拽、折叠状态、窗口尺寸持久化；1280/1100/980/860 断点适配，最小 800×600。
- 项目新建 / 重命名 / 归档 / 取消归档 / 置顶；置顶项目优先，其余按最后编辑时间排序。
- 日期动态派生，支持历史补录与未来日期；可通过日期列日历按钮跳转任意日期。
- **项目级日期分组**：按天 / 按周 / 每 N 天 / 自动 + 手动区间混合；每个项目独立保存规则；全部项目历史使用单独的全局规则，新建项目继承该全局默认；选择区间后第四列显示区间内全部 todo，任务保持单 `todo_date`、不复制。
- **按区域字体设置**：标题栏、功能区、项目、日期、待办项、历史遗留项、弹窗与提示分别设置字号（90%–150%）和字体（系统预设 + 自定义），保存后持久化；字号只缩放文字，不改变列宽与间距。
- **快捷操作**：选中任务后可用快捷键编辑、添加子项、置顶、设置优先级、标记不做和删除；任务行提供快捷按钮与右键菜单，双击任务即可编辑；快捷键可在设置中调整并持久化。
- **列表式 / 便签式任务视图**：任务列表可切换列表式与便签式；便签式将根任务显示为便签、子项内嵌为清单，宽窗口两列、窄窗口单列；每个项目独立记住视图，设置中可指定新建项目默认视图。
- **多行任务**：新增和编辑支持多行文字，Shift+Enter 换行，Enter 添加或保存；卡片、历史、搜索和回收站保留换行。
- **长期任务**：根任务和子项可标记“长期工作”；根任务汇总标签；默认在日期列各分组重复显示，可在设置关闭；历史遗留项只出现一次。
- **完成时间**：完成时记录并显示完整日期时间；取消完成后再次完成时可选择保留上次时间或使用当前时间作为最终完成时间。
- **项目选择排序**：设置可控制选择项目后是否跳到项目列表最上方，默认关闭。
- **使用说明与更新日志**：左侧底部可打开完整使用说明和按版本整理的更新日志；更新日志由项目内的 `release-changelog` 技能辅助维护。
- Todo 状态机：待办 / 已完成 / 不做 / 已删除（软删除）。
- 多级/不限层级子项，递归完成联动、父项进度、卡片式树形渲染。
- 已完成展示方式：列表底部（默认）/ 原位 / 隐藏；任务置顶；创建时间与优先级排序。
- 历史遗留项默认当前项目，可切换全部项目；**不包含今日与未来**。
- 搜索当前项目全部日期；基础状态/优先级筛选。
- 提醒设置：提前 0/5/15/30/60 分钟；不重复 / 每天 / 每周 / 每月 / 每 N 分钟；稍后 5/10/30 分钟。
- Windows 系统通知、错过补提醒、点击通知通过协议激活定位到对应 todo（含第二实例/冷启动）、托盘常驻、关闭到托盘、单实例、开机自启（安装版）。
- 回收站 30 天保留、恢复、单条/批量永久删除、过期清理；每日自动备份（保留 7 份）。
- 本地 SQLite；无云同步；数据位于 Electron `userData` 目录。

## 技术栈

- Electron 45
- React 19 + TypeScript + Vite 8
- electron-vite
- better-sqlite3
- Zustand
- date-fns
- lucide-react
- electron-builder（Windows x64 NSIS）

## 开发

```bash
npm install
npm run dev
```

如果当前终端设置了 `ELECTRON_RUN_AS_NODE=1`，`npm run dev` 使用的包装脚本会自动移除该变量，确保以真正的 Electron 模式启动。

常用命令：

```bash
npm run typecheck   # 主进程 + 渲染层类型检查
npm run build       # 构建 out/
npm run start       # 预览构建产物
npm run dist        # 构建并生成 Windows NSIS 安装包
```

安装包输出：`release/待办工作台-0.6.0-setup.exe`（未签名，Windows SmartScreen 可能提示）。

## 测试

自动化冒烟测试基于 Playwright Core 驱动 Electron：

```bash
npm run test:smoke    # 新增任务 / 多级子项 / 完成 / 删除撤销 / 历史 / 搜索 / 提醒 / 设置
npm run test:smoke2   # 设置 / 项目重命名 / 归档恢复 / 回收站 / 折叠 / 列宽 / 断点 / 托盘 / 通知
npm run test:smoke3   # 提醒调度 / 自动备份 / 单实例（约 40 秒）
npm run test:smoke4   # 子项级联 / 编辑 / 置顶 / 子项删除 / 全部项目历史
npm run test:smoke5   # 项目级日期规则 / 按周/N 天聚合 / 手动区间 / 区间新增日期 / 持久化
npm run test:smoke6   # 按区域字号/字体 / 自定义字体 / 应用到全部 / 持久化 / 0.6.0 版本号
npm run test:smoke7   # 快捷键 / 快捷按钮 / 右键菜单 / 双击编辑 / 空编辑不更新时间 / 使用说明 / 更新日志
npm run test:smoke8   # 多行任务 / 子项卡片 / 项目置顶 / 项目级日期规则 / 全局历史规则 / 通知定位 / 回收站永久删除
npm run test:smoke9   # 提醒协议注册路径 / 第二实例协议激活 / 冷启动协议定位
npm run test:smoke10  # 列表式/便签式切换 / 按项目记忆 / 便签自适应列数 / 新建项目默认视图
npm run test:smoke11  # 长期任务标签与跨分组显示 / 长期重复设置 / 完成时间 / 再次完成确认 / 项目跳顶设置
```

可用 `TODOLIST_TEST_EXECUTABLE` 指向打包后的 `release/win-unpacked/待办工作台.exe` 运行 smoke8–11，验证安装产物：

```bash
TODOLIST_TEST_EXECUTABLE=release/win-unpacked/待办工作台.exe npm run test:smoke8
TODOLIST_TEST_EXECUTABLE=release/win-unpacked/待办工作台.exe npm run test:smoke9
TODOLIST_TEST_EXECUTABLE=release/win-unpacked/待办工作台.exe npm run test:smoke10
TODOLIST_TEST_EXECUTABLE=release/win-unpacked/待办工作台.exe npm run test:smoke11
```

测试使用独立的 `e2e*-data` 目录，不会影响正常数据；测试产物已被 `.gitignore` 忽略。

## 数据目录

- 开发/安装版由 Electron 决定，通常为 `%APPDATA%/<应用名>`。
- 数据库：`todolist.db`（WAL 模式）。
- 自动备份：`userData/backups/todolist-YYYY-MM-DD.db`，保留最近 7 份。
- 设置中可打开数据目录或立即备份。

## 说明与后续

- 本期仅 SQLite；MySQL / 云同步作为后续扩展。
- P1 尚未实现：任务/项目拖拽排序、分组、深色模式、高级筛选、数据导出、统计。
- 系统通知点击后会打开应用并定位到对应待办项；通知操作按钮支持以 Windows 系统能力为准。
- 版本变化见 [CHANGELOG.md](CHANGELOG.md)。
- 发版更新日志维护技能见 [.claude/skills/release-changelog/SKILL.md](.claude/skills/release-changelog/SKILL.md)。

## 许可

本项目基于 [MIT License](LICENSE) 开源。
