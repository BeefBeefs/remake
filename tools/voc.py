#!/usr/bin/env python3
"""VoiceData V003 (.Voc) -> WAV/OGG.
Layout (reverse engineered): magic[16] "VoiceData  V003\\0", u32 entry count, u32 type, then entries. Each entry = 512-byte header
(name at +0, zero padded; the header of entry 0 starts at offset 28) followed by a PCM WAVEFORMAT (16 bytes: tag, channels, rate,
byte rate, block align, bits), the 2 ASCII bytes "da", a u32 data size and the raw PCM (8-bit unsigned or 16-bit signed little endian).
BGM files hold one 8/16-bit 22050 Hz stereo entry (a ~60 s loop); Voice00.Voc holds 160 mono sound effects named 0000...0159."""
import re, struct, subprocess, sys, os

FMT = re.compile(rb'\x01\x00([\x01\x02])\x00(....)(....)([\x01-\x04])\x00([\x08\x10])\x00[a-z]a', re.S)

def parse(d):
    out = []
    for m in FMT.finditer(d):
        ch, rate, bits = m.group(1)[0], struct.unpack('<I', m.group(2))[0], m.group(5)[0]
        n, = struct.unpack_from('<I', d, m.end())
        name = d[m.start() - 512:m.start() - 512 + 32].split(b'\0')[0].decode('ascii', 'replace')
        out.append(dict(name=name, ch=ch, rate=rate, bits=bits, pcm=d[m.end() + 4:m.end() + 4 + n]))
    return out

def wav(e):
    ba = e['rate'] * e['ch'] * e['bits'] // 8
    return b'RIFF' + struct.pack('<I', 36 + len(e['pcm'])) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, e['ch'], e['rate'], ba, e['ch'] * e['bits'] // 8, e['bits']) + b'data' + struct.pack('<I', len(e['pcm'])) + e['pcm']

def ogg(e, path, q=3):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'wav', '-i', '-', '-c:a', 'libvorbis', '-q:a', str(q), path], input=wav(e), check=True)

def build(root='/home/claude/sf1_data/System', dst='public/data/ep1/audio'):
    """BGM -> bgm_<name>.ogg, Title music -> title.ogg, sound effects -> sfx_NNNN.ogg + index.json."""
    import json
    os.makedirs(dst, exist_ok=True); idx = {'bgm': [], 'sfx': 0}
    for i in range(7):
        e = parse(open(f'{root}/Game/Music/BGM0{i}.Voc', 'rb').read())[0]; ogg(e, f'{dst}/bgm{i}.ogg'); idx['bgm'].append(e['name'])
    ogg(parse(open(f'{root}/Title/Music/BGM00.Voc', 'rb').read())[0], f'{dst}/title.ogg')
    es = parse(open(f'{root}/Game/Voice/Voice00.Voc', 'rb').read())
    for i, e in enumerate(es): ogg(e, f'{dst}/sfx{i}.ogg', 2)
    idx['sfx'] = len(es); json.dump(idx, open(f'{dst}/index.json', 'w'))

if __name__ == '__main__':
    build(*sys.argv[1:])
