# 更新兼容与文档集成

## 范围与结果

- 将更新兼容提交 `2f280c7` 和文档提交 `e8a4603` 无冲突合入已发布 main `7126909`，本地对应 `f9b0095`、`c84fa0b`。本轮不改变功能版本、安装位置或用户数据。
- 更新检查先读 RefTray；只有 404 才读旧仓库。下载地址只接受两个指定仓库下对应版本和文件名，安装包仍叫 InspirationCollector，原长度、SHA256、忙碌检查、更新和恢复流程保持。
- 文档说明安装、使用、MCP 和排错步骤，补全来源、署名、水印、分享、商用、第三方组件许可和 AI 客户端数据说明。
- B01 复核：本轮只改更新发现与源地址匹配，无新依赖，不改采集参数、任务所有权、存储或恢复状态。错误保留为错误；限流、网络错误和非法元数据不触发旧仓库重试。

## 验证（Windows，本地集成源码）

证据目录：`F:/RefTray/source/work/integrate-rename-docs`。

- `python-collector.log`：169 项通过，包含 8 项架构检查及更新、恢复、MCP 相关测试。解释器为 `F:/RefTray/app/runtime/python.exe` 3.13.17，导入路径指向集成源码。
- `python-distribution.log`：41 项通过，覆盖分发、依赖预检反例、帮助页面和语音组件规则。
- `javascript.log`：干净检出为 168 通过、2 项缺少 `tests/collector/fixtures/bilibili-season-5056136.json`。这是基线已有遗漏，不是兼容修改引入。
- `fixture-check.json`、`javascript-with-local-fixture.log`：从原工作树复制既有样本并核对 SHA256 后，170 项通过。只复制到隔离工作树，尚未提交该样本。Node 为 24.16.0。
- `docs-validation.json`：11 篇改动文档、84 个相对链接、UTF-8 和 11 页离线帮助检查通过。预览在同目录 `help-preview`。
- `build-preflight.json`：沿用已发布工作树的构建输入，先确认两份依赖文件与集成源码逐字节一致，再用已存在的 Python 3.11.15 和 pip 26.1.2 完成 Windows/Python 3.13 离线解析。15 个锁定依赖、C#/Inno 编译器、13 个语音组件文件及原生帮助命令、Python/媒体源码摘要通过。集成目录未复制构建输入，未生成 payload 或安装包。
- `compatibility-check.json`：离线样本中，旧发布版解析器接受旧仓库、拒绝改名后的资产 URL；本轮解析器两者均接受。`live-update-check.log` 记录本次官方 API 的 403 限流，未重试，不算线上通过。
- `original-checkout-preservation.json`：原分支 `fix/review-0537`、HEAD `b502305`、137 个已改动或未跟踪文件摘要及 Git 状态完全保持。

## 发布前下一步

1. 将已有 B 站测试样本纳入版本控制，消除干净检出缺输入的问题。
2. 选择高于 1.0.0 的补丁版本，例如 1.0.1；同步 manifest、Release 说明和下载文档。保留 InspirationCollector 安装包文件名、AppId、状态路径和校验文件约定，不覆盖 1.0.0 资产。
3. 在新的干净构建目录准备本次已核验的输入，再运行预检、完整打包、文件清单/摘要和隔离启动退出检查。执行实际安装或升级验收需另按相应授权进行。
4. GitHub 限流解除后复验官方元数据、校验文件和旧版到兼容版的更新发现。取得发布许可后再推送、打标签和发布新 Release。
5. 仓库改名时机由用户决定。先让用户升级到兼容版能减少中断，但不能让未升级的旧客户端自动获得新逻辑。改名后更新仓库与文档链接，并准备旧版手动下载安装说明。

本轮完成源码与文档集成、回归和构建前检查；发布、安装、仓库改名和干净 Windows 验收均未执行。
