# RefTray 当前交接

更新：2026-11-04。状态：0.5.28 修改说明执行中，尚未部署或发布；不要把此阶段误报成整份说明完成。

## 入口与基线

- 当前集成源码：`F:/Codex/Workspaces/2026-09-02/referenced-chatgpt-conversation-this-is-an/reftray-0528-review`
- 分支：`fix/reftray-0528-review`；Hermes 应用基线 `acafb7346f835a834842a831f386ad4b537acfd2`，文档基线 `ed948dd`。当前提交用 `git log -1 --oneline` 查，改动用 `git status --short` 查。
- 当前安装：`F:/LibLib自动化/plugins/liblib-automation/scripts/collector`，manifest 0.5.28；本轮修改尚未覆盖此处。
- 已按换行归一核对安装代码与基线。requirements 有版本差异，禁止盲目重装依赖。旧 collector-repair 分支及其他 0.5.26 副本不作交付基线。
- 任务依据：`E:/下载/RefTray_0.5.28_修改说明.docx`。最新补充：弹窗 320px、暖灰底色，每次交付留短交接。旧素材和偏好保留，未获本轮推送授权。
- Ivy v0.5：`C:/Users/Admin/.codex/ivy-dev-system/AGENTS.md`，SHA256 `CF3F4F57E9FFB39F91453FC5FA0AA21C58B46F08D3253668C9AE2953C2783C02`。

## 已修改，待整合验收

- P1/P2/X2：Pinterest 同源尺寸/格式合并、Pin/嵌套 visual-search 身份；X 上游 rest_id 缺失与错误身份区分、排除引用媒体。集成提交 `17118be`，源提交 `7a0928aa`。新增 helper 已接入 popup 和采集注入顺序。
- 弹窗宽度改为 320px，暖灰底色 #f2f0eb、浮层 #faf8f3、文字 #292824、说明 #6b6860。字号沿用明确层级 17/15/13/12/11px；菜单、对话框适配宽度，避免禁用透明度叠加。
- 开发入口改为本短交接优先；交付前必须更新状态与证据。

## 全量任务队列（仍有效，不能遗漏）

1. 采集保存：P1/P2/X2 已改待实际验证；轻量页面预识别、X1 图片不依赖视频解析、D1 查询参数身份、D2 图片内容校验、D3 OCR 无文件记录补齐、D4 抽帧额度传播尚未完成。
2. 任务契约：T1 总体/单项进度、T2 停止与幂等、T3 检查点同步；TaskContext/TaskStore/可注入 app；A1 选项合并、A2 API 重连/分页；任务日志详情。尚未实施。
3. 运行交付：U1 引导、U2 更新、U3 卸载；W1 子进程生命周期、W2 轻量健康检查、W3 构建/升级。尚未实施。
4. UI：320px/暖灰先落实，其余设置页、布局与任务日志按文档继续；批量打开目录必须是批次/作者/合集目录，不能误进单篇。尚未整体验收。

## 保留边界

- 保留 Hermes 已有逐篇读取保存、取消磁盘预留、任务级下载确认、下载大小限制、时长筛选、B站 CID 修复和现有后台启动链。
- 本轮不迁移旧素材、不清空偏好、不新增后台定时任务。不把离线测试当作在线平台或安装包验证。
- Pinterest 顶层 visual-search UI 仍保守引导原 Pin；不能确认原 Pin 时不采推荐结果。

## 验证与下一步

- 源修复 worker：Node Pinterest 7/7、Python collector 15/15；已验证修前反例失败。均为离线测试，无真实下载验收。
- 主控集成复核：Pinterest Node 7/7、Python collector 15/15；background 语法和 git diff --check 通过。
- 本地 Chrome 无头静态预览：320px 宽、scrollWidth 320；暖灰 rgb(242,240,235)；高级选项展开后宽度仍 320，高度 585.3 < 600。未连接真实扩展后台。预览见 outputs/reftray-0528-popup-320-warmgray.png（用户交付目录）。
- 下一步：先完成第一批剩余保存问题并验证，再进入任务契约；UI 预览与实机采集验收分别记录。部署前核对本机 0.5.28 是否被 Hermes 再次改动，禁止覆盖未合并修改。

## 快速核验（不扫描全库）

`git status --short`；`git log -1 --oneline`；读取 `source/extension/manifest.json`。

定向测试：`node --test tests/collector/test_pinterest_identity.cjs`；Python 使用已安装 `.runtime/Scripts/python.exe`，`PYTHONPATH=source`，运行 collector 测试。前端先做本地静态预览，不启动采集或下载。
