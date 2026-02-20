import { type StructureConstructor } from "./structure.js";
import { DataType, type ArrayDataType, type Type } from "./type.js";

function getDataTypeSize(type: DataType): number {
  switch (type) {
    case DataType.INT8:
    case DataType.UINT8:
      return 1;
    case DataType.INT16LE:
    case DataType.INT16BE:
    case DataType.UINT16LE:
    case DataType.UINT16BE:
      return 2;
    case DataType.INT32BE:
    case DataType.INT32LE:
    case DataType.UINT32LE:
    case DataType.UINT32BE:
      return 4;
    case DataType.INT64LE:
    case DataType.INT64BE:
    case DataType.UINT64LE:
    case DataType.UINT64BE:
      return 8;
    case DataType.FLOAT32LE:
    case DataType.FLOAT32BE:
      return 4;
    case DataType.FLOAT64LE:
    case DataType.FLOAT64BE:
      return 8;
  }
}

function getStructureDataSize(structure: StructureConstructor): number {
  return structure.size;
}

function getArrrayDataSize(type: ArrayDataType): number {
  return sizeof(type[0]) * type[1];
}
export function sizeof(type: Type | StructureConstructor): number {
  return typeof type === "number"
    ? getDataTypeSize(type)
    : typeof type === "string"
      ? 0
      : Array.isArray(type)
        ? getArrrayDataSize(type)
        : getStructureDataSize(type);
}
