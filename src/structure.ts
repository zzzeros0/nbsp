import { alloc, read, write, sizeof } from "./memory.js";
import type { PropertyTransformer, Transformers } from "./transformer.js";
import { applyTransform, type ApplyTransformers } from "./transformer.js";
import {
  DataType,
  isArrayDataType,
  isStructDataType,
  type AlignedData,
  type ArrayDataType,
  type BindedType,
  type byte,
  type DataValue,
  type DomainObject,
  type StructDefinitionDataType,
  type Type,
} from "./type.js";

export type StructFields<T extends DomainObject> = {
  [K in keyof Record<keyof T, Type>]: AlignedData;
};

type InferedStruct<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = TR extends undefined ? Struct<BindedType<T>, TR> : Struct<T, TR>;
type InferedDomainObject<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = TR extends undefined ? BindedType<T> : T;

interface StructStaticMethods<
  T extends DomainObject,
  TR extends Transformers<T> | undefined = undefined,
> {
  /**
   * Copys the contents of the buffer. Returns a new Instance.
   * @param buffer
   */
  from(buffer: Buffer, offset?: byte): InferedStruct<T, TR>;
  /**
   * Copys the contents of the instance's buffer. Returns a new instance.
   * @param buffer
   */
  from(
    struct: InferedStruct<T, TR>,
    offset?: byte,
    length?: byte,
  ): InferedStruct<T, TR>;
  /**
   * Serializes the buffer directly to a plain object
   * @param buffer
   */
  toJson(buffer: Buffer): InferedDomainObject<T, TR>;

  partial(args?: Partial<T>): InferedStruct<T, TR>;
}
export interface StructConstructor<
  T extends DomainObject = DomainObject,
  TR extends Transformers<T> | undefined = undefined,
> extends StructStaticMethods<T, TR> {
  /**
   * The size of the struct
   */
  readonly size: byte;
  /**
   * The fields of the struct
   */
  readonly fields: StructFields<T>;
  /**
   * The transformers
   */
  readonly transform: Transformers<T>;

  new (args: T): Struct<T, TR>;
}

export interface StructMethods<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> {
  /**
   * Returns the buffer
   */
  data(): Buffer;
  /**
   * Copies the content of buffer
   * @param buffer
   * @param offset
   * @param size Defaults to struct.size
   */
  copy(buffer: Buffer, offset?: byte, size?: byte): void;
  /**
   * Copies the content of struct's buffer
   * @param buffer
   * @param offset
   * @param size Defaults to struct.size
   */
  copy(struct: InferedStruct<T, TR>, offset?: byte, size?: byte): void;

  /**
   * Sets the contents of the buffer to 0
   */
  reset(): void;
  /**
   * Returns a plain object with the content of the struct
   */
  toJson(): InferedDomainObject<T, TR>;
}

export type StructOptions<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = TR extends undefined
  ? { packed?: boolean }
  : { packed?: boolean; transform?: TR };

export type Struct<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = T & StructMethods<T, TR>;

export type StructReturn<
  T extends DomainObject,
  TR extends Transformers<T> | undefined,
