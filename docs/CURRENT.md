# RefTray 当前交接

当前主线：0.5.37已按用户要求合入GitHub main。旧main与所有历史分支已在本机archive分支及work/repository-before-main-0537-20261106.bundle归档；旧tag保留在本地。

更新：2026-11-06（Asia/Shanghai）。项目开发入口为本仓库；功能约定见 docs/SPEC.md，整仓审查任务见 docs/REVIEW_HANDOFF.md，版本交付记录见 docs/release-0.5.37.md。历史详细本机交接保存在原工作机 work/CURRENT-before-0537.md；Git历史保留旧版记录。

## 当前版本和授权

- 源码版本0.5.37；本机实际运行/安装仍0.5.36。本轮未安装或覆盖用户后台，不能把源码变化写为已安装。
- 用户授权本次打包并推送GitHub供Claude审查，附交付说明；不自动合并主分支。
- 用户已确认网页GIF恢复，明确要求不要再改。核心平台提取、页面媒体识别、视频下载、GIF转换和分段媒体文件与0.5.36构建输入逐字节一致。background.js/batch.js有新增评论图片分支，必须按条件审查，不能笼统说所有相关文件都没变。
- 本机源码 F:/RefTray/source；安装 F:/RefTray/app；素材库路径保持不变。未移动/清理旧素材。
- Ivy入口 C:/Users/Admin/.codex/ivy-dev-system/AGENTS.md，v0.5，SHA256 CF3F4F57E9FFB39F91453FC5FA0AA21C58B46F08D3253668C9AE2953C2783C02。外机不可读时报告未加载，不猜内容。

## 本次实施与证据

- 管理页中/EN按钮；记录与任务每页20条；后台先筛选后分页；未完成纳入部分失败，失败对应无成功保存；删除实测助手入口，诊断合并为一处。
- 评论数量默认10（设置及弹窗更多），X纯图片直接回复、配图来源和Markdown关联；仍要求确认父帖ID，仅已加载内容，未自动展开或滚动。
- 新本地视频转GIF/M4A音频入口，独立local_tools模块复用原转换核心；本机受授权上传、512MB上限、另存结果、单任务占用和退出停止检查。
- 下一次安装去掉完成后的重复扩展目录提示。此前安装占用及历史扩展目录同步修改一并随源码交付；详细累计范围以Git差异为准。
- 13项JS行为与15项Python任务/存储/Pinterest布局检查通过。管理页8项浏览器夹具通过；45条夹具记录每页20、记录第2页从21开始，任务第1页20条。
- 独立真实HTTP：本地GIF/M4A文件处理完成；42条失败任务第2页返回20；指定X帖此前登录Chrome观察到的4张回复图片真实联网保存成功，Markdown关联4处。不是新扩展完整Chrome入口验收。
- 本机证据 work/acceptance-0.5.37/results.json、preserved-media.json；不将本机状态/样本/日志上传GitHub。

## 未完成与验证边界

- 评论GIF尚未接入，网页GIF链路冻结。本版界面明示评论只含文字与静态图。
- 新评论及本地工具的实际安装Chrome完整入口仍待验收；全部平台解析前失败留记录没有完整回归。已有受理后任务记录逻辑保留，不宣称全站支持。
- 打包首次两次失败后按Ivy QA停止，用户已明确授权新一轮；改用本机Python3.11、PIP_USER=0后r3构建通过，1778文件哈希及独立Launcher启动/退出通过。运行包仍为Python3.13。
- 复查补修管理页将已同步旧记录误认作localOnly、导致不读后台详情的问题；增强浏览器夹具验证通过。最终构建纳入该修正，1778项清单哈希、源代码与包内文件一致性、Launcher独立启动/退出全部通过。
- 本机后台仍0.5.36，没有用新包覆盖。新增功能不能标记为已安装或全站验收。

## 最终交付

- 安装包 F:/RefTray/releases/0.5.37/InspirationCollector-0.5.37-Windows-x64-Setup.exe，41029834字节，SHA256 5e26565787e2a8dac11cd6f91ab58afc7829e68ababdb0e0a08d4219b30ba9f6。聊天outputs有同包及交付说明。
- GitHub主线 main。包含0.5.37产品代码、构建预检及后续文档更新。
- 实际安装仍0.5.36；没有执行本轮安装覆盖/升级，不宣称新评论/工具已在实际安装Chrome完整验收。

## 2026-11-06 构建依赖前置检查（仅工具与规范）

- 用户要求避免在打包阶段才发现已知依赖问题。SPEC B02和AGENTS接入必检；README给出独立 --check-dependencies 入口。
- build_windows.py正式打包在创建payload/dist前先执行离线dry-run解析；预检和安装共用参数与隔离后的pip环境。构建Python>=3.11，目标明确cp313/win_amd64；禁用用户pip配置并移除继承的PIP_*安装路由，不修改本机全局配置。
- 4项回归通过：低版本宿主在运行pip前拒绝、pip污染隔离且原环境不改、预检失败不生成payload/dist、目标ABI按运行包而非宿主设置。真实Python3.11带PIP_USER=1及错误PIP_TARGET预检15个锁定依赖通过；真实缺wheel输入在创建payload/dist前拒绝。
- 此次不修改产品/GIF/已交付0.5.37安装包，不重新安装。旧包构建证据仍归原提交；新检查用于后续构建，不追认旧包已经使用该检查。在同一GitHub审查分支维护。

## 2026-11-06 全仓审查交接

- 用户要求审查整个产品与代码，覆盖架构、规范、历史返工、反复未完成项和产品用途，不只看0.5.37改动。新增docs/REVIEW_HANDOFF.md，并从AGENTS、CURRENT及版本交付说明接入；它是审查任务书，不是审查结论。
- 远端重新fetch核验：main为ed948ddee35f62661bdd53bffe042bd23753e7b2，manifest0.5.28；0.5.37及后补构建检查在release/reftray-0.5.37-review，尚未合并main。本轮不执行合并或产品改动。

## 2026-11-06 主线合并与仓库整理

- 用户随后要求统一main，清理GitHub历史分支及旧测试发布，并把MCP和新功能写进README。此前“尚未合并”的记录属于合并前状态。
- 新增docs/mcp.md，记录stdio启动路径、五项工具、参数、会话范围和升级连接步骤。
- 旧远端分支含独有提交，已完整归档到本机archive分支与Git bundle；GitHub保留最新main。旧Releases元数据归档在work/repository-cleanup-20261106。
- README等说明的批量写入命令曾被自动审批拦截，未给原因。用户随后明确允许逐文件补丁；中英文README、安装/使用/更新说明及文档索引已按此方式更新。
- GitHub仅保留main；0.5.37已发布为Latest，安装包和SHA256校验文件均上传，服务器资产digest与本机已验证包一致。旧测试发布在新版下载入口更新后清理。
