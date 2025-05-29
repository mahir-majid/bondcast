class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(0);
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
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        if (this.buffer.length === 0) {
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
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor); 