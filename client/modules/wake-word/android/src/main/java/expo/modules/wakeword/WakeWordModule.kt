package expo.modules.wakeword

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.DataInputStream
import kotlin.concurrent.thread
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val SAMPLE_RATE = 16_000
private const val WINDOW_SAMPLES = 24_000
private const val HOP_SAMPLES = 4_000
private const val FFT_SIZE = 512
private const val FFT_BINS = FFT_SIZE / 2 + 1
private const val SPECTROGRAM_FRAMES = 151
private const val MIN_ACTIVE_RMS = 1e-4f
private const val MAX_STREAMING_THRESHOLD = 1.0f

private const val PREEMPHASIS = 0.97f
class WakeWordModule : Module() {
  private var detector: FiksoDetector? = null
  @Volatile private var isRunning = false
  private var recordingThread: Thread? = null
  private var audioRecord: AudioRecord? = null

  override fun definition() = ModuleDefinition {
    Name("WakeWord")
    Events("onWakeWord", "onWakeWordError")

    AsyncFunction("start") { threshold: Double, requiredHits: Int, cooldownMillis: Int ->
      startListening(threshold.toFloat(), requiredHits, cooldownMillis)
    }

    AsyncFunction("stop") {
      stopListening()
    }

    OnDestroy {
      stopListening()
    }
  }

  private fun startListening(threshold: Float, requiredHits: Int, cooldownMillis: Int) {
    if (isRunning) {
      return
    }

    val context = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      throw IllegalStateException("Microphone permission is required for wake word detection")
    }

    val effectiveThreshold = min(threshold, MAX_STREAMING_THRESHOLD)
    val currentDetector = detector ?: FiksoDetector(
      DataInputStream(BufferedInputStream(context.assets.open("fikso_cnn.bin")))
    ).also { detector = it }
    val minBufferSize = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    // Match sounddevice.InputStream from demo.py as closely as Android allows.
    val audioSource = MediaRecorder.AudioSource.MIC
    val recorder = AudioRecord(
      audioSource,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      max(minBufferSize, HOP_SAMPLES * 2)
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("Unable to initialize microphone recording")
    }

    audioRecord = recorder
    isRunning = true
    recordingThread = thread(name = "fikso-wake-word") {
      val window = FloatArray(WINDOW_SAMPLES)
      val chunk = ShortArray(HOP_SAMPLES)
      var bufferedSamples = 0
      var hits = 0
      var lastDetectionMillis = 0L

      try {
        recorder.startRecording()
        while (isRunning) {
          val samplesRead = recorder.read(chunk, 0, chunk.size)
          if (samplesRead <= 0) {
            continue
          }

          if (samplesRead >= WINDOW_SAMPLES) {
            for (index in 0 until WINDOW_SAMPLES) {
              window[index] = chunk[samplesRead - WINDOW_SAMPLES + index] / 32768f
            }
          } else {
            window.copyInto(window, 0, samplesRead, WINDOW_SAMPLES)
            for (index in 0 until samplesRead) {
              window[WINDOW_SAMPLES - samplesRead + index] = chunk[index] / 32768f
            }
          }
          bufferedSamples = min(WINDOW_SAMPLES, bufferedSamples + samplesRead)
          if (bufferedSamples < WINDOW_SAMPLES) continue

          val probability = currentDetector.predict(window)
          hits = if (probability >= effectiveThreshold) hits + 1 else 0
          val now = System.currentTimeMillis()
          if (hits >= requiredHits && now - lastDetectionMillis >= cooldownMillis) {
            lastDetectionMillis = now
            hits = 0
            sendEvent("onWakeWord", mapOf("probability" to probability))
          }
        }
      } catch (error: Exception) {
        if (isRunning) {
          sendEvent("onWakeWordError", mapOf("message" to (error.message ?: "Unknown microphone error")))
        }
      } finally {
        try {
          recorder.stop()
        } catch (_: IllegalStateException) {
        }
        recorder.release()
        if (audioRecord === recorder) audioRecord = null
      }
    }
  }

  private fun stopListening() {
    isRunning = false
    try {
      audioRecord?.stop()
    } catch (_: IllegalStateException) {
    }
    val currentThread = recordingThread
    if (currentThread != Thread.currentThread()) currentThread?.join(750)
    recordingThread = null
  }
}

private class FiksoDetector(input: DataInputStream) {
  private val tensors: Map<String, FloatArray>
  private val cosineTable = FloatArray(FFT_BINS * FFT_SIZE)
  private val sineTable = FloatArray(FFT_BINS * FFT_SIZE)

