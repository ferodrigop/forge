/**
 * Voice transcription using @huggingface/transformers (Whisper ONNX).
 * Lazy-loads the pipeline and auto-downloads onnx-community/whisper-tiny
 * to ~/.forge/models/ on first use.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "./logger.js";

const MODEL_ID = "onnx-community/whisper-tiny";
const CACHE_DIR = join(homedir(), ".forge", "models");

let pipelineInstance: any = null;
let pipelineLoading: Promise<any> | null = null;

async function getTranscriber(): Promise<any> {
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = CACHE_DIR;
      logger.info("Loading Whisper model via Transformers.js", { model: MODEL_ID, cacheDir: CACHE_DIR });
      const transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
        dtype: "q8",
      });
      pipelineInstance = transcriber;
      logger.info("Whisper model loaded successfully");
      return transcriber;
    } catch (err) {
      pipelineLoading = null;
      throw err;
    }
  })();

  return pipelineLoading;
}

/**
 * Parse a WAV buffer (16-bit PCM, mono, 16kHz) into a Float32Array.
 */
function parseWavToFloat32(buffer: Buffer): Float32Array {
  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV file");
  }

  // Walk chunks to find 'data'
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const dataStart = offset + 8;
      const sampleCount = chunkSize / 2; // 16-bit = 2 bytes per sample
      const samples = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = buffer.readInt16LE(dataStart + i * 2) / 0x7fff;
      }
      return samples;
    }
    offset += 8 + chunkSize;
    // Chunks are word-aligned
    if (chunkSize % 2 !== 0) offset++;
  }
  throw new Error("No data chunk found in WAV");
}

/**
 * Transcribe a WAV audio buffer (16-bit PCM, 16kHz mono).
 */
export async function transcribe(wavBuffer: Buffer): Promise<string> {
  const transcriber = await getTranscriber();
  const audioData = parseWavToFloat32(wavBuffer);
  const result = await transcriber(audioData, {
    return_timestamps: false,
  });
  return (result as any).text?.trim() ?? "";
}

/**
 * Check whether the model files are already cached locally.
 */
export function isModelCached(): boolean {
  const modelDir = join(CACHE_DIR, "onnx-community", "whisper-tiny");
  return existsSync(modelDir);
}
