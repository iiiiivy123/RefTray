# RefTray 开发与构建

[项目首页](../../README.md) · [文档导航](../README.md) · [发布清单](publishing.md)

普通安装和使用不需要构建源码，请从[首次安装](../install.md)开始。本页适用于完整 Git 仓库检出，命令均在仓库根目录执行。

## 代码与工作目录

- `source/extension/`：Chrome 扩展。
- `source/server/`：本地后台与 MCP。
- `installer/`、`tools/`：Windows 启动器、安装器和构建工具。
- `tests/`：自动化检查；`docs/`：使用教程和开发记录。
- `build-tools/`：本机准备的构建输入；`build-windows/`、`dist/`：构建输出。个人素材、运行状态和凭据不要放入发行包。

开始改动前读 [AGENTS](../../AGENTS.md) 和 [CURRENT](CURRENT.md)，按 [SPEC](SPEC.md) 核对受影响功能。当前计划与验证证据写在 [TASK](TASK.md)；历史审查文档不代表现在已经验证。使用独立分支或 worktree，保留已有未提交内容。

## Windows 构建前检查

构建宿主使用 Python 3.11 或更新版本及 pip；安装包运行时仍为锁定的 Python 3.13。先准备项目要求的离线 wheelhouse、运行时及编译工具，再从仓库根目录运行：

构建还需要已核验的 `build-tools/speech-runtime`。可用 `tools/prepare_build_inputs.py --media-source <媒体组件目录> --speech-source <已核验的speech-tools目录>` 准备；语音引擎、模型、对应源码与许可证按独立清单校验，缺失时在生成安装包前停止。原生构建方法、固定源码和许可见 [本地语音组件](../third-party-speech.md)，无需将本机完整FFmpeg或外部语音环境带进安装包。

```powershell
python tools/build_windows.py --check-dependencies
python tools/build_windows.py
```

第一条只解析和校验锁定的离线依赖，不生成安装包；第二条也自动执行同一检查，通过后才创建打包目录。构建子进程隔离本机 pip 默认配置，不修改全局配置。规则见 [SPEC](SPEC.md) B02。

实现依据：[pip 配置隔离](https://pip.pypa.io/en/stable/topics/configuration/)、[pip 离线解析与 dry-run](https://pip.pypa.io/en/stable/cli/pip_install/)。

## 开发检查

在仓库根目录运行。下面使用默认安装位置中自带的 Python，并明确从当前检出的 `source` 导入代码。自定义安装位置请把第一行换成实际的完整路径；也可使用已装齐项目依赖的开发环境解释器。找不到解释器时先修正路径，不要直接切换到未知的系统 Python。

```powershell
$reftrayTestPython = Join-Path $env:LOCALAPPDATA 'Programs\InspirationCollector\runtime\python.exe'
if (!(Test-Path -LiteralPath $reftrayTestPython)) { throw '请把 reftrayTestPython 改为实际的 Python 路径' }
& $reftrayTestPython -c "import sys,unittest; sys.path.insert(0,'source'); r=unittest.TextTestRunner().run(unittest.defaultTestLoader.discover('tests/collector',pattern='test_architecture_boundaries.py')); sys.exit(not r.wasSuccessful())"
```

每轮收尾执行架构检查。修改共享采集、任务或参数模块时，再运行完整回归：

```powershell
& $reftrayTestPython -c "import sys,unittest; sys.path.insert(0,'source'); r=unittest.TextTestRunner().run(unittest.defaultTestLoader.discover('tests/collector',pattern='test_*.py')); sys.exit(not r.wasSuccessful())"
& $reftrayTestPython -c "import sys,unittest; sys.path.insert(0,'source'); r=unittest.TextTestRunner().run(unittest.defaultTestLoader.discover('tests',pattern='test_*.py')); sys.exit(not r.wasSuccessful())"
node --test tests/collector/*.cjs
git diff --check
```

架构检查覆盖服务端本地模块引用、循环依赖、解析与下载的依赖方向，以及扩展脚本加载文件。参数、停止、断线和平台内容由行为测试验证；真实 Chrome 验收记录在 [CURRENT](CURRENT.md)。
