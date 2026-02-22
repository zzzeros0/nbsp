import { alloc, read, write, sizeof } from "./memory.js";
import type { PropertyTransformer, Transformers } from "./transformer.js";
import { applyTransform, type ApplyTransformers } from "./transformer.js";
import {
  DataType,
  isArrayDataType,
  isStructureDataType,
  type AlignedData,
  type ArrayDataType,
  type BindedType,
  type DataValue,
  type DomainObject,
  type StructureDefinitionDataType,
  type Type,
} from "./type.js";

export type StructureFields<T extends DomainObject> = {
  [K in keyof Record<keyof T, Type>]: AlignedData;
};

interface StructureStaticMethods<T extends DomainObject> {
  /**
   * Copys the contents of the buffer. Returns a new Instance.
   * @param buffer
   */
  from(buffer: Buffer, offset?: number): Structure<T>;
  from(
    structure: Structure<BindedType<T>>,
    offset?: number,
    length?: number,
  ): Structure<T>;
  toJson(buffer: Buffer): T;
}
export interface StructureConstructor<
  T extends DomainObject = DomainObject,
> extends StructureStaticMethods<T> {
  readonly size: number;
  readonly fields: StructureFields<T>;
  readonly transform: Transformers<T>;

  new (args: T): Structure<T>;
}

export interface StructureMethods<T extends DomainObject> {
  /**
   * Copies the contents of the buffer
   * @param buffer
   */
  copy(buffer: Buffer, offset?: number): void;
  /**
   * Copies the contents of the structure buffer
   * @param buffer
   */
  copy(structure: Structure<T>, offset?: number): void;
  /**
   * Returns the buffer
   */
  data(): Buffer;
  /**
   * Sets the contents of the buffer to 0
   */
  reset(): void;
  /**
   * Returns a plain object with the content of the structure
   */
  toJson(): T;
}

export type StructureOptions<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = TR extends undefined
  ? { packed?: boolean; tranform?: undefined }
  : { packed?: boolean; transform?: TR };

export type Structure<T extends DomainObject> = T & StructureMethods<T>;

export type StructureReturn<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = StructureConstructor<ApplyTransformers<T, BindedType<T>, TR>>;
function alignUp(n: number, align: number): number {
  return (n + align - 1) & ~(align - 1);
}
function alignFields<T extends Record<string, Type>>(
  data: T,
  packed: boolean = false,
): { fields: StructureFields<T>; size: number } {
  const fields = {} as { [K in keyof T]: AlignedData };
  let offset = 0;
  let maxAlign = 1;
  const mnames = new Set();
  for (const [k, m] of Object.entries(data) as [keyof T, DataType][]) {
    const size = sizeof(m);
    if (!packed) {
      offset = alignUp(offset, size);
      maxAlign = Math.max(maxAlign, size);
    }
    fields[k] = {
      type: m,
      size,
      offset,
    };
    offset += size;
    if (mnames.has(k)) throw new Error("Duplicate name");
    mnames.add(k);
  }
  const structSize = packed ? offset : alignUp(offset, maxAlign);
  return { fields: Object.freeze(fields), size: structSize };
}

function defineProxyProperty(
  target: Record<string, any>,
  key: string,
  field: AlignedData,
  buffer: Buffer,
  transformer?: PropertyTransformer,
  offset: number = 0,
): void {
  // console.log("Define property", target, key, field);
  const isStructField = isStructureDataType(field.type);
  const isArrayField = isArrayDataType(field.type);
  Object.defineProperty(target, key, {
    get() {
      // console.log("Get", key, field, isStructField);
      if (isStructField) return target[key];
      else if (isArrayField) {
        const out = readArray(
          field as AlignedData<ArrayDataType>,
          buffer,
          offset,
        );
        return applyTransform(transformer?.output, out);
      }
      const out = read(field, buffer, offset);

      return applyTransform(transformer?.output, out);
    },
    set(v) {
      // console.log("Set", key, isStructField);
      if (isStructField)
        return writeStructure(
          field as AlignedData<StructureConstructor>,
          buffer,
          applyTransform(transformer?.input, v),
          offset,
        );
      else if (isArrayField)
        writeArray(
          field as AlignedData<ArrayDataType>,
          applyTransform(transformer?.input, v),
          buffer,
          offset,
        );
      else write(field, buffer, applyTransform(transformer?.input, v), offset);
    },
  });
}