  init {
    val magic = ByteArray(6)
    input.readFully(magic)
    require(String(magic, Charsets.US_ASCII) == "FIKSO1") { "Unsupported wake word model asset" }

    val loadedTensors = mutableMapOf<String, FloatArray>()
    repeat(input.readUnsignedShortLE()) {
      val nameBytes = ByteArray(input.readUnsignedShortLE())
      input.readFully(nameBytes)
      val values = FloatArray(input.readIntLE())
      for (index in values.indices) values[index] = input.readFloatLE()
      loadedTensors[String(nameBytes, Charsets.US_ASCII)] = values
    }
    input.close()
    tensors = loadedTensors

    for (frequency in 0 until FFT_BINS) {
      for (sample in 0 until FFT_SIZE) {
        val angle = 2.0 * Math.PI * frequency * sample / FFT_SIZE
        cosineTable[frequency * FFT_SIZE + sample] = cos(angle).toFloat()
        sineTable[frequency * FFT_SIZE + sample] = sin(angle).toFloat()
      }
    }
  }

  fun predict(audio: FloatArray): Float {
    var squareSum = 0.0
    for (sample in audio) squareSum += sample * sample
    if (sqrt(squareSum / audio.size) < MIN_ACTIVE_RMS) return 0f

    var features = logMelSpectrogram(audio)
    features = relu(batchNorm(conv(features, 1, 40, SPECTROGRAM_FRAMES, tensor("cnn.0.weight"), tensor("cnn.0.bias"), 12), 12, tensor("cnn.1.weight"), tensor("cnn.1.bias"), tensor("cnn.1.running_mean"), tensor("cnn.1.running_var")))
    features = maxPool(features, 12, 40, SPECTROGRAM_FRAMES)
    features = relu(batchNorm(conv(features, 12, 20, 75, tensor("cnn.4.weight"), tensor("cnn.4.bias"), 24), 24, tensor("cnn.5.weight"), tensor("cnn.5.bias"), tensor("cnn.5.running_mean"), tensor("cnn.5.running_var")))
    features = maxPool(features, 24, 20, 75)
    features = relu(conv(features, 24, 10, 37, tensor("cnn.8.weight"), tensor("cnn.8.bias"), 32))
    features = adaptiveAveragePool(features, 32, 10, 37, 4, 8)
    val hidden = relu(linear(features, tensor("head.2.weight"), tensor("head.2.bias"), 64))
    val logit = linear(hidden, tensor("head.5.weight"), tensor("head.5.bias"), 1)[0]
    return (1.0 / (1.0 + exp(-logit.toDouble()))).toFloat()
  }

  private fun logMelSpectrogram(audio: FloatArray): FloatArray {
    val window = tensor("features.window")
    val melFilter = tensor("features.mel_filter")
    val output = FloatArray(40 * SPECTROGRAM_FRAMES)
    val powerSpectrum = FloatArray(FFT_BINS)

    for (frame in 0 until SPECTROGRAM_FRAMES) {
      for (frequency in 0 until FFT_BINS) {
        var real = 0.0
        var imaginary = 0.0
        val tableOffset = frequency * FFT_SIZE
        for (sample in window.indices) {
          val fftSample = sample + (FFT_SIZE - window.size) / 2
          val audioIndex = reflectIndex(frame * 160 - FFT_SIZE / 2 + fftSample, audio.size)
          val current = audio[audioIndex]; val previous = if (audioIndex > 0) audio[audioIndex - 1] else 0f; val value = (current - PREEMPHASIS * previous) * window[sample]
          real += value * cosineTable[tableOffset + fftSample]
          imaginary -= value * sineTable[tableOffset + fftSample]
        }
        powerSpectrum[frequency] = (real * real + imaginary * imaginary).toFloat()
      }

      for (mel in 0 until 40) {
        var value = 0.0
        for (frequency in 0 until FFT_BINS) {
          value += melFilter[mel * FFT_BINS + frequency] * powerSpectrum[frequency]
        }
        output[mel * SPECTROGRAM_FRAMES + frame] = ln(max(value, 1e-6)).toFloat()
      }
    }

    var mean = 0.0
    for (value in output) mean += value
    mean /= output.size
    var variance = 0.0
    for (value in output) variance += (value - mean) * (value - mean)
    val standardDeviation = max(sqrt(variance / (output.size - 1)), 1e-5)
    for (index in output.indices) output[index] = ((output[index] - mean) / standardDeviation).toFloat()
    return output
  }

