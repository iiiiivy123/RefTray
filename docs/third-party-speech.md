# 本地语音组件

RefTray 0.5.50 的语音识别在本机CPU上执行，不上传音频，不在运行时下载模型。程序以子进程调用工具，原视频保留。明确配置的旧 faster-whisper 环境仍可使用。

## 引擎与模型

- Whisper.cpp v1.9.5，MIT：[上游源码](https://github.com/ggml-org/whisper.cpp/tree/v1.9.5)。源码ZIP摘要 `7a7a73071939f16bc028ad2f713f16f26e37afb6cc155d0f19e3d65705d2b1d9`，随包保留于 speech-tools/whisper-source-v1.9.5.zip；许可为 whisper-cpp-LICENSE.txt。
- OpenAI Whisper 多语言 base 的 GGML q8_0 模型，MIT：[模型仓库](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1)。模型SHA256 `c577b9a86e7e048a0b7eada054f4dd79a56bbfa911fbdacf900ac5b567cbb7d9`，许可为 Whisper-model-LICENSE.txt。
- 引擎由固定源码用MinGW交叉编译，静态链接C++运行库，关闭联网、GPU、OpenMP和本机专用指令集优化。Windows API目标设为0x0601，跳过上游需要新版SDK声明的可选线程功耗优化，不修改识别代码。GCC运行库受运行库例外条款约束，完整说明在 GCC-COPYRIGHT.txt；MinGW说明在 MinGW-COPYRIGHT.txt。

## 音频解码

独立speech-audio.exe仅将本地音轨转为16kHz单声道PCM。来源为项目已有FFmpeg 611cec792a源码，不使用外部媒体库、不启用GPL或nonfree、不含网络协议。许可、配置在 speech-tools/audio/；对应源码与原媒体工具共用 media-tools/ffmpeg-source-611cec792a.zip，摘要 `52416bfdf2fd346ce2f14e0ac922985d6df4701538e5ee9ddba6d52f6c8a2f4a`。

复现脚本 speech-tools/build_speech_audio.sh；编译器包版本、CMake配置和文件摘要保留在speech-tools。构建输入的证书仅用于构建时HTTPS校验，不是程序运行依赖。安装包生成前验证所有语音文件、x64原生依赖与工具启动，运行包另做音视频→字幕实测。

识别结果可能有错字，尤其是音乐、混响和多人同时说话。字幕中标注本地识别来源；没有有效语音时会明确提示，不生成空字幕冒充成功。

Windows 路径兼容：编译 whisper-cli.exe 后，在 Windows 上执行 `python tools/enable_speech_utf8.py build-tools/speech-runtime/whisper-cli.exe`，再生成 manifest.json 摘要。这给该进程嵌入 UTF-8 activeCodePage 清单，使中文素材名和中文临时目录正确传给引擎；不修改系统区域设置。打包预检读取 PE 的真实清单资源核验。依据：[Microsoft 的进程 UTF-8 清单说明](https://learn.microsoft.com/en-us/windows/apps/design/globalizing/use-utf8-code-page)。Windows 10 1903 及以上支持这一清单。

Whisper 在识别块交界处偶尔输出零时长文字。只在时间与相邻有效段相接时合并文字；相同边界重复句去重，其他有效段保持原顺序。不放宽网站字幕校验，倒序、负数、无有效时间的结果仍报告失败。
