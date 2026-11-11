#!/bin/sh
# Local audio decoding for offline transcription. No network protocols or GPL.
# Ubuntu 24.04; /work is a dedicated speech-audio build directory.
set -eu
# The minimal base image has no CA bundle yet. Bootstrap a verified bundle
# before contacting HTTPS package repositories; keep TLS verification enabled.
echo '50f79f98dac192b20dbf73f35c56f0b0c557ab267ff5199d1117cc1180b70785  /work/cacert.pem' | sha256sum -c -
mkdir -p /etc/ssl/certs
cp /work/cacert.pem /etc/ssl/certs/ca-certificates.crt
sed -i 's|http://archive.ubuntu.com|https://archive.ubuntu.com|g; s|http://security.ubuntu.com|https://security.ubuntu.com|g' /etc/apt/sources.list.d/ubuntu.sources
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gcc gcc-mingw-w64-x86-64 g++-mingw-w64-x86-64-posix cmake make unzip ca-certificates libc6-dev
echo '52416bfdf2fd346ce2f14e0ac922985d6df4701538e5ee9ddba6d52f6c8a2f4a  /work/ffmpeg-source-611cec792a.zip' | sha256sum -c -
echo '7a7a73071939f16bc028ad2f713f16f26e37afb6cc155d0f19e3d65705d2b1d9  /work/whisper-source-v1.9.5.zip' | sha256sum -c -
cd /tmp
unzip -q /work/ffmpeg-source-611cec792a.zip
cd FFmpeg-611cec792a
./configure --arch=x86_64 --target-os=mingw32 --cross-prefix=x86_64-w64-mingw32- \
  --disable-autodetect --disable-everything --disable-network --disable-x86asm \
  --disable-doc --disable-debug --enable-small --disable-gpl --disable-nonfree \
  --disable-pthreads --enable-w32threads --enable-ffmpeg --disable-ffprobe \
  --enable-protocol=file --enable-demuxer=mov,matroska,mp3,ogg,wav,flac,aac \
  --enable-muxer=wav --enable-decoder=aac,mp3,opus,vorbis,flac,pcm_s16le,pcm_f32le,pcm_s24le \
  --enable-encoder=pcm_s16le --enable-parser=aac,mpegaudio,opus,vorbis,flac \
  --enable-filter=aresample,aformat,anull
make -j4
mkdir -p /work/output
cp ffmpeg.exe /work/output/speech-audio.exe
cp COPYING.LGPLv2.1 LICENSE.md /work/output/
cp ffbuild/config.mak /work/output/build-config.txt
cp /usr/share/doc/mingw-w64-common/copyright /work/output/MinGW-COPYRIGHT.txt
dpkg-query -W > /work/output/toolchain-packages.txt
cd /tmp
unzip -q /work/whisper-source-v1.9.5.zip
cmake -S whisper.cpp-1.9.5 -B whisper-build \
  -DCMAKE_SYSTEM_NAME=Windows -DCMAKE_SYSTEM_PROCESSOR=x86_64 \
  -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc-posix \
  -DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++-posix \
  -DCMAKE_C_FLAGS=-D_WIN32_WINNT=0x0601 -DCMAKE_CXX_FLAGS=-D_WIN32_WINNT=0x0601 \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS=-static \
  -DBUILD_SHARED_LIBS=OFF -DGGML_STATIC=ON -DGGML_NATIVE=OFF \
  -DGGML_OPENMP=OFF -DGGML_BACKEND_DL=OFF -DGGML_CCACHE=OFF \
  -DWHISPER_BUILD_IS_DEV=OFF -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_SERVER=OFF -DWHISPER_CURL=OFF -DWHISPER_SDL2=OFF
cmake --build whisper-build --target whisper-cli -j4
cp whisper-build/bin/whisper-cli.exe /work/output/
cp whisper-build/CMakeCache.txt /work/output/whisper-build-config.txt
cp whisper.cpp-1.9.5/LICENSE /work/output/whisper-cpp-LICENSE.txt
cp /usr/share/doc/gcc-13-base/copyright /work/output/GCC-COPYRIGHT.txt
x86_64-w64-mingw32-objdump -p /work/output/whisper-cli.exe > /work/output/whisper-imports.txt
x86_64-w64-mingw32-objdump -p /work/output/speech-audio.exe > /work/output/audio-imports.txt
