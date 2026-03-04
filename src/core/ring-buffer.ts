/**
 * Circular byte buffer with multi-consumer cursor-based incremental reads.
 *
 * Data is written sequentially. Each consumer has a cursor (absolute byte offset).
 * When the buffer wraps, old data is overwritten. Consumers that fall behind get
 * a `droppedBytes` count so they know data was lost.
 */
export class RingBuffer {
  private buf: Buffer;
  private capacity: number;

  /** Total bytes ever written (monotonic counter, never wraps) */
  private writeOffset = 0;

  /** Per-consumer cursors: maps consumer ID → absolute byte offset of next unread byte */
  private cursors = new Map<string, number>();

  /** Per-consumer total bytes read (accumulated across all reads) */
  private bytesReadCounters = new Map<string, number>();

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error("RingBuffer capacity must be > 0");
    this.capacity = capacity;
    this.buf = Buffer.alloc(capacity);
  }

  /** Write data into the ring buffer */
  write(data: string | Buffer): void {
    const bytes = typeof data === "string" ? Buffer.from(data) : data;
    let src = bytes;

    if (src.length > this.capacity) {
      // Data larger than buffer — skip the bytes that won't fit
      const skip = src.length - this.capacity;
      this.writeOffset += skip;
      src = src.subarray(skip);
    }

    const len = src.length;
    const startPos = this.writeOffset % this.capacity;
    const spaceAtEnd = this.capacity - startPos;

    if (len <= spaceAtEnd) {
      src.copy(this.buf, startPos);
    } else {
      // Wrap around
      src.copy(this.buf, startPos, 0, spaceAtEnd);
      src.copy(this.buf, 0, spaceAtEnd, len);
    }

    this.writeOffset += len;
  }

  /** Register a consumer cursor (starts at current write position — no backlog) */
  addConsumer(id: string): void {
    this.cursors.set(id, this.writeOffset);
    this.bytesReadCounters.set(id, 0);
  }

  /** Remove a consumer cursor */
  removeConsumer(id: string): void {
    this.cursors.delete(id);
    this.bytesReadCounters.delete(id);
  }

  /** Read new data for a consumer since their last read */
  read(consumerId: string): { data: string; droppedBytes: number } {
    let cursor = this.cursors.get(consumerId);
    if (cursor === undefined) {
      // Auto-register at current position
      this.cursors.set(consumerId, this.writeOffset);
      return { data: "", droppedBytes: 0 };
    }

    if (cursor === this.writeOffset) {
      return { data: "", droppedBytes: 0 };
    }

    let droppedBytes = 0;
    const oldest = this.writeOffset - this.capacity;

    // If cursor is behind the oldest available data, advance it
    if (cursor < oldest) {
      droppedBytes = oldest - cursor;
      cursor = oldest;
    }

    const bytesToRead = this.writeOffset - cursor;
    const startPos = cursor % this.capacity;

    let result: Buffer;
    if (startPos + bytesToRead <= this.capacity) {
      result = Buffer.alloc(bytesToRead);
      this.buf.copy(result, 0, startPos, startPos + bytesToRead);
    } else {
      // Wrap around read
      const firstChunk = this.capacity - startPos;
      const secondChunk = bytesToRead - firstChunk;
      result = Buffer.alloc(bytesToRead);
      this.buf.copy(result, 0, startPos, this.capacity);
      this.buf.copy(result, firstChunk, 0, secondChunk);
    }

    this.cursors.set(consumerId, this.writeOffset);
    const prev = this.bytesReadCounters.get(consumerId) ?? 0;
    this.bytesReadCounters.set(consumerId, prev + bytesToRead);
    return { data: result.toString("utf-8"), droppedBytes };
  }

  /** Read ALL data currently in the buffer (not cursor-based) */
  readAll(): string {
    if (this.writeOffset === 0) return "";

    const available = Math.min(this.writeOffset, this.capacity);
    const startPos = (this.writeOffset - available) % this.capacity;

    if (startPos + available <= this.capacity) {
      return this.buf.subarray(startPos, startPos + available).toString("utf-8");
    }

    const firstChunk = this.capacity - startPos;
    const result = Buffer.alloc(available);
    this.buf.copy(result, 0, startPos, this.capacity);
    this.buf.copy(result, firstChunk, 0, available - firstChunk);
    return result.toString("utf-8");
  }

  get totalBytesWritten(): number {
    return this.writeOffset;
  }

  /** Get total bytes read by a specific consumer */
  getTotalBytesRead(consumerId: string): number {
    return this.bytesReadCounters.get(consumerId) ?? 0;
  }

  get size(): number {
    return Math.min(this.writeOffset, this.capacity);
  }
}
