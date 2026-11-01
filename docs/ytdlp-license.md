# yt-dlp 许可与来源

本项目使用安装包内的 Python 包 `yt-dlp==2026.10.26`，不打包上游独立的 Windows EXE。

- 上游项目：https://github.com/yt-dlp/yt-dlp
- 许可：https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE
- 上游 Python 源码通常采用 Unlicense；部分文件按其文件头的兼容许可提供。上游独立 EXE 可能包含另受许可约束的依赖，不能据此认为所有上游二进制文件均为公有领域。
- 本发行包保留 pip 安装产生的 `.dist-info/licenses` 等许可文件，且在第三方许可目录附上本次安装包的 yt-dlp LICENSE 文本。

B站适配通过子类调用上游 BiliBili 提取器，约束为指定 BV 与分P的单视频；不复制上游网络解析代码，不展开整个合集，不绕过 DRM、试看或访问权限。X 主帖解析同样使用上游提取器，但保留主帖、转帖、引用卡片范围检查。

本说明不改变本项目其余代码的许可状态，也不授予任何第三方作品的保存、转载或商用权利。
