import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');

    if (!canvasCtx) return;

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Check if there is significant audio
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / bufferLength;
      setHasAudio(average > 10); // Threshold for "hearing something"

      canvasCtx.fillStyle = 'rgb(240, 240, 240)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        // Color based on volume
        const g = barHeight + 100;
        const b = 50;
        canvasCtx.fillStyle = `rgb(50,${g},${b})`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      audioContext.close();
    };
  }, [stream]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas 
        ref={canvasRef} 
        width={200} 
        height={60} 
        className="rounded border border-gray-500"
      />
      <div className={`text-xs font-bold ${hasAudio ? 'text-green-600' : 'text-gray-400'}`}>
        {hasAudio ? '🔊' : '🔇 未检测到声音'}
      </div>
    </div>
  );
};
