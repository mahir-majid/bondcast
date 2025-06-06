// Configuring WorkLet Node ElevenLabs TTS Speaker Functionality in Chat.tsx

class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(0);
        this.playing = false;
        this.port.onmessage = (event) => {
            if (event.data.type === 'pcm') {
                // Convert Int16Array to Float32Array
                const pcmData = new Int16Array(event.data.buffer);
                const floatData = new Float32Array(pcmData.length);
                for (let i = 0; i < pcmData.length; i++) {
                    floatData[i] = pcmData[i] / 32768;
                }
                
                // Append to our buffer
                const newBuffer = new Float32Array(this.buffer.length + floatData.length);
                newBuffer.set(this.buffer);
                newBuffer.set(floatData, this.buffer.length);
                this.buffer = newBuffer;

                // If we just received data and weren't playing, signal start
                if (!this.playing && this.buffer.length > 0) {
                    this.playing = true;
                    this.port.postMessage({ type: "audio_started" });
                }
            } else if (event.data.type === 'stop_audio') {
                // Clear the buffer and stop playing
                this.buffer = new Float32Array(0);
                if (this.playing) {
                    this.playing = false;
                    this.port.postMessage({ type: "audio_done" });
                }
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        if (this.buffer.length === 0) {
            if (this.playing) {
                this.playing = false;
                this.port.postMessage({ type: "audio_done" });
            }
            return true;
        }

        // Copy data from our buffer to the output
        const samplesToCopy = Math.min(channel.length, this.buffer.length);
        channel.set(this.buffer.subarray(0, samplesToCopy));

        // Remove the samples we just played
        if (samplesToCopy < this.buffer.length) {
            this.buffer = this.buffer.subarray(samplesToCopy);
        } else {
            this.buffer = new Float32Array(0);
            if (this.playing) {
                this.playing = false;
                this.port.postMessage({ type: "audio_done" });
            }
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor); 