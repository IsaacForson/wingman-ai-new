/**
 * Captures the microphone ("me") and, optionally, system audio ("them" - the
 * other side of a call), converts both to 16 kHz mono PCM16 in an AudioWorklet
 * and streams 100 ms frames to the backend.
 */
import { sendAudio } from './socket'

const WORKLET = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.buffer = new Int16Array(1600) // 100 ms at 16 kHz
    this.length = 0
    this.position = 0
    this.level = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channels = input.length
    const frames = input[0].length
    for (let i = 0; i < frames; i++) {
      let sample = 0
      for (let c = 0; c < channels; c++) sample += input[c][i]
      sample /= channels
      this.level = Math.max(this.level * 0.999, Math.abs(sample))
      this.position += 1
      if (this.position >= this.ratio) {
        this.position -= this.ratio
        const s = Math.max(-1, Math.min(1, sample))
        this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff
        if (this.length === this.buffer.length) {
          this.port.postMessage({ pcm: this.buffer.buffer.slice(0), level: this.level })
          this.length = 0
        }
      }
    }
    return true
  }
}
registerProcessor('pcm-downsampler', PcmDownsampler)
`

type Channel = 'me' | 'them'

interface Source {
  stream: MediaStream
  node: AudioWorkletNode
  input: MediaStreamAudioSourceNode
}

export class AudioCapture {
  private context: AudioContext | null = null
  private sources: Partial<Record<Channel, Source>> = {}
  onLevel: (channel: Channel, level: number) => void = () => {}

  get channels(): Channel[] {
    return Object.keys(this.sources) as Channel[]
  }

  async start(options: { micDeviceId?: string; systemAudio: boolean }): Promise<{ channels: Channel[]; warnings: string[] }> {
    await this.stop()
    const warnings: string[] = []
    this.context = new AudioContext()
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await this.context.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    if (window.wingman) await window.wingman.media.requestMicrophone()
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options.micDeviceId && options.micDeviceId !== 'default' ? { exact: options.micDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })
      this.attach('me', mic)
    } catch (err) {
      warnings.push(`Microphone unavailable: ${(err as Error).message}`)
    }

    if (options.systemAudio) {
      try {
        // Electron's display-media handler answers this with loopback (system) audio.
        const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
        display.getVideoTracks().forEach((t) => t.stop())
        if (display.getAudioTracks().length) this.attach('them', new MediaStream(display.getAudioTracks()))
        else warnings.push('System audio is not available on this computer.')
      } catch (err) {
        warnings.push(`Call audio unavailable: ${(err as Error).message}. On macOS, allow Wingman under Screen & System Audio Recording.`)
      }
    }

    if (!this.channels.length) await this.stop()
    return { channels: this.channels, warnings }
  }

  private attach(channel: Channel, stream: MediaStream): void {
    const ctx = this.context!
    const input = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-downsampler')
    node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      sendAudio(channel, e.data.pcm)
      this.onLevel(channel, e.data.level)
    }
    input.connect(node)
    // The worklet must be pulled by the graph; route it to a muted gain so nothing is played back.
    const mute = ctx.createGain()
    mute.gain.value = 0
    node.connect(mute).connect(ctx.destination)
    this.sources[channel] = { stream, node, input }
  }

  async stop(): Promise<void> {
    for (const source of Object.values(this.sources)) {
      source?.stream.getTracks().forEach((t) => t.stop())
      source?.input.disconnect()
      source?.node.disconnect()
    }
    this.sources = {}
    if (this.context) {
      await this.context.close().catch(() => {})
      this.context = null
    }
  }
}

export const audioCapture = new AudioCapture()