function writeStructure(
  data: AlignedData<StructureConstructor>,
  buffer: Buffer,
  value: any,
  offset: number,
): void {
  console.log("Write structure", data, offset, value);
  for (const [k, field] of Object.entries(data.type.fields)) {
    const transformer = data.type.transform[k];
    const val = applyTransform(transformer?.input, value[k]);
    if (isStructureDataType(field.type)) {
      writeStructure(
        field as AlignedData<StructureConstructor>,
        buffer,
        val,
        offset + data.offset,
      );
    } else if (Array.isArray(field.type)) {
      writeArray(
        field as AlignedData<ArrayDataType>,
        val,
        buffer,
        offset + data.offset,
      );
    } else write(field, buffer, val, offset + data.offset);
  }
}

function writeArray(
  data: AlignedData<ArrayDataType>,
  arr: any[],
  buffer: Buffer,
  offset: number,
): void {
  // console.log("Write array", data, offset, arr);
  const [type, length] = data.type;
  const isStructure = isStructureDataType(type);
  const size = sizeof(type);
  if (arr.length !== length) throw new RangeError("Invalid array length");
  for (let i = 0; i < length; i++) {
    const value = arr[i];
    if (isStructure) {
      writeStructure(
        {
          offset: i * size,
          size: size,
          type,
        },
        buffer,
        value,
        offset + data.offset,
      );
    } else if (isArrayDataType(type)) {
      writeArray(
        {
          type: type,
          offset: i * sizeof(type),
          size: size,
        },
        value,
        buffer,
        offset + data.offset,
      );
    } else {
      write(
        {
          type,
          size: size,
          offset: i * size,
        },
        buffer,
        value,
        offset + data.offset,
      );
    }
  }
}

function readArray(
  data: AlignedData<ArrayDataType>,
  buffer: Buffer,
  offset: number = 0,
  mutable: boolean = true,
): DataValue {
  // console.log("Read array", data, offset);
  const t = [];
  const [type, length] = data.type;
  const size = sizeof(type);
  const isStructure = isStructureDataType(type);
  const isArray = isArrayDataType(type);
  for (let i = 0; i < length; i++) {
    if (isStructure) {
      t.push(
        readStructure(
          {
            type,
            offset: i * type.size,
            size: type.size,
          },
          buffer,
          offset + data.offset,
          mutable,
        ),
      );
    } else if (isArray) {
      t.push(
        readArray(
          {
            type: type,
            offset: i * size,
            size: size,
          },
          buffer,
          offset + data.offset,
          mutable,
        ),
      );
    } else {
      t.push(
        read(
          {
            offset: i * size,
            size,
            type,
          },
          buffer,
          offset + data.offset,
        ),
      );
    }
  }
  return t;
}
function readStructure<T extends DomainObject>(
  data: AlignedData<StructureConstructor>,
  buffer: Buffer,
  offset: number = 0,
  mutable: boolean = true,
): T {
  // console.log("readStructure", data, offset);
  const t: DomainObject = {};
  for (const [k, field] of Object.entries(data.type.fields)) {
    const transformer = data.type.transform[k];
    // console.log("Trasnformer", k, transformer);
    if (mutable)
      defineProxyProperty(
        t,
        k,
        field,
        buffer,
        data.type.transform[k],
        data.offset + offset,
      );
    else {
      if (isStructureDataType(field.type)) {
        t[k] = applyTransform(
          transformer?.output,
          readStructure(
            field as AlignedData<StructureConstructor>,
            buffer,
            data.offset + offset,
            mutable,
          ),
        );
      } else if (isArrayDataType(field.type)) {
        t[k] = applyTransform(
          transformer?.output,
          readArray(
            field as AlignedData<ArrayDataType>,
            buffer,
            data.offset + offset,
            mutable,
          ),
        );
      } else {
        t[k] = applyTransform(
          transformer?.output,
          read(field, buffer, data.offset + offset),
        );
      }
    }
  }
  return t as T;
}

