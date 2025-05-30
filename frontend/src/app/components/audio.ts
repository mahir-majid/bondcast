export const processorCode = `
  class PCMProcessor extends AudioWorkletProcessor {
    process(inputs) {
      const input = inputs[0];
      if (input.length && input[0].length) {
        const data = input[0];
        const buf = new Int16Array(data.length);
        for (let i = 0; i < data.length; i++) {
          const s = Math.max(-1, Math.min(1, data[i]));
          buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.port.postMessage(buf.buffer, [buf.buffer]);
      }
      return true;
    }
  }
  registerProcessor("pcm-processor", PCMProcessor);
`;

export async function setupAudioProcessor(audioContext: AudioContext): Promise<AudioWorkletNode> {
  const blobUrl = URL.createObjectURL(new Blob([processorCode], { type: "application/javascript" }));
  await audioContext.audioWorklet.addModule(blobUrl);
  
  return new AudioWorkletNode(audioContext, "pcm-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1]
  });
}