  private fun conv(input: FloatArray, inputChannels: Int, height: Int, width: Int, weights: FloatArray, bias: FloatArray, outputChannels: Int): FloatArray {
    val output = FloatArray(outputChannels * height * width)
    for (outputChannel in 0 until outputChannels) {
      for (row in 0 until height) {
        for (column in 0 until width) {
          var value = bias[outputChannel]
          for (inputChannel in 0 until inputChannels) {
            for (kernelRow in 0 until 3) {
              val inputRow = row + kernelRow - 1
              if (inputRow !in 0 until height) continue
              for (kernelColumn in 0 until 3) {
                val inputColumn = column + kernelColumn - 1
                if (inputColumn !in 0 until width) continue
                val inputIndex = (inputChannel * height + inputRow) * width + inputColumn
                val weightIndex = ((outputChannel * inputChannels + inputChannel) * 3 + kernelRow) * 3 + kernelColumn
                value += input[inputIndex] * weights[weightIndex]
              }
            }
          }
          output[(outputChannel * height + row) * width + column] = value
        }
      }
    }
    return output
  }

  private fun batchNorm(input: FloatArray, channels: Int, weight: FloatArray, bias: FloatArray, mean: FloatArray, variance: FloatArray): FloatArray {
    val channelSize = input.size / channels
    for (channel in 0 until channels) {
      val scale = weight[channel] / sqrt(variance[channel] + 1e-5f)
      val offset = bias[channel] - mean[channel] * scale
      for (index in 0 until channelSize) {
        val valueIndex = channel * channelSize + index
        input[valueIndex] = input[valueIndex] * scale + offset
      }
    }
    return input
  }

  private fun relu(input: FloatArray): FloatArray {
    for (index in input.indices) input[index] = max(0f, input[index])
    return input
  }

  private fun maxPool(input: FloatArray, channels: Int, height: Int, width: Int): FloatArray {
    val outputHeight = height / 2
    val outputWidth = width / 2
    val output = FloatArray(channels * outputHeight * outputWidth)
    for (channel in 0 until channels) {
      for (row in 0 until outputHeight) {
        for (column in 0 until outputWidth) {
          var value = -Float.MAX_VALUE
          for (rowOffset in 0 until 2) {
            for (columnOffset in 0 until 2) {
              value = max(value, input[(channel * height + row * 2 + rowOffset) * width + column * 2 + columnOffset])
            }
          }
          output[(channel * outputHeight + row) * outputWidth + column] = value
        }
      }
    }
    return output
  }

  private fun adaptiveAveragePool(input: FloatArray, channels: Int, height: Int, width: Int, outputHeight: Int, outputWidth: Int): FloatArray {
    val output = FloatArray(channels * outputHeight * outputWidth)
    for (channel in 0 until channels) {
      for (row in 0 until outputHeight) {
        val startRow = floor(row * height.toDouble() / outputHeight).toInt()
        val endRow = ceil((row + 1) * height.toDouble() / outputHeight).toInt()
        for (column in 0 until outputWidth) {
          val startColumn = floor(column * width.toDouble() / outputWidth).toInt()
          val endColumn = ceil((column + 1) * width.toDouble() / outputWidth).toInt()
          var sum = 0f
          for (inputRow in startRow until endRow) {
            for (inputColumn in startColumn until endColumn) {
              sum += input[(channel * height + inputRow) * width + inputColumn]
            }
          }
          output[(channel * outputHeight + row) * outputWidth + column] = sum / ((endRow - startRow) * (endColumn - startColumn))
        }
      }
    }
    return output
  }

  private fun linear(input: FloatArray, weights: FloatArray, bias: FloatArray, outputSize: Int): FloatArray {
    val output = FloatArray(outputSize)
    for (row in 0 until outputSize) {
      var value = bias[row]
      for (column in input.indices) value += input[column] * weights[row * input.size + column]
      output[row] = value
    }
    return output
  }

  private fun tensor(name: String) = tensors[name] ?: error("Missing model tensor: $name")

  private fun reflectIndex(index: Int, size: Int): Int {
    if (index < 0) return -index
    if (index >= size) return size * 2 - index - 2
    return index
  }
}

private fun DataInputStream.readUnsignedShortLE(): Int {
  val first = readUnsignedByte()
  val second = readUnsignedByte()
  return first or (second shl 8)
}

private fun DataInputStream.readIntLE(): Int {
  val first = readUnsignedByte()
  val second = readUnsignedByte()
  val third = readUnsignedByte()
  val fourth = readUnsignedByte()
  return first or (second shl 8) or (third shl 16) or (fourth shl 24)
}

private fun DataInputStream.readFloatLE() = Float.fromBits(readIntLE())
