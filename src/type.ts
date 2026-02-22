import { type StructureConstructor } from "./structure.js";

export type bytes = number[];

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
export type NumericArrayDataType = [type: DataType, size: number];
export type StructureArrayDataType<T extends Record<string, any>> = [
  type: StructureConstructor<T>,
  size: number,
];

export type DomainObject = Record<string, any>;
export type InferArray<T extends any> = T extends number
  ? NumericArrayDataType
  : T extends DomainObject
    ? StructureArrayDataType<T>
    : never;
export type ArrayDataType =
  | NumericArrayDataType
  | StructureArrayDataType<DomainObject>;

export type Type<D extends DomainObject = DomainObject> =
  | DataType
  | ArrayDataType
  | StructureConstructor<D>;
export type DataValue = number | bytes | bigint | object;

export type BindedType<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends string
    ? bytes
    : T[K] extends DomainObject
      ? BindedType<T[K]>
      : T[K];
};
export type StructureDefinitionDataType<T extends DomainObject> = {
  [K in keyof T]: T[K] extends readonly (infer P)[]
    ? InferArray<P>
    : T[K] extends number
      ? DataType
      : T[K] extends bigint
        ? BigIntDataType
        : T[K] extends string
          ? NumericArrayDataType
          : T[K] extends DomainObject
            ? StructureConstructor<T[K]>
            : never;
};
export interface AlignedData<T extends Type = Type> {
  readonly type: T;
  readonly offset: number;
  readonly size: number;
}
export function isStructureDataType(t: Type): t is StructureConstructor {
  return typeof t === "function";
}

export function isArrayDataType(t: Type): t is ArrayDataType {
  return Array.isArray(t);
}
export function charDataType(length: number): NumericArrayDataType {
  return [DataType.UINT8, length];
}
