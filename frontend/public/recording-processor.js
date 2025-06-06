// Recording-specific audio processor that handles sample rate conversion
class RecordingProcessor extends AudioWorkletProcessor {
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
                
                // Resample from 16kHz to 44.1kHz (ratio = 2.75625)
                const resampledData = this.resample(floatData, 16000, 44100);
                
                // Append to our buffer
                const newBuffer = new Float32Array(this.buffer.length + resampledData.length);
                newBuffer.set(this.buffer);
                newBuffer.set(resampledData, this.buffer.length);
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

    // Linear interpolation resampling
    resample(input, fromRate, toRate) {
        const ratio = toRate / fromRate;
        const newLength = Math.round(input.length * ratio);
        const result = new Float32Array(newLength);
        
        for (let i = 0; i < newLength; i++) {
            const position = i / ratio;
            const index = Math.floor(position);
            const fraction = position - index;
            
            // Get the two samples we need to interpolate between
            const sample1 = input[index] || 0;
            const sample2 = input[index + 1] || 0;
            
            // Linear interpolation
            result[i] = sample1 + fraction * (sample2 - sample1);
        }
        
        return result;
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

registerProcessor('recording-processor', RecordingProcessor); 