> = StructConstructor<ApplyTransformers<T, BindedType<T>, TR>>;
function alignUp(n: byte, align: byte): byte {
  return (n + align - 1) & ~(align - 1);
}
function alignFields<T extends Record<string, Type>>(
  data: T,
  packed: boolean = false,
): { fields: StructFields<T>; size: byte } {
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
  offset: byte = 0,
): void {
  const isStructField = isStructDataType(field.type);
  const isArrayField = isArrayDataType(field.type);
  Object.defineProperty(target, key, {
    get() {
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
      if (isStructField)
        return writeStruct(
          field as AlignedData<StructConstructor>,
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

function writeStruct(
  data: AlignedData<StructConstructor>,
  buffer: Buffer,
  value: any,
  offset: byte,
): void {
  for (const [k, field] of Object.entries(data.type.fields)) {
    const transformer = data.type.transform[k];
    const val = applyTransform(transformer?.input, value[k]);
    if (isStructDataType(field.type)) {
      writeStruct(
        field as AlignedData<StructConstructor>,
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
  offset: byte,
): void {
  const [type, length] = data.type;
  const isStruct = isStructDataType(type);
  const size = sizeof(type);
  if (arr.length !== length) throw new RangeError("Invalid array length");
  for (let i = 0; i < length; i++) {
    const value = arr[i];
    if (isStruct) {
      writeStruct(
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
  offset: byte = 0,
  mutable: boolean = true,
): DataValue {
  const t = [];
  const [type, length] = data.type;
  const size = sizeof(type);
  const isStruct = isStructDataType(type);
  const isArray = isArrayDataType(type);
  for (let i = 0; i < length; i++) {
    if (isStruct) {
      t.push(
        readStruct(
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
function readStruct<T extends DomainObject>(
  data: AlignedData<StructConstructor<T>>,
  buffer: Buffer,
  offset: byte = 0,
  mutable: boolean = true,
): T {
  const t: DomainObject = {};
  for (const [k, field] of Object.entries(data.type.fields)) {
    const transformer = data.type.transform[k];
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
      if (isStructDataType(field.type)) {
        t[k] = applyTransform(
          transformer?.output,
          readStruct(
            field as AlignedData<StructConstructor>,
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
  offset: byte = 0,
  writeData: boolean = true,
) {
  for (const [k, field] of Object.entries(fields)) {
    const arg = args[k];
    const transformer = transformers[k];
    const val = arg ? applyTransform(transformer?.input, arg) : arg;
    if (writeData) {
      if (isStructDataType(field.type)) {
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

      if (val)
        if (Array.isArray(field.type)) {
          writeArray(field as AlignedData<ArrayDataType>, val, buffer, offset);
        } else {
          write(field, buffer, val, offset);
        }
    }
    if (isStructDataType(field.type)) {
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

export function struct<T extends DomainObject>(
  data: StructDefinitionDataType<T>,
  opts?: StructOptions<T, undefined>,
): StructConstructor<BindedType<T>>;

export function struct<T extends DomainObject, TR extends Transformers<T>>(
  data: StructDefinitionDataType<T>,
  opts?: StructOptions<T, TR>,
): StructReturn<T, TR>;

export function struct<
  T extends DomainObject,
  TR extends Transformers<T> | undefined = undefined,
>(data: StructDefinitionDataType<T>, opts?: StructOptions<T, TR>): any {
  const transformers = (opts as any)?.transform ?? ({} as Transformers<T>);
  const { fields, size } = alignFields(
    data as Record<keyof T, DataType>,
    opts?.packed,
  );
  let writeData = true;
  const t = class implements StructMethods<T, TR> {
    public static readonly fields = fields;
    public static readonly transform: Transformers<T> = transformers;
    public static readonly size: byte = size;
    private readonly __buff__: Buffer = alloc(size);
    public static from(buffer: Buffer, offset?: byte): InferedStruct<T, TR>;
    public static from(
      struct: InferedStruct<T, TR>,
      offset?: byte,
    ): InferedStruct<T, TR>;
    public static from(arg: any, offset: byte = 0): InferedStruct<T, TR> {
      writeData = false;

      const source: Buffer = arg instanceof Buffer ? arg : arg.data();
      const length = source.length;
      if (size > length) throw new Error("Invalid buffer size");
      const inst = new this({} as T);

      source.copy(inst.data(), offset, 0, size);
      return inst as unknown as InferedStruct<T, TR>;
    }
    public static toJson(buffer: Buffer): InferedDomainObject<T, TR> {
      if (buffer.length < size) throw new Error("Invalid buffer size");
      return readStruct<T>(
        {
          type: t as StructConstructor<T, undefined>,
          offset: 0,
          size,
        },
        buffer,
        0,
        false,
      );
    }
    public static partial(args?: Partial<T>): InferedStruct<T, TR> {
      writeData = true;
      const targs = args ?? {};
      return new this(targs as T) as any;
    }
    constructor(args: T) {
      construct(this, fields, transformers, args, this.__buff__, 0, writeData);
      writeData = true;
    }
    public copy(buffer: Buffer, offset?: byte, size?: byte): void;
    public copy(struct: InferedStruct<T, TR>, offset?: byte, size?: byte): void;
    public copy(target: any, offset: byte = 0, s: byte = 0): void {
      const source: Buffer = target instanceof Buffer ? target : target.data();
      const length = source.length;
      if (s > length) throw new Error("Invalid buffer size");
      const _size = s || length;
      source.copy(this.__buff__, offset, 0, _size);
    }
    public data() {
      return this.__buff__;
    }
    public reset() {
      this.__buff__.fill(0);
    }
    public toJson(): InferedDomainObject<T, TR> {
      return readStruct<T>(
        {
          type: t as StructConstructor<any, any>,
          offset: 0,
          size,
        },
        this.__buff__,
        0,
        false,
      );
    }
  } as any as StructConstructor<T>;
  return t;
}
