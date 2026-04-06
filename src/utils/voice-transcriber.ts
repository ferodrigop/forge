/**
 * Voice transcription using @huggingface/transformers (Whisper ONNX).
 * Lazy-loads the pipeline and auto-downloads onnx-community/whisper-small
 * to ~/.forge/models/ on first use.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "./logger.js";

const MODEL_ID = "onnx-community/whisper-small";
const CACHE_DIR = join(homedir(), ".forge", "models");

let pipelineInstance: any = null;
let pipelineLoading: Promise<any> | null = null;

/** Download progress state exposed to the API layer. */
export const downloadStatus = {
  downloading: false,
  progress: 0,       // 0–100 overall
  file: "",           // current file name
  totalFiles: 0,
  completedFiles: 0,
  error: null as string | null,
};

async function getTranscriber(): Promise<any> {
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = CACHE_DIR;

      const cached = isModelCached();
      if (!cached) {
        downloadStatus.downloading = true;
        downloadStatus.progress = 0;
        downloadStatus.totalFiles = 0;
        downloadStatus.completedFiles = 0;
        downloadStatus.error = null;
      }

      logger.info("Loading Whisper model via Transformers.js", { model: MODEL_ID, cacheDir: CACHE_DIR });

      const fileProgressMap = new Map<string, number>();

      const transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
        dtype: "q8",
        progress_callback: (event: any) => {
          if (!event || cached) return;
          if (event.status === "initiate") {
            downloadStatus.totalFiles = (downloadStatus.totalFiles || 0) + 1;
            downloadStatus.file = event.file || "";
          } else if (event.status === "progress" && typeof event.progress === "number") {
            downloadStatus.file = event.file || downloadStatus.file;
            fileProgressMap.set(event.file || "", event.progress);
            // Average progress across all tracked files
            const values = [...fileProgressMap.values()];
            downloadStatus.progress = Math.round(values.reduce((a, b) => a + b, 0) / Math.max(downloadStatus.totalFiles, values.length));
          } else if (event.status === "done") {
            downloadStatus.completedFiles++;
            if (event.file) fileProgressMap.set(event.file, 100);
          } else if (event.status === "ready") {
            downloadStatus.downloading = false;
            downloadStatus.progress = 100;
          }
        },
      });

      downloadStatus.downloading = false;
      downloadStatus.progress = 100;
      pipelineInstance = transcriber;
      logger.info("Whisper model loaded successfully");
      return transcriber;
    } catch (err) {
      downloadStatus.downloading = false;
      downloadStatus.error = (err as Error).message;
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
  const modelDir = join(CACHE_DIR, "onnx-community", "whisper-small");
  return existsSync(modelDir);
}

/**
 * Pre-load the model (triggers download if not cached).
 * Returns a promise that resolves when the model is ready.
 */
export async function ensureModelReady(): Promise<void> {
  await getTranscriber();
}
