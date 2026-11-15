/**
 * Precomputes a normalized RMS amplitude envelope (0..1) at ~60Hz
 * from a Web Audio API AudioBuffer so both live preview and offline frame export
 * share identical, deterministic audio-reactive motion.
 */
export function buildAudioEnvelope(buffer: AudioBuffer, samplesPerSec = 60): Float32Array {
  const channel = buffer.getChannelData(0);
  const totalSlots = Math.max(1, Math.ceil(buffer.duration * samplesPerSec));
  const envelope = new Float32Array(totalSlots);
  const windowSize = Math.max(1, Math.floor(buffer.sampleRate / samplesPerSec));

  let peak = 0.001;
  for (let i = 0; i < totalSlots; i++) {
    const start = i * windowSize;
    const end = Math.min(channel.length, start + windowSize);
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      const v = channel[j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    envelope[i] = rms;
    if (rms > peak) peak = rms;
  }

  // Normalize and apply gentle smoothing
  let smoothed = 0;
  for (let i = 0; i < totalSlots; i++) {
    const norm = Math.min(1, envelope[i] / (peak * 0.85));
    smoothed = smoothed * 0.55 + norm * 0.45;
    envelope[i] = smoothed;
  }

  return envelope;
}

export function sampleAudioEnergy(envelope: Float32Array | null, timeSec: number, samplesPerSec = 60): number {
  if (!envelope || envelope.length === 0) return 0;
  const idx = Math.max(0, Math.min(envelope.length - 1, Math.floor(timeSec * samplesPerSec)));
  return envelope[idx] || 0;
}

/**
 * Extracts compact waveform peaks (-1..1 or 0..1) for the bottom Timeline Dock.
 */
export function buildWaveformPeaks(buffer: AudioBuffer, targetBars = 600): Float32Array {
  const channel = buffer.getChannelData(0);
  const peaks = new Float32Array(targetBars);
  const blockSize = Math.max(1, Math.floor(channel.length / targetBars));

  for (let i = 0; i < targetBars; i++) {
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    let maxVal = 0;
    for (let j = start; j < end; j += Math.max(1, Math.floor(blockSize / 24))) {
      const abs = Math.abs(channel[j]);
      if (abs > maxVal) maxVal = abs;
    }
    peaks[i] = maxVal;
  }
  return peaks;
}
