import { DataType, type AlignedData } from "./type.js";

function assertInteger(value: number, min: number, max: number, type: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`${type}: value is not an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${type}: value ${value} out of range [${min}, ${max}]`);
  }
}

function assertFinite(value: number, type: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${type}: value is not finite`);
  }
}

function assertBigIntRange(
  value: bigint,
  min: bigint,
  max: bigint,
  type: string,
) {
  if (value < min || value > max) {
    throw new Error(`${type}: value ${value} out of range [${min}, ${max}]`);
  }
}

export function alloc(s: number) {
  // console.log("Alloc", s);
  return Buffer.alloc(s);
}

export function read(data: AlignedData, buffer: Buffer, offset: number) {
  // console.log("read", data, offset + data.offset);
  // if (typeof data.type === "number") {
  switch (data.type) {
    case DataType.INT8:
      return buffer.readInt8(offset + data.offset);
    case DataType.UINT8:
      return buffer.readUInt8(offset + data.offset);
    case DataType.INT16LE:
      return buffer.readInt16LE(offset + data.offset);
    case DataType.INT16BE:
      return buffer.readInt16BE(offset + data.offset);
    case DataType.UINT16LE:
      return buffer.readUInt16LE(offset + data.offset);
    case DataType.UINT16BE:
      return buffer.readUInt16BE(offset + data.offset);
    case DataType.INT32LE:
      return buffer.readInt32LE(offset + data.offset);
    case DataType.INT32BE:
      return buffer.readInt32BE(offset + data.offset);
    case DataType.UINT32LE:
      return buffer.readUInt32LE(offset + data.offset);
    case DataType.UINT32BE:
      return buffer.readUInt32BE(offset + data.offset);
    case DataType.INT64LE:
      return buffer.readBigInt64LE(offset + data.offset);
    case DataType.INT64BE:
      return buffer.readBigInt64BE(offset + data.offset);
    case DataType.UINT64LE:
      return buffer.readBigUInt64LE(offset + data.offset);
    case DataType.UINT64BE:
      return buffer.readBigUInt64BE(offset + data.offset);
    case DataType.FLOAT32LE:
      return buffer.readFloatLE(offset + data.offset);
    case DataType.FLOAT32BE:
      return buffer.readFloatBE(offset + data.offset);
    case DataType.FLOAT64LE:
      return buffer.readDoubleLE(offset + data.offset);
    case DataType.FLOAT64BE:
      return buffer.readDoubleBE(offset + data.offset);
    default:
      throw new Error("Invalid type");
  }
}

export function write(
  data: AlignedData,
  buffer: Buffer,
  value: number,
  offset: number,
) {
  // console.log("Write", data.offset + offset, value);
  // if (typeof data.type === "number") {
  //   if (Array.isArray(value) || typeof value !== "number")
  //     throw new Error("Invalid value");
  switch (data.type) {
    case DataType.INT8:
      assertInteger(value, -128, 127, "INT8");
      buffer.writeInt8(value, offset + data.offset);
      break;
    case DataType.UINT8:
      assertInteger(value, 0, 0xff, "UINT8");
      buffer.writeUInt8(value, offset + data.offset);
      break;
    case DataType.INT16LE:
      assertInteger(value, -0x8000, 0x7fff, "INT16");
      buffer.writeInt16LE(value, offset + data.offset);
      break;
    case DataType.INT16BE:
      assertInteger(value, -0x8000, 0x7fff, "INT16");
      buffer.writeInt16BE(value, offset + data.offset);
      break;
    case DataType.UINT16LE:
      assertInteger(value, 0, 0xffff, "UINT16");
      buffer.writeUInt16LE(value, offset + data.offset);
      break;
    case DataType.UINT16BE:
      assertInteger(value, 0, 0xffff, "UINT16");
      buffer.writeUInt16BE(value, offset + data.offset);
      break;
    case DataType.INT32LE:
      assertInteger(value, -0x80000000, 0x7fffffff, "INT32");
      buffer.writeInt32LE(value, offset + data.offset);
      break;
    case DataType.INT32BE:
      assertInteger(value, -0x80000000, 0x7fffffff, "INT32");
      buffer.writeInt32BE(value, offset + data.offset);
      break;
    case DataType.UINT32LE:
      assertInteger(value, 0, 0xffffffff, "UINT32");
      buffer.writeUInt32LE(value, offset + data.offset);
      break;
    case DataType.UINT32BE:
      assertInteger(value, 0, 0xffffffff, "UINT32");
      buffer.writeUInt32BE(value, offset + data.offset);
      break;
    case DataType.INT64LE: {
      const bigint = BigInt(value);
      assertBigIntRange(bigint, -(1n << 63n), (1n << 63n) - 1n, "INT64");
      buffer.writeBigInt64LE(bigint, offset + data.offset);
      break;
    }
    case DataType.INT64BE: {
      const bigint = BigInt(value);
      assertBigIntRange(bigint, -(1n << 63n), (1n << 63n) - 1n, "INT64");
      buffer.writeBigInt64BE(bigint, offset + data.offset);
      break;
    }
    case DataType.UINT64LE: {
      const bigint = BigInt(value);
      assertBigIntRange(bigint, 0n, (1n << 64n) - 1n, "UINT64");
      buffer.writeBigUInt64LE(bigint, offset + data.offset);
      break;
    }
    case DataType.UINT64BE: {
      const bigint = BigInt(value);
      assertBigIntRange(bigint, 0n, (1n << 64n) - 1n, "UINT64");
      buffer.writeBigUInt64BE(bigint, offset + data.offset);
      break;
    }
    case DataType.FLOAT32LE:
      assertFinite(value, "FLOAT32");
      buffer.writeFloatLE(value, offset + data.offset);
      break;
    case DataType.FLOAT32BE:
      assertFinite(value, "FLOAT32");
      buffer.writeFloatBE(value, offset + data.offset);
      break;
    case DataType.FLOAT64LE:
      assertFinite(value, "FLOAT64");
      buffer.writeDoubleLE(value, offset + data.offset);
      break;
    case DataType.FLOAT64BE:
      assertFinite(value, "FLOAT64");
      buffer.writeDoubleBE(value, offset + data.offset);
      break;
    default:
      throw new Error("Invalid type");
  }
}

let encoder: TextEncoder, decoder: TextDecoder;

function hexToBytes(hex: string): number[] {
  let bytes = [];
  for (let c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.slice(c, c + 2), 16));
  // console.log("Hex:", hex, bytes);
  return bytes;
}

function bytesToHex(bytes: number[]) {
  let hex = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte == undefined) throw new Error("Invalid byte");
    let current = byte < 0 ? byte + 256 : byte;
    hex.push((current >>> 4).toString(16));
    hex.push((current & 0xf).toString(16));
  }

  return hex.join("");
}

export function toUint8Array(s: string, hex: boolean = false): number[] {
  if (hex) return hexToBytes(s);
  if (!encoder) encoder = new TextEncoder(); // UTF-8 por defecto
  const bytes: Uint8Array = encoder.encode(s);
  // console.log("Raw", bytes);
  return Array.from(bytes);
}
export function toString(n: number[], hex: boolean = false): string {
  // console.log("String", n);
  if (hex) return bytesToHex(n);
  if (!decoder) decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(n));
}
