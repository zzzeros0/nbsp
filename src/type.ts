import { type StructConstructor } from "./structure.js";
export type byte = number;
export type bytes = byte[];

export enum DataType {
  INT8 = 0,
  UINT8,
  INT16LE,
  INT16BE,
  UINT16LE,
  UINT16BE,
  INT32LE,
  INT32BE,
  UINT32LE,
  UINT32BE,
  INT64LE,
  INT64BE,
  UINT64LE,
  UINT64BE,
  FLOAT32LE,
  FLOAT32BE,
  FLOAT64LE,
  FLOAT64BE,
}
export type BigIntDataType =
  | DataType.INT64LE
  | DataType.INT64BE
  | DataType.UINT64LE
  | DataType.UINT64BE;
export type NumericArrayDataType = [type: DataType, size: byte];
export type StructArrayDataType<T extends Record<string, any>> = [
  type: StructConstructor<T>,
  size: byte,
];

export type DomainObject = Record<string, any>;
export type InferArray<T extends any> = T extends byte
  ? NumericArrayDataType
  : T extends DomainObject
    ? StructArrayDataType<T>
    : never;
export type ArrayDataType =
  | NumericArrayDataType
  | StructArrayDataType<DomainObject>;

export type Type = DataType | ArrayDataType | StructConstructor<any, any>;

export type DataValue = byte | bytes | bigint | object;

export type BindedType<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends string
    ? bytes
    : T[K] extends boolean
      ? byte
      : T[K] extends DomainObject
        ? BindedType<T[K]>
        : T[K];
};
export type StructDefinitionDataType<T extends DomainObject> = {
  [K in keyof T]: T[K] extends readonly (infer P)[]
    ? InferArray<P>
    : T[K] extends byte
      ? DataType
      : T[K] extends bigint
        ? BigIntDataType
        : T[K] extends string
          ? NumericArrayDataType
          : T[K] extends boolean
            ? DataType.UINT8
            : T[K] extends DomainObject
              ? StructConstructor<T[K]>
              : never;
};
export interface AlignedData<T extends Type = Type> {
  readonly type: T;
  readonly offset: byte;
  readonly size: byte;
}
export function isStructDataType(t: Type): t is StructConstructor {
  return typeof t === "function";
}

export function isArrayDataType(t: Type): t is ArrayDataType {
  return Array.isArray(t);
}
export function charDataType(length: byte): NumericArrayDataType {
  return [DataType.UINT8, length];
}
