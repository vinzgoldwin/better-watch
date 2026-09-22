"""Original score: Home Library, 100 BPM, D major. No recordings or samples.

All oscillators, envelopes, percussion and stereo delays are synthesized here.
Seeded noise makes the master reproducible. Score and generated recording may
be used, modified and redistributed for any purpose without attribution.
"""
from pathlib import Path
import json
import wave
import numpy as np

OUT = Path(__file__).resolve().parent.parent
SR, DURATION, BPM = 48000, 43, 100
BEAT = 60 / BPM
rng = np.random.default_rng(220926)
mix = np.zeros((SR * DURATION, 2), dtype=np.float64)
events = []


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def place(signal, start, gain=1, pan=0):
    begin = int(start * SR)
    end = min(len(mix), begin + len(signal))
    if end <= begin:
        return
    signal = signal[:end-begin] * gain
    angle = (pan + 1) * np.pi / 4
    mix[begin:end, 0] += signal * np.cos(angle)
    mix[begin:end, 1] += signal * np.sin(angle)


def key(note, start, duration=1.8, gain=.08, pan=0):
    t = np.arange(int(SR * duration)) / SR
    f = hz(note)
    env = (1 - np.exp(-t * 170)) * np.exp(-t * 2.15)
    env *= np.minimum(1, np.maximum(0, (duration-t) / .12))
    # Soft electric-piano fundamental with a decaying tine harmonic.
    sig = np.sin(2*np.pi*f*t + .7*np.exp(-t*4)*np.sin(2*np.pi*f*2*t))
    sig += .21*np.sin(2*np.pi*f*2*t)*np.exp(-t*2.4)
    sig += .065*np.sin(2*np.pi*f*3*t)*np.exp(-t*3)
    sig *= env
    place(sig, start, gain, pan)
    place(sig, start+.30, gain*.16, -pan*.8)
    place(sig, start+.61, gain*.07, pan*.6)
    events.append({'instrument':'keys','midi':note,'at':round(start,3)})


def pad(chord, start, duration, gain=.026):
    t = np.arange(int(SR*(duration+.8))) / SR
    env = np.minimum(1, t/1.15) * np.minimum(1, np.maximum(0,(duration+.8-t)/1.35))
    for i, note in enumerate(chord):
        f = hz(note)
        sig = (.54*np.sin(2*np.pi*f*t) + .20*np.sin(2*np.pi*f*1.0018*t+.5)
               + .17*np.sin(2*np.pi*f*.9988*t+1.1) + .07*np.sin(4*np.pi*f*t))
        place(sig*env, start, gain, (i/(len(chord)-1)-.5)*1.3)


def bass(note, start, duration=.8, gain=.13):
    t = np.arange(int(SR*duration)) / SR
    env = (1-np.exp(-t*65))*np.exp(-t*2)*np.minimum(1,(duration-t)/.08)
    place((np.sin(2*np.pi*hz(note)*t)+.12*np.sin(4*np.pi*hz(note)*t))*env, start, gain)


def kick(start, gain=.13):
    t = np.arange(int(SR*.23)) / SR
    phase = 2*np.pi*(45*t + 31*.023*(1-np.exp(-t/.023)))
    sig = np.sin(phase)*np.exp(-t*21)*(1-np.exp(-t*750))
    place(sig,start,gain)


def brush(start, gain=.012, pan=.15):
    n = int(SR*.095)
    t = np.arange(n)/SR
    noise = rng.uniform(-1,1,n)
    sig = (noise-np.roll(noise,1))*.4*np.exp(-t*56)*(1-np.exp(-t*1800))
    place(sig,start,gain,pan)


# Two bars per harmony. Extended voicings keep the bed warm and open.
chords = [[62,66,69,73,76], [61,64,69,71,76], [59,62,66,69,73], [59,62,66,69,74]]
roots = [38,33,35,31]
motifs = [
    [(0,66),(.75,69),(1.5,73),(2.75,76),(4,73),(5.5,69),(6.75,66)],
    [(0,64),(1.5,69),(2.5,71),(4,73),(5.25,71),(6.5,69)],
    [(0,66),(1,69),(2.75,73),(4,74),(5.5,73),(6.75,69)],
    [(0,66),(1.5,69),(3,74),(4.75,73),(6,69),(7,66)],
]
for phrase in range(8):
    start = phrase*8*BEAT
    chord = chords[phrase % 4]
    pad(chord, start, 8*BEAT, .022 if phrase < 2 else .029)
    for j, note in enumerate(chord[:-1]):
        key(note, start+.16+j*.018, 2.65, .027, (j-1.5)*.22)
    if phrase > 0:
        for offset,note in motifs[phrase % 4]:
            key(note+12, start+offset*BEAT+.08, 1.85, .042 if phrase<4 else .050, -.23 if int(offset)%2 else .28)
    for b in range(8):
        if phrase >= 2:
            if b in (0,3,4,6):
                bass(roots[phrase%4],start+b*BEAT,1.1,.095)
            if phrase < 7 and b in (0,4):
                kick(start+b*BEAT,.09)
            if phrase < 7:
                brush(start+(b+.5)*BEAT,.02 if b%2 else .013, .36 if b%2 else -.32)
                if b in (2,6):
                    brush(start+b*BEAT,.04,-.1)

# Resolve the progression under the closing ribbon, leaving a ringing tail.
pad([50,62,66,69,73,76],37.8,4.3,.028)
for j,note in enumerate([62,66,69,73,76,81]):
    key(note,37.85+j*.045,4.1,.060 if j<4 else .046,(j-2.5)*.20)
bass(38,37.8,2.7,.11)

time = np.arange(len(mix))/SR
fade_in = np.minimum(1,time/1.15)**1.2
fade_out = np.clip((DURATION-time)/3.6,0,1)**1.5
mix *= (fade_in*fade_out)[:,None]
peak_before = float(np.abs(mix).max())
mix *= .73/peak_before
pcm = np.clip(np.round(mix*32767),-32768,32767).astype('<i2')
with wave.open(str(OUT/'assets/home-library.wav'),'wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
(OUT/'assets/music-score.json').write_text(json.dumps({'title':'Home Library','duration':DURATION,'bpm':100,'key':'D major','source':'scripts/compose-music.py','sample_rate':SR,'peak_dbfs':float(20*np.log10(np.max(np.abs(mix)))),'events':events},indent=2)+'\n')
print(f'Original stereo score: {DURATION}s, {SR} Hz, peak {20*np.log10(np.max(np.abs(mix))):.2f} dBFS.')
