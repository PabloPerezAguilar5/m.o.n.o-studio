import { useEffect, useRef } from 'react';
import type { AudioBackend } from '../core/types';

export function Waveform({ backend, playing }: { backend: AudioBackend; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    let last = 0;
    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (now - last < 50 || document.hidden) return;
      last = now;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio; }
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      context!.clearRect(0, 0, width, height);
      context!.strokeStyle = '#202b27'; context!.lineWidth = 1;
      context!.beginPath(); context!.moveTo(0, height / 2); context!.lineTo(width, height / 2); context!.stroke();
      if (!playing) return;
      const values = backend.getWaveform();
      if (!values.length) return;
      context!.strokeStyle = '#baff78'; context!.lineWidth = 1.3; context!.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = (i / (values.length - 1)) * width;
        const y = height / 2 + values[i] * height * 0.46;
        if (i === 0) context!.moveTo(x, y); else context!.lineTo(x, y);
      }
      context!.stroke();
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [backend, playing]);
  return <canvas className="waveform" ref={ref} aria-label={playing ? 'Forma de onda real de la salida de audio' : 'Visualizador en reposo'} />;
}
