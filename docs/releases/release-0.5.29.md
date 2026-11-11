# RefTray 当前交接

更新：2026-11-05（Asia/Shanghai）。源码整合版 **0.5.29**；本机实际仍为 **0.5.28**，尚未覆盖、未 push。

## 唯一入口与决定

- 当前源码：`F:/Codex/Workspaces/2026-09-02/referenced-chatgpt-conversation-this-is-an/reftray-0528-review`，分支 `fix/reftray-0528-review`。提交查 `git log -1 --oneline`，变更查 `git status --short`。
- 正在运行：`F:/LibLib自动化/plugins/liblib-automation/scripts/collector`；health 返回 release0.5.28、root/inbox 均 F:/LibLib自动化、busy=false。
- 基线 Hermes acafb7346f835a834842a831f386ad4b537acfd2，文档 ed948dd。勿回到旧 collector-repair/0.5.26 开发。
- 依据：`E:/下载/RefTray_0.5.28_修改说明.docx`；UI 追加依据 `E:/下载/popup-preview.html` 与用户 RefTray 整体标识。确定 320px、暖灰 #f2f0eb、中/EN 按钮、原型行对齐。保留旧素材与偏好。
- Ivy v0.5：C:/Users/Admin/.codex/ivy-dev-system/AGENTS.md，SHA256 CF3F4F57E9FFB39F91453FC5FA0AA21C58B46F08D3253668C9AE2953C2783C02。按动作读取；不重复扫描旧版本和历史。

## 按原文 01—11 的交付

“代码已实施”不等于真实网站/安装器所有交互均验收。下表明确证据范围。

| 编号 | 已实施 | 验证与边界 |
|---|---|---|
| 01 Pinterest/预识别 | Pin同源尺寸格式合并；统一Pin与嵌套路由；顶层visual-search不能确认原Pin时引导详情；单页读取已加载正文，支持未知/重试/手动选择，保存前核对URL | Pinterest7项离线通过；真实2个Pin均HTTP200但登录墙，正文图片0，在线去重与下载未能验证。预识别不下载原图/不调用视频解析器，批量开窗不扫作者全部内容。 |
| 02 X/任务日志 | 图片不依赖视频解析，错误Promise不复用；权威主帖ID适配，引用媒体排除；任务详情/可点日志、原始日志折叠、复制脱敏 | X身份、解析失败重试及图片独立路径离线通过；原失败视频未在登录环境重下，不能宣称已修好全部X视频。 |
| 03 进度/停止/恢复 | 整批统计与当前篇百分比分离，未知总量不显示虚假百分比；图片篇末停止确认/幂等；未完成后台保护；检查点revision+本机outbox，较新版本优先 | 3/5与5%→80%覆盖反例、停止边界/不同payload、并发版本与离线3版本补交通过；视频继续读后台终态；未达目标上限显示部分完成说明。 |
| 04 素材完整性 | 内容参数身份保留；HTTP/base64/旧缓存真实解码；OCR无附件补图并保留OCR；抽帧partial/omitted贯穿结果，只统计确认帧 | 存储/身份/旧coverage测试通过；实际帧引擎2/5确认保存2、省略3、恢复播放通过；真实隔离HTTP保存2篇不同ID，文件解码及幂等回放通过。 |
| 05 状态与架构 | TaskContext拥有固定选项/目录/批次/额度/backendJobId/control；TaskStore串行持久化/同步；CaptureOptions优先级与冻结恢复；create_app注入且工厂导入不碰用户状态；API受限403握手；SQL分页/详情懒加载 | 对应配置7项、TaskStore恢复/并发、1000条分页、旧任务失败摘要、导入隔离通过。平台提取器与下载实现保留，未换框架。 |
| 06 UI规则 | 设置默认值/素材库/视频/保护分区，暖灰模块，保存/撤销状态；独立加载；禁用/键盘/焦点同步，消除透明度叠加 | 设置页浏览器夹具10项通过；原弹窗87个ID全保留；原生语言控件隐藏，中/EN按钮共用原语言设置。 |
| 07 设置预览方向 | 采用模块区分与轻量表单；不复制旧版本演示数据 | 设置页静态/浏览器夹具验证；该节为参考说明，不另计“功能数量”。 |
| 08 弹窗原型 | 完整RefTray+灵感采集标识；媒体过滤/数量/保存位置行；高级折叠；固定操作区、主滚动与3px滚动条；真实运行/部分/失败/停止结果和操作 | 320px无横向溢出，中/EN、批量、展开、部分完成及当前篇进度夹具通过；原型下方演示控件未放进产品。批量打开结果使用批次目录，单篇仍用作品目录。 |
| 09 引导/更新/卸载 | 连接→实际目录读写→可跳过首次保存；后台更新等待/篇末停止/取消，确认退出才替换；默认保留数据，可选分类清理与重叠保护；Reload文字/复制地址 | API与维护测试通过；未点击真实安装器的等待/停止/清理选择。Chrome工具禁止chrome://协议，因此Reload截图和实际扩展重新加载受阻，提供手动步骤。 |
| 10 Windows/构建 | 进程退出监测/重启入口/Job Object子树；异步组件缓存轻量health；15wheel哈希锁/离线构建/管理文件清单/保留用户数据的升级清理 | 安装器编译；隔离崩溃→托盘停止→重启、无残留子进程通过；1616依赖重复构建一致，1767文件升级模拟一致；真实用户安装未执行。 |
| 11 验收分层 | 需求与反例对应，离线/实际HTTP/公共站点/Windows隔离分别记录；后续继续本表 | JS23项、Python顶层23项+collector29项；浏览器夹具、隔离HTTP与进程树结果见证据。不能把登录墙或工具拦截写成成功。 |

## 证据与产物

- `tests/collector/test_*`：保存/身份/任务配置/进度/恢复反例；`tests/test_runtime_contracts.py`、`test_installer_maintenance.py`、`test_distribution.py`：运行与分发合同。
- `docs/development/archive/runtime-0528-verification.md` 和 `docs/evidence/runtime-0528/`：隔离运行/依赖/升级证据（早期整合提交，非本机部署）。
- `tests/collector/pinterest_public_evidence/`：真实公共Pin登录墙证据。
- `work/http-integration.json`：本轮0.5.29独立端口HTTP保存与目录检查；未动用户服务。
- `work/test-popup.cjs`：原87控件保留、320px、语言、批量、进度场景；截图在用户outputs。
- `build-windows/runtime-lifecycle-results.json`：0.5.29隔离后端退出与重启结果。
- `dist/RefTray-0.5.29-本机覆盖更新.zip`：payload+update_local.ps1，保留原安装位置；`dist/InspirationCollector-0.5.29-Windows-x64-Setup.exe`：通用安装包，尚未发布。

## 当前执行阻塞与下一步

1. **自动审批拦截本机覆盖命令，返回blocked by policy，未提供具体理由。整条命令没有执行。** 不换解释器/工具绕过。原程序、素材、偏好未被该命令修改。
2. **浏览器安全策略拒绝chrome://extensions，仅允许http/https。** 不通过其他浏览器表面、原生UI或CDP绕过。需要用户手动重新加载扩展。
3. 用户本机更新已明确授权，但执行受上述工具策略限制。提供可检查的本机更新包给用户手动运行；完成后只读核验health版本、原目录与扩展Reload结果。首次正式发布仍需登录网站真实样本与真实安装器交互验收；未push。
4. 本轮交付必须保持01—11编号，不再把局部改动说成整体验收完成。每次更新本文件，并区分源码、构建、安装状态。
