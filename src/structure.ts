import { alloc, read, write } from "./memory.js";
import { sizeof } from "./size.js";
import {
  DataType,
  isArrayDataType,
  isStructureDataType,
  type AlignedData,
  type ArrayDataType,
  type BindedType,
  type DataVale,
  type DomainObject,
  type StructureDefinitionDataType,
  type Type,
} from "./type.js";

export type StructureFields<T extends DomainObject = DomainObject> = {
  [K in keyof Record<keyof T, Type>]: AlignedData;
};
export interface StructureConstructor<T extends DomainObject = DomainObject> {
  readonly size: number;
  readonly fields: StructureFields;
  /**
   * Copys the contents of the buffer. Returns a new Instance.
   * @param buffer
   */
  from(buffer: Buffer): Structure<BindedType<T>>;
  from(buffer: Structure<BindedType<T>>): Structure<BindedType<T>>;
  toJson(buffer: Buffer): BindedType<T>;
  new (args: BindedType<T>): Structure<BindedType<T>>;
}

export interface StructureMethods<T extends DomainObject> {
  /**
   * Copies the contents of the buffer
   * @param buffer
   */
  copy(buffer: Buffer): void;
  /**
   * Copies the contents of the structure buffer
   * @param buffer
   */
  copy(structure: Structure<T>): void;
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

export type Structure<T extends DomainObject> = T & StructureMethods<T>;

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
  offset: number = 0,
): void {
  // console.log("Define property", target, key, field);
  const isStructField = isStructureDataType(field.type);
  const isArrayField = isArrayDataType(field.type);
  Object.defineProperty(target, key, {
    get() {
      // console.log("Get", key, field, isStructField);
      if (isStructField) return target[key];
      else if (isArrayField)
        return readArray(field as AlignedData<ArrayDataType>, buffer, offset);
      return read(field, buffer, offset);
    },
    set(v) {
      // console.log("Set", key, isStructField);
      if (isStructField)
        return writeStructure(
          field as AlignedData<StructureConstructor>,
          buffer,
          v,
          offset,
        );
      else if (isArrayField)
        writeArray(field as AlignedData<ArrayDataType>, v, buffer, offset);
      else write(field, buffer, v, offset);
    },
  });
}

function writeStructure(
  data: AlignedData<StructureConstructor>,
  buffer: Buffer,
  value: any,
  offset: number,
): void {
  // console.log("Write structure", data, offset, value);
  for (const [k, field] of Object.entries(data.type.fields)) {
    if (isStructureDataType(field.type)) {
      writeStructure(
        field as AlignedData<StructureConstructor>,
        buffer,
        value[k],
        offset + data.offset,
      );
    } else if (Array.isArray(field.type)) {
      writeArray(
        field as AlignedData<ArrayDataType>,
        value[k],
        buffer,
        offset + data.offset,
      );
    } else write(field, buffer, value[k], offset + data.offset);
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
): DataVale {
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
  // console.log("readStructure", offset);
  const t: DomainObject = {};
  for (const [k, field] of Object.entries(data.type.fields)) {
    if (mutable) defineProxyProperty(t, k, field, buffer, data.offset + offset);
    else {
      if (isStructureDataType(field.type)) {
        t[k] = readStructure(
          field as AlignedData<StructureConstructor>,
          buffer,
          data.offset + offset,
          mutable,
        );
        continue;
      }

      if (isArrayDataType(field.type)) {
        t[k] = readArray(
          field as AlignedData<ArrayDataType>,
          buffer,
          data.offset + offset,
          mutable,
        );
      } else t[k] = read(field, buffer, data.offset + offset);
    }
  }
  return t as T;
}

function construct(
  target: DomainObject,
  fields: { [K: string]: AlignedData },
  args: { [K: string]: any },
  buffer: Buffer,
  offset: number = 0,
  writeData: boolean = true,
) {
  // console.log("Construct", target, offset);
  for (const [k, field] of Object.entries(fields)) {
    const arg = args[k];
    if (writeData) {
      if (isStructureDataType(field.type)) {
        target[k] = {};
        construct(
          target[k],
          field.type.fields,
          arg ?? {},
          buffer,
          offset + field.offset,
        );
        continue;
      }

      if (Array.isArray(field.type)) {
        writeArray(
          field as AlignedData<ArrayDataType>,
          arg ?? [],
          buffer,
          offset,
        );
      } else {
        if (arg) write(field, buffer, arg, offset);
      }
    }
    defineProxyProperty(target, k, field, buffer, offset);
  }
}

export function structure<T extends DomainObject>(
  data: StructureDefinitionDataType<T>,
  opts?: { packed?: boolean },
): StructureConstructor<T> {
  const { fields, size } = alignFields(
    data as Record<keyof T, DataType>,
    opts?.packed,
  );
  let writeData = true;
  const t = class implements StructureMethods<T> {
    public static readonly fields = fields;
    public static readonly size: number = size;
    private readonly __buff__: Buffer = alloc(size);
    public static from(buffer: Buffer): Structure<BindedType<T>>;
    public static from(structure: Structure<T>): Structure<BindedType<T>>;
    public static from(arg: any): Structure<BindedType<T>> {
      writeData = false;
      if (arg instanceof Buffer) {
        if (arg.length !== size) throw new Error("Invalid buffer size");
        const inst = new this({} as any);
        arg.copy(inst.data());

        return inst as Structure<BindedType<T>>;
      } else {
        const inst = new this({} as any);
        arg.data().copy(inst.data());
        return inst as Structure<BindedType<T>>;
      }
    }
    public static toJson(buffer: Buffer): BindedType<T> {
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
    constructor(args: BindedType<T>) {
      construct(this, fields, args, this.__buff__, 0, writeData);
      writeData = true;
    }
    public copy(buffer: Buffer): void;
    public copy(structure: Structure<T>): void;
    public copy(target: any): void {
      if (target instanceof Buffer) {
        target.copy(this.__buff__);
        return;
      } else target.data().copy(this.__buff__);
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
