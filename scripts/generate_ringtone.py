import wave
import struct
import math
import os

output_path = 'public/ringtone.wav'

# Ensure public directory exists
os.makedirs('public', exist_ok=True)

with wave.open(output_path, 'w') as obj:
    obj.setnchannels(1) # mono
    obj.setsampwidth(2)
    obj.setframerate(44100)
    
    # 2 seconds of sound pattern
    for i in range(44100 * 2):
        # Beep for 0.4s, silence for 0.6s
        t = i / 44100.0
        cycle = t % 1.0
        
        # Dual tone for phone ring effect (440Hz + 480Hz is common for US/UK)
        # Digital phone sound
        if cycle < 0.4:
            # Simple sine wave
            val = math.sin(2.0 * math.pi * 440.0 * t) + math.sin(2.0 * math.pi * 480.0 * t)
            value = int(32767.0 * 0.25 * val) # 0.25 volume factor to avoid clipping
        else:
            value = 0
            
        data = struct.pack('<h', value)
        obj.writeframesraw(data)

print(f"Generated {output_path}")
