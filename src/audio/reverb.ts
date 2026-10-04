/**
 * Builds a stereo impulse response from noise with an exponential decay that
 * reaches -60 dB at `seconds`. Independent noise per channel gives width.
 */
export function createImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const decayPerSample = Math.log(1000) / length;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-decayPerSample * i);
    }
  }
  return buffer;
}
