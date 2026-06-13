package expo.modules.audiostream

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

private const val SAMPLE_RATE = 16_000
private const val PCM_STREAM_CHUNK_SAMPLES = 1_600

class AudioStreamModule : Module() {
  @Volatile private var isPcmStreaming = false
  private var pcmStreamingThread: Thread? = null
  private var pcmAudioRecord: AudioRecord? = null

  override fun definition() = ModuleDefinition {
    Name("AudioStream")
    Events("onPcmAudio", "onPcmStreamError")

    AsyncFunction("startPcmStream") {
      startPcmStreaming()
    }

    AsyncFunction("stopPcmStream") {
      stopPcmStreaming()
    }

    OnDestroy {
      stopPcmStreaming()
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

    pcmAudioRecord = recorder
    isPcmStreaming = true
    pcmStreamingThread = thread(name = "fikso-pcm-stream") {
      val chunk = ShortArray(PCM_STREAM_CHUNK_SAMPLES)

      try {
        recorder.startRecording()
        while (isPcmStreaming) {
          val samplesRead = recorder.read(chunk, 0, chunk.size)
          if (samplesRead <= 0) {
            continue
          }

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
        if (pcmAudioRecord === recorder) pcmAudioRecord = null
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
}
