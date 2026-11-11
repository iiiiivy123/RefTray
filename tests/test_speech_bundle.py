import hashlib,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import speech_bundle,build_windows

class SpeechBundleTests(unittest.TestCase):
    def test_missing_speech_inputs_stop_before_any_payload_is_created(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);manifest=root/'source/extension/manifest.json';manifest.parent.mkdir(parents=True)
            manifest.write_text('{"version":"0.5.50"}','utf-8')
            with patch.object(build_windows,'ROOT',root),patch.object(build_windows,'preflight_dependencies',return_value={}),patch.object(build_windows,'preflight_compilers'),patch.object(build_windows,'build') as build:
                with self.assertRaises(FileNotFoundError):build_windows.build_windows()
                build.assert_not_called();self.assertFalse((root/'build-windows').exists())

    def test_corrupted_component_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);files={}
            for name in speech_bundle.REQUIRED:
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'reviewed')
                files[name]=hashlib.sha256(b'reviewed').hexdigest()
            (root/'manifest.json').write_text(json.dumps({'files':files}),'utf-8')
            (root/'audio/speech-audio.exe').write_bytes(b'corrupted')
            with patch.object(speech_bundle.subprocess,'run') as run:
                with self.assertRaisesRegex(ValueError,'checksum failed'):speech_bundle.verify(root)
                run.assert_not_called()

if __name__=='__main__':unittest.main()
