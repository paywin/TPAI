class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.phase=0; this.sum=0; this.frame=new Int16Array(320); this.offset=0; }
  process(inputs) {
    const input=inputs[0]?.[0];
    if (!input) return true;
    const ratio=sampleRate/16000;
    for (const sample of input) {
      let remaining=1;
      while (remaining > 1e-8) {
        const take=Math.min(remaining, ratio-this.phase);
        this.sum += sample*take; this.phase += take; remaining -= take;
        if (this.phase >= ratio-1e-8) {
          const value=Math.max(-1, Math.min(1, this.sum/ratio));
          this.frame[this.offset++]=Math.round(value*(value < 0 ? 32768 : 32767));
          this.phase=0; this.sum=0;
          if (this.offset===320) {
            this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
            this.frame=new Int16Array(320); this.offset=0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('pulso-pcm', PcmCapture);
