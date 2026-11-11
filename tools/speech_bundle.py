"""Validate and copy the reviewed offline speech package before payload creation."""
import hashlib
import json
import shutil
import struct
import subprocess
from pathlib import Path

MODEL_SHA256='c577b9a86e7e048a0b7eada054f4dd79a56bbfa911fbdacf900ac5b567cbb7d9'
SOURCE_SHA256='7a7a73071939f16bc028ad2f713f16f26e37afb6cc155d0f19e3d65705d2b1d9'
REQUIRED={'whisper-cli.exe','ggml-base-q8_0.bin','audio/speech-audio.exe',
          'whisper-source-v1.9.5.zip','whisper-cpp-LICENSE.txt','Whisper-model-LICENSE.txt',
          'audio/COPYING.LGPLv2.1','audio/LICENSE.md','audio/build-config.txt',
          'MinGW-COPYRIGHT.txt','GCC-COPYRIGHT.txt','toolchain-packages.txt','whisper-build-config.txt'}


def native_imports(path):
    data=Path(path).read_bytes()
    def u32(offset):return struct.unpack_from('<I',data,offset)[0]
    pe=u32(0x3c)
    if data[:2]!=b'MZ' or data[pe:pe+4]!=b'PE\0\0' or struct.unpack_from('<H',data,pe+4)[0]!=0x8664:
        raise ValueError('Speech component is not a Windows x64 executable')
    count=struct.unpack_from('<H',data,pe+6)[0]
    optional=pe+24;size=struct.unpack_from('<H',data,pe+20)[0]
    if struct.unpack_from('<H',data,optional)[0]!=0x20b:raise ValueError('Expected PE32+ speech executable')
    sections=optional+size
    def offset(rva):
        if rva<u32(optional+60):return rva
        for n in range(count):
            section=sections+n*40;start=u32(section+12);length=u32(section+16)
            if start<=rva<start+length:return u32(section+20)+rva-start
        raise ValueError('Invalid native import address')
    if u32(optional+112+13*8):raise ValueError('Unexpected delayed native dependency')
    imports=[];table=offset(u32(optional+112+8))
    for index in range(100):
        entry=table+index*20
        if data[entry:entry+20]==b'\0'*20:return imports
        name=offset(u32(entry+12));end=data.index(b'\0',name,name+256)
        imports.append(data[name:end].decode('ascii').lower())
    raise ValueError('Native dependency table exceeds the limit')


def verify(folder,run=True):
    folder=Path(folder).resolve()
    manifest=json.loads((folder/'manifest.json').read_text('utf-8'))
    files=manifest['files']
    if set(files)!=REQUIRED:raise ValueError('Speech component file list is incomplete or contains unexpected files')
    for name,digest in files.items():
        path=folder/name
        if not path.is_file() or path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            raise ValueError('Speech component checksum failed: '+name)
    if files['ggml-base-q8_0.bin']!=MODEL_SHA256 or files['whisper-source-v1.9.5.zip']!=SOURCE_SHA256:
        raise ValueError('Speech model/source is not the reviewed version')
    from enable_speech_utf8 import verify as verify_utf8
    verify_utf8(folder/'whisper-cli.exe')
    system={'kernel32.dll','msvcrt.dll','advapi32.dll','user32.dll','shell32.dll','ole32.dll','winmm.dll','ws2_32.dll','bcrypt.dll','ntdll.dll'}
    for name in ('whisper-cli.exe','audio/speech-audio.exe'):
        if set(native_imports(folder/name))-system:raise ValueError('Unbundled speech dependency: '+name)
        if run:subprocess.run([str(folder/name),'-h'],check=True,capture_output=True,timeout=20)
    return manifest


def copy_to(folder,target):
    folder,target=Path(folder),Path(target)
    for name in [*REQUIRED,'manifest.json']:
        output=target/name;output.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(folder/name,output)
