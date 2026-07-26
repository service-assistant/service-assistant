package expo.modules.audiostream

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

private const val SAMPLE_RATE = 16_000
private const val PLAYBACK_SAMPLE_RATE = 24_000
private const val PCM_STREAM_CHUNK_SAMPLES = 1_600
private const val MAX_CONSECUTIVE_EMPTY_READS = 10

class AudioStreamModule : Module() {
  @Volatile private var isPcmStreaming = false
  @Volatile private var isPcmPlaying = false
  private var pcmStreamingThread: Thread? = null
  private var pcmPlaybackThread: Thread? = null
  private var pcmAudioRecord: AudioRecord? = null
  private var pcmAudioTrack: AudioTrack? = null
  private val pcmPlaybackQueue = LinkedBlockingQueue<ByteArray>()

  override fun definition() = ModuleDefinition {
    Name("AudioStream")
    Events("onPcmAudio", "onPcmStreamError")

    AsyncFunction("startPcmStream") {
      startPcmStreaming()
    }

    AsyncFunction("stopPcmStream") {
      stopPcmStreaming()
    }

    AsyncFunction("startPcmPlayback") {
      startPcmPlayback()
    }

    AsyncFunction("enqueuePcmPlaybackChunk") { chunkBase64: String ->
      enqueuePcmPlaybackChunk(chunkBase64)
    }

    AsyncFunction("stopPcmPlayback") {
      stopPcmPlayback()
    }

    OnDestroy {
      stopPcmStreaming()
      stopPcmPlayback()
    }
  }

  private fun startPcmStreaming() {
    if (isPcmStreaming) {
      return
    }

    val context = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      throw IllegalStateException("Microphone permission is required for audio streaming")
    }

    val minBufferSize = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      max(minBufferSize, PCM_STREAM_CHUNK_SAMPLES * 2)
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("Unable to initialize microphone streaming")
    }

    try {
      recorder.startRecording()
    } catch (error: IllegalStateException) {
      recorder.release()
      throw IllegalStateException("Unable to start microphone streaming", error)
    }
    if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      recorder.release()
      throw IllegalStateException("Microphone did not enter the recording state")
    }

    synchronized(this) {
      pcmAudioRecord = recorder
      isPcmStreaming = true
    }
    pcmStreamingThread = thread(name = "fikso-pcm-stream") {
      val chunk = ShortArray(PCM_STREAM_CHUNK_SAMPLES)
      var consecutiveEmptyReads = 0

      try {
        while (isPcmStreaming) {
          val samplesRead = recorder.read(chunk, 0, chunk.size)
          if (samplesRead <= 0) {
            consecutiveEmptyReads += 1
            if (consecutiveEmptyReads >= MAX_CONSECUTIVE_EMPTY_READS) {
              throw IllegalStateException("Microphone stopped producing audio")
            }
            continue
          }
          consecutiveEmptyReads = 0

          val bytes = ByteArray(samplesRead * 2)
          var squareSum = 0.0
          for (index in 0 until samplesRead) {
            val sample = chunk[index].toInt()
            bytes[index * 2] = (sample and 0xff).toByte()
            bytes[index * 2 + 1] = ((sample shr 8) and 0xff).toByte()
            val normalized = sample / 32768.0
            squareSum += normalized * normalized
          }
          val rms = sqrt(squareSum / samplesRead)
          val metering = if (rms > 0.0) 20.0 * kotlin.math.log10(rms) else -160.0
          sendEvent(
            "onPcmAudio",
            mapOf(
              "pcm" to Base64.encodeToString(bytes, Base64.NO_WRAP),
              "metering" to metering
            )
          )
        }
      } catch (error: Exception) {
        if (isPcmStreaming) {
          sendEvent("onPcmStreamError", mapOf("message" to (error.message ?: "Unknown microphone streaming error")))
        }
      } finally {
        try {
          recorder.stop()
        } catch (_: IllegalStateException) {
        }
        recorder.release()
        synchronized(this) {
          if (pcmAudioRecord === recorder) {
            pcmAudioRecord = null
            isPcmStreaming = false
            pcmStreamingThread = null
          }
        }
      }
    }
  }

  private fun stopPcmStreaming() {
    isPcmStreaming = false
    try {
      pcmAudioRecord?.stop()
    } catch (_: IllegalStateException) {
    }
    val currentThread = pcmStreamingThread
    if (currentThread != Thread.currentThread()) currentThread?.join(750)
    pcmStreamingThread = null
  }

  private fun startPcmPlayback() {
    if (isPcmPlaying) {
      return
    }

    val minBufferSize = AudioTrack.getMinBufferSize(
      PLAYBACK_SAMPLE_RATE,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(PLAYBACK_SAMPLE_RATE)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(max(minBufferSize, PLAYBACK_SAMPLE_RATE))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    pcmPlaybackQueue.clear()
    pcmAudioTrack = track
    isPcmPlaying = true
    pcmPlaybackThread = thread(name = "fikso-pcm-playback") {
      try {
        track.play()
        while (isPcmPlaying || pcmPlaybackQueue.isNotEmpty()) {
          val bytes = pcmPlaybackQueue.poll(250, TimeUnit.MILLISECONDS) ?: continue
          var offset = 0
          while (offset < bytes.size && (isPcmPlaying || pcmPlaybackQueue.isNotEmpty())) {
            val written = track.write(bytes, offset, bytes.size - offset)
            if (written <= 0) break
            offset += written
          }
        }
      } catch (error: Exception) {
        sendEvent("onPcmStreamError", mapOf("message" to (error.message ?: "Unknown PCM playback error")))
      } finally {
        try {
          track.stop()
        } catch (_: IllegalStateException) {
        }
        track.release()
        if (pcmAudioTrack === track) pcmAudioTrack = null
      }
    }
  }

  private fun enqueuePcmPlaybackChunk(chunkBase64: String) {
    if (!isPcmPlaying) {
      startPcmPlayback()
    }
    pcmPlaybackQueue.offer(Base64.decode(chunkBase64, Base64.NO_WRAP))
  }

  private fun stopPcmPlayback() {
    isPcmPlaying = false
    pcmPlaybackQueue.clear()
    try {
      pcmAudioTrack?.pause()
      pcmAudioTrack?.flush()
      pcmAudioTrack?.stop()
    } catch (_: IllegalStateException) {
    }
    val currentThread = pcmPlaybackThread
    if (currentThread != Thread.currentThread()) currentThread?.join(750)
    pcmPlaybackThread = null
  }
}
