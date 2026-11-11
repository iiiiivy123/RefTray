import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

from server import speech,subtitles


class SpeechTests(unittest.TestCase):
    def test_zero_length_boundary_does_not_discard_the_whole_transcript(self):
        def row(start,end,text): return {'offsets': {'from':start,'to':end}, 'text':text}
        cues=speech.whisper_cues([row(119520,120520,'这十块钱就很喜欢了'),row(120520,120520,'这十块钱就很喜欢了'),row(120520,121520,'下一句')])
        self.assertEqual(len(cues),2)
        self.assertEqual(cues[0]['text'],'这十块钱就很喜欢了')
        cues=speech.whisper_cues([row(0,0,'开场'),row(0,1000,'正文'),row(1000,1000,'结尾')])
        self.assertEqual(cues,[{'start':0,'end':1,'text':'开场 正文 结尾'}])
        for rows in ([row(0,0,'没有时长')],[row(2000,1000,'倒序')],[row(-1,1000,'负数')]):
            with self.assertRaises(ValueError):speech.whisper_cues(rows)

    def test_existing_site_captions_bypass_local_engine_and_preserve_video(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);video=folder/'video.mp4';video.write_bytes(b'original video')
            with patch('server.subtitles.transcribe',side_effect=AssertionError('must not run ASR')):
                result,origin=subtitles.save(video,folder,[{'start':1.25,'end':2.8,'text':'网站字幕'}],lambda:None)
            self.assertIn('00:00:01,250 --> 00:00:02,800',result.read_text('utf-8'))
            self.assertIn('网站字幕',result.with_suffix('.md').read_text('utf-8'))
            self.assertEqual(video.read_bytes(),b'original video')

    def test_bundled_worker_offsets_reach_saved_srt_and_markdown(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);video=folder/'video.mp4';video.write_bytes(b'original video')
            commands=[]
            def run(command,checkpoint,**kwargs):
                commands.append(command);checkpoint()
                if command[0]=='decoder':
                    with wave.open(command[-1],'wb') as output:
                        output.setparams((1,2,16000,0,'NONE','not compressed'));output.writeframes(b'\x00\x10'*16000)
                else:
                    Path(command[-1]+'.json').write_text(json.dumps({'transcription':[{'offsets':{'from':1250,'to':2800},'text':' 本地语音 '}]}),'utf-8')
            info={'ready':True,'kind':'whisper.cpp','runtime':Path('engine'),'decoder':Path('decoder'),'model':Path('model')}
            with patch('server.speech.component',return_value=info),patch('server.speech.run_local',side_effect=run):
                result,origin=subtitles.save(video,folder,[],lambda:None)
            self.assertIn('本地语音',result.read_text('utf-8'));self.assertIn('00:00:01,250 --> 00:00:02,800',result.read_text('utf-8'))
            self.assertIn('本地语音识别',origin);self.assertIn('本地语音',result.with_suffix('.md').read_text('utf-8'))
            self.assertEqual(video.read_bytes(),b'original video')
            self.assertEqual(commands[0][commands[0].index('-protocol_whitelist')+1],'file')
            self.assertFalse(Path(commands[0][-1]).parent.exists())

    def test_cancel_cleans_temporary_audio_and_keeps_original(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);video=folder/'video.mp4';video.write_bytes(b'preserved');temps=[]
            def stop(command,*args,**kwargs):
                temps.append(Path(command[-1]));temps[-1].write_bytes(b'partial');raise InterruptedError('stopped')
            info={'ready':True,'kind':'whisper.cpp','runtime':Path('engine'),'decoder':Path('decoder'),'model':Path('model')}
            with patch('server.speech.component',return_value=info),patch('server.speech.run_local',side_effect=stop):
                with self.assertRaises(InterruptedError):subtitles.save(video,folder,[],lambda:None)
            self.assertEqual(list(folder.iterdir()),[video]);self.assertEqual(video.read_bytes(),b'preserved')
            self.assertFalse(temps[0].parent.exists())

    def test_silence_is_explicit_and_does_not_publish_empty_subtitles(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);video=folder/'video.mp4';video.write_bytes(b'preserved')
            with patch('server.subtitles.transcribe',return_value=[]):
                with self.assertRaisesRegex(ValueError,'没有识别到可用语音'):subtitles.save(video,folder,[],lambda:None)
            self.assertEqual(list(folder.iterdir()),[video])

if __name__=='__main__':unittest.main()
