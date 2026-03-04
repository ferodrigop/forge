import { describe, it, expect } from "vitest";
import { RingBuffer } from "../../src/core/ring-buffer.js";

describe("RingBuffer", () => {
  it("throws on zero or negative capacity", () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-1)).toThrow();
  });

  it("writes and reads back data", () => {
    const buf = new RingBuffer(1024);
    buf.addConsumer("a");
    buf.write("hello world");
    const result = buf.read("a");
    expect(result.data).toBe("hello world");
    expect(result.droppedBytes).toBe(0);
  });

  it("returns empty string on second read with no new data", () => {
    const buf = new RingBuffer(1024);
    buf.addConsumer("a");
    buf.write("hello");
    buf.read("a");
    const result = buf.read("a");
    expect(result.data).toBe("");
    expect(result.droppedBytes).toBe(0);
  });

  it("supports incremental reads", () => {
    const buf = new RingBuffer(1024);
    buf.addConsumer("a");
    buf.write("first ");
    expect(buf.read("a").data).toBe("first ");
    buf.write("second");
    expect(buf.read("a").data).toBe("second");
  });

  it("supports multiple consumers with independent cursors", () => {
    const buf = new RingBuffer(1024);
    buf.addConsumer("a");
    buf.addConsumer("b");

    buf.write("msg1");
    expect(buf.read("a").data).toBe("msg1");

    buf.write("msg2");
    expect(buf.read("a").data).toBe("msg2");
    expect(buf.read("b").data).toBe("msg1msg2"); // b hasn't read yet
  });

  it("wraps around correctly", () => {
    const buf = new RingBuffer(10);
    buf.addConsumer("a");
    buf.write("12345"); // half full
    buf.read("a");
    buf.write("67890ABCDE"); // wraps around
    const result = buf.read("a");
    expect(result.data).toBe("67890ABCDE");
    expect(result.droppedBytes).toBe(0);
  });

  it("reports dropped bytes when consumer falls behind", () => {
    const buf = new RingBuffer(10);
    buf.addConsumer("a");
    buf.write("12345"); // 5 bytes
    // don't read, write 10 more — consumer falls behind
    buf.write("ABCDEFGHIJ"); // total 15 written, buffer holds last 10
    const result = buf.read("a");
    expect(result.droppedBytes).toBe(5);
    expect(result.data).toBe("ABCDEFGHIJ");
  });

  it("handles data larger than buffer", () => {
    const buf = new RingBuffer(5);
    buf.addConsumer("a");
    buf.write("1234567890"); // 10 bytes into 5-byte buffer
    const result = buf.read("a");
    expect(result.data).toBe("67890");
    expect(result.droppedBytes).toBe(5);
  });

  it("auto-registers unknown consumer on read", () => {
    const buf = new RingBuffer(1024);
    buf.write("before");
    const result = buf.read("new");
    expect(result.data).toBe("");
    buf.write("after");
    expect(buf.read("new").data).toBe("after");
  });

  it("readAll returns all available data", () => {
    const buf = new RingBuffer(1024);
    buf.write("hello ");
    buf.write("world");
    expect(buf.readAll()).toBe("hello world");
  });

  it("readAll with wrap returns correct data", () => {
    const buf = new RingBuffer(10);
    buf.write("12345");
    buf.write("ABCDEFGHIJ");
    expect(buf.readAll()).toBe("ABCDEFGHIJ");
  });

  it("tracks totalBytesWritten and size", () => {
    const buf = new RingBuffer(10);
    expect(buf.totalBytesWritten).toBe(0);
    expect(buf.size).toBe(0);
    buf.write("12345");
    expect(buf.totalBytesWritten).toBe(5);
    expect(buf.size).toBe(5);
    buf.write("6789012345");
    expect(buf.totalBytesWritten).toBe(15);
    expect(buf.size).toBe(10); // capped at capacity
  });

  it("removeConsumer cleans up cursor", () => {
    const buf = new RingBuffer(1024);
    buf.addConsumer("a");
    buf.write("test");
    buf.removeConsumer("a");
    // Re-adding starts at current position
    buf.addConsumer("a");
    expect(buf.read("a").data).toBe("");
  });
});