function construct(
  target: DomainObject,
  fields: { [K: string]: AlignedData },
  transformers: Transformers<DomainObject>,
  args: { [K: string]: any },
  buffer: Buffer,
  offset: number = 0,
  writeData: boolean = true,
) {
  // console.log("Construct", target, offset);
  for (const [k, field] of Object.entries(fields)) {
    const arg = args[k];
    const transformer = transformers[k];
    const val = arg ? applyTransform(transformer?.input, arg) : arg;
    if (writeData) {
      if (isStructureDataType(field.type)) {
        target[k] = {};
        construct(
          target[k],
          field.type.fields,
          field.type.transform,
          arg ?? {},
          buffer,
          offset + field.offset,
          writeData,
        );
        continue;
      }
      if (Array.isArray(field.type)) {
        writeArray(field as AlignedData<ArrayDataType>, val, buffer, offset);
      } else {
        if (val) write(field, buffer, val, offset);
      }
    } else {
      if (isStructureDataType(field.type)) {
        target[k] = {};
        construct(
          target[k],
          field.type.fields,
          field.type.transform,
          val ?? {},
          buffer,
          offset + field.offset,
          writeData,
        );
      } else defineProxyProperty(target, k, field, buffer, transformer, offset);
    }
  }
}

export function structure<T extends DomainObject>(
  data: StructureDefinitionDataType<T>,
  opts?: StructureOptions<T, undefined>,
): StructureConstructor<BindedType<T>>;

export function structure<T extends DomainObject, TR extends Transformers<T>>(
  data: StructureDefinitionDataType<T>,
  opts?: StructureOptions<T, TR>,
): StructureReturn<T, TR>;

export function structure<T extends DomainObject>(
  data: StructureDefinitionDataType<T>,
  opts?: StructureOptions<T, Transformers<T>>,
): any {
  const transformers = (opts as any)?.transform ?? ({} as Transformers<T>);
  const { fields, size } = alignFields(
    data as Record<keyof T, DataType>,
    opts?.packed,
  );
  let writeData = true;
  const t = class implements StructureMethods<T> {
    public static readonly fields = fields;
    public static readonly transform: Transformers<T> = transformers;
    public static readonly size: number = size;
    private readonly __buff__: Buffer = alloc(size);
    public static from(
      buffer: Buffer,
      offset?: number,
    ): Structure<BindedType<T>>;
    public static from(
      structure: Structure<T>,
      offset?: number,
    ): Structure<BindedType<T>>;
    public static from(arg: any, offset: number = 0): Structure<BindedType<T>> {
      writeData = false;
      const bsize = arg instanceof Buffer ? arg.length : arg.size;
      if (size > bsize) throw new Error("Invalid buffer size");
      if (arg instanceof Buffer) {
        const inst = new this({} as any);
        arg.copy(inst.data(), 0, offset, offset + size);

        return inst as Structure<BindedType<T>>;
      } else {
        const inst = new this({} as any);
        arg.data().copy(inst.data(), 0, offset, offset + size);
        return inst as Structure<BindedType<T>>;
      }
    }
    public static toJson(buffer: Buffer): BindedType<T> {
      if (buffer.length < size) throw new Error("Invalid buffer size");
      return readStructure<T>(
        {
          type: this as StructureConstructor,
          offset: 0,
          size,
        },
        buffer,
        0,
        false,
      );
    }
    constructor(args: T) {
      construct(this, fields, transformers, args, this.__buff__, 0, writeData);
      writeData = true;
    }
    public copy(buffer: Buffer, offset?: number): void;
    public copy(structure: Structure<T>, offset?: number): void;
    public copy(target: any, offset: number = 0): void {
      if (target instanceof Buffer) {
        target.copy(this.__buff__, 0, offset, offset + size);
        return;
      } else target.data().copy(this.__buff__, 0, offset, offset + size);
    }
    public data() {
      return this.__buff__;
    }
    public reset() {
      this.__buff__.fill(0);
    }
    public toJson(): T {
      return readStructure<T>(
        {
          type: t as StructureConstructor,
          offset: 0,
          size,
        },
        this.__buff__,
        0,
        false,
      );
    }
  } as any as StructureConstructor<T>;
  return t;
}
