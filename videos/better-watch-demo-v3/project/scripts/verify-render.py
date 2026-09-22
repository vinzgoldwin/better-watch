"""Inspect the delivered MP4, not merely the authoring preview."""
from pathlib import Path
import json
import subprocess
import wave
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
VIDEO=ROOT.parent/'better-watch-demo.mp4'
QA=ROOT/'qa'
DURATION=json.loads((ROOT/'scene-map.json').read_text())[-1]['end']
FRAMES=QA/'rendered-frames'
FRAMES.mkdir(exist_ok=True)

probe=subprocess.run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(VIDEO)],check=True,capture_output=True,text=True)
(QA/'ffprobe.json').write_text(probe.stdout)
data=json.loads(probe.stdout)
video=next(s for s in data['streams'] if s['codec_type']=='video')
audio=next(s for s in data['streams'] if s['codec_type']=='audio')
assert (video['width'],video['height'])==(1920,1080)
assert video['codec_name']=='h264' and video['pix_fmt']=='yuv420p'
assert video['r_frame_rate']=='30/1' and int(video['nb_read_frames'])==round(DURATION*30)
assert abs(float(data['format']['duration'])-DURATION)<.1
assert audio['codec_name']=='aac' and audio['channels']==2

times=[0,.3,1.2,3.5,3.9,4,4.27,4.6,5.5,7,9.4,9.9,10,10.3,11.5,12.6,12.85,14,15.2,15.45,16.5,17.8,18,19,20.4,20.6,22.5,24,24.3,26,28,29.9,30,30.3,32,34,36.9,37,37.3,38.5,40,41.7,42.5,42.966]
indices=sorted(set(round(t*30) for t in times))
selection='+'.join(f'eq(n,{n})' for n in indices)
cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf',"select='"+selection+"'",'-fps_mode','vfr',str(FRAMES/'frame-%03d.png')]
subprocess.run(cmd,check=True)
(QA/'rendered-frame-times.json').write_text(json.dumps([{'file':f'frame-{i+1:03d}.png','frame':n,'time':round(n/30,4)} for i,n in enumerate(indices)],indent=2)+'\n')

with (QA/'audio-final.log').open('w') as log:
    subprocess.run(['ffmpeg','-hide_banner','-i',str(VIDEO),'-vn','-af','ebur128=peak=true','-f','null','-'],check=True,stdout=log,stderr=log)
wav=QA/'decoded-audio.wav'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vn','-c:a','pcm_s16le',str(wav)],check=True)
with wave.open(str(wav)) as f:
    rate=f.getframerate();channels=f.getnchannels();samples=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,channels)/32768.
def rms(start,end):
    block=samples[int(start*rate):int(end*rate)]
    level=float(np.sqrt(np.mean(block**2)))
    return float(20*np.log10(max(level,1e-10)))
report={'duration_seconds':len(samples)/rate,'channels':channels,'sample_rate':rate,'sample_peak_dbfs':float(20*np.log10(np.max(np.abs(samples)))),'clipped_samples':int(np.count_nonzero(np.abs(samples)>=1)),'rms_dbfs':{'first_quarter_second':rms(0,.25),'middle_15_to_25s':rms(15,25),'last_quarter_second':rms(DURATION-.25,DURATION)},'listening_performed':False}
assert report['clipped_samples']==0
assert report['rms_dbfs']['first_quarter_second']<report['rms_dbfs']['middle_15_to_25s']-10
assert report['rms_dbfs']['last_quarter_second']<report['rms_dbfs']['middle_15_to_25s']-20
(QA/'audio-summary.json').write_text(json.dumps(report,indent=2)+'\n')
wav.unlink()
print(json.dumps({'video':{k:video[k] for k in ['codec_name','pix_fmt','width','height','r_frame_rate','nb_read_frames']},'audio':report,'inspected_frame_count':len(indices)},indent=2))
