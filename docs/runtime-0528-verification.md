# 运行与安装维护验证记录

2026-11-04；运行工作区 `F:/Codex/Workspaces/2026-09-02/referenced-chatgpt-conversation-this-is-an/reftray-0528-runtime`。这是局部源码的隔离证据，不是集成版 0.5.29 的安装或发布回执。未更新真实安装、重启真实服务或推送代码。

## 接口与检查

- `GET /settings/library/check` 需 `X-Collector-Token`。读取当前素材库目录；以唯一临时标记实际写入、同步、读回及删除后返回 `{directory,writable:true}`。不创建目录、不更改偏好或素材。未选择/目录缺失返回409，读写或清理失败返回400，鉴权失败403。
- 运行契约10项、安装维护9项、分发4项离线测试通过。库目录检查覆盖修改目录后实际检查新位置、素材和配置字节保留、无标记残留；权限失败使用受控异常，并非真实 Windows ACL 验证。
- 组件探测阻塞20秒的桩不阻塞 `/health`；探测未完成时 `capabilities_state=checking`，`components={}`，`bilibili_mux=null`。基础采集仍可使用。

## 可复用输入

- 构建工具及15个实际 Windows CPython3.13 wheel：`F:/Codex/Workspaces/2026-09-02/referenced-chatgpt-conversation-this-is-an/reftray-0528-runtime/build-tools`。同盘可复制或以硬链接复用，勿链接后改写二进制原件。
- 完整传递依赖版本和真实 wheel SHA256：`source/server/requirements-windows-lock.txt`。构建从 wheelhouse 离线安装并强制哈希；直接依赖变更但锁未更新时阻断。
- 编译器实际为 Inno7.1.1；准备脚本固定其官方发行资产及SHA256。构建另记录实际编译器版本、工具/媒体/依赖输入哈希及 `managed-files.json`。
- 工作区 `dist/InspirationCollector-0.5.28-Windows-x64-Setup.exe` 仅为局部源码编译检查产物，禁止当作集成版交付或部署。集成源码必须重新构建。

## 已保留证据

原始结果位于上述运行工作区 `build-windows/`，以下副本随源码保留：

- [真实隔离进程树、后台退出及托盘重启](evidence/runtime-0528/runtime-lifecycle-results.json)：仅终止自己创建的测试后台，三个测试子进程均无残留，托盘停止和重启检查通过；使用独立状态与空闲端口。
- [两次空目录离线依赖构建](evidence/runtime-0528/dependency-repeat.json)：规范化无需交付的命令行包装器后，1616个依赖文件字节完全一致。
- [管理文件升级模拟](evidence/runtime-0528/managed-upgrade-simulation.json)：1767个受管理文件无哈希差异；旧自有文件移除，未管理笔记、手改程序备份、素材和偏好保留。此项为文件系统模拟，没有执行真实 Inno 安装。
- [独立 Launcher 启动和正常退出](evidence/runtime-0528/lifecycle-smoke.json)：版本匹配、服务退出、端口释放均通过。

真实安装中的等待/停止选择、卸载选择和浏览器 Reload 操作仍需从集成版目标入口验收。安装说明已有文字和地址复制，未声称提供实测截图。旧版没有总清单时，只按 wheel RECORD 安全清理可确认的依赖；无法确认归属的旧文件保留。
