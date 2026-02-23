# NBSP

## NodeJS Binary Structure Payloads

This package facilitates the creation and management of fixed binary payloads in NodeJS.

## Why NBSP?

NBSP is designed for:

- Binary network protocols (MQTT, CAN, custom TCP/UDP protocols)
- Fixed-size payloads
- Embedded / low-level communication
- Interoperability with C/C++ structures

It avoids:

- JSON serialization overhead
- Dynamic allocations
- Hidden copies

### Example

```ts
interface AckPacket {
  id: string;
} // domain AckPacket

interface Packet {
  header: byte;
  id: string;
  method: string;
  content: string;
} // domain Packet

// Transformers
// Transforms string <-> number[]
const stringTransform = {
  input: [(data: string) => toBytes(data)],
  output: [(data: bytes) => toString(data)],
};

// Transforms hex string <-> hex number[]
const hexStringTransform = {
  input: [(data: string) => toBytes(data, true)],
  output: [(data: bytes) => toString(data, true)],
};

const AckPacketStruct = struct<AckPacket, Transformers<AckPacket>>(
  {
    id: charDataType(6),
  },
  {
    packed: true,
    transform: {
      id: hexStringTransform,
    },
  },
); // AckPacketStruct Constructor (class)

const PacketStruct = struct<Packet, Transformers<Packet>>(
  {
    header: DataType.UINT32LE,
    id: charDataType(6),
    method: charDataType(4),
    content: charDataType(64),
  },
  {
    packed: true,
    transform: {
      id: hexStringTransform,
      method: stringTransform,
      content: stringTransform,
    },
  },
); // PacketStruct Constructor (class)

console.log(AckPacketStruct.size); // 6 (Unpacked: 10)
console.log(PacketStruct.size); // 78 (Unpacked: 128)

mqttClient.on("message", (topic, msg) => {
  const packet = PacketStruct.from(msg);

  processMessage(topic, packet.id, packet.method, packet.content).then(() => {
    const ackMessage = AckPacketStruct.from(msg, sizeof(DataType.UINT32LE)); // Offset the 'header' property

    mqttClient.publish("ack", ackMessage.data());
  });
});
```

### Struct Constructor methods

| Method | Description                                                       | Arguments                                    | Returned type |
| ------ | ----------------------------------------------------------------- | -------------------------------------------- | ------------- |
| from   | Creates a new instance and copies the buffer content from target. | `(target: Buffer \| Struct, byte: byte = 0)` | `Struct<T>`   |
| toJson | Creates a plain object, resolving with the data of the buffer.    | `(target: Buffer, offset: byte = 0)`         | T             |

### Struct methods

| Method | Description                            | Arguments                                      | Returned type |
| ------ | -------------------------------------- | ---------------------------------------------- | ------------- |
| data   | Returns the internal buffer (no copy). |                                                | `Buffer`      |
| reset  | Zero the internal buffer content.      |                                                | `void`        |
| toJson | Returns a plain object.                |                                                | `T`           |
| copy   | Copies the buffer content from target. | `(target: Buffer \| Struct, offset: byte = 0)` | `void`        |

### Struct Options

Options argument for the `struct` function.

| Property  | Description                                                                                                                                               | Type              | Default |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| packed    | When false, fields of the `struct` are aligned or padded. This is really important especially for binary communications, improving performance and usage. | `boolean`         | `false` |
| transform | An object that contains keys from the domain object. Transforms the data obtained/retrieved from the buffer data.                                         | `Transformers<T>` | `{}`    |

## Usage

1. Create a domain interface. This will represent your data.

```ts
interface Person {
  age: byte;
  name: string;
} // domain Person
```

2. Create a Struct for your domain interface. Calling `struct` will return a new class; it is not intended to be extended.

```ts
const PersonStruct = struct<Person>({
  age: DataType.UINT8,
  name: charDataType(4), // strings are arrays of UINT8. charDataType(n) is equivalent to [DataType.UINT8, n]
});
```

3. Now, you can instantiate the struct by using `new` or the `StructConstructor`'s static method `from`. Instance exposes getters and setters to update and retrieve data directly from the fields of the struct in the buffer as well as some other methods to manage it:

```ts
const person1 = new PersonStruct({
  age: 24,
  name: toBytes("Dave"), // Transform the string to UTF-8 UINT8 array
});
console.log("Name: %s, age: %d", toString(person1.name), person1.age); // Name: Dave, age: 24

const person2 = PersonStruct.from(Buffer.from("63000000526f7365", "hex"));

console.log("Name: %s, age: %d", toString(person2.name), person2.age); // Name: Rose, age: 99

console.log(person2.data()); //  <Buffer 63 00 00 00 52 6f 73 65>

console.log(person2.toJson()); // { age: 99, name: [ 82, 111, 115, 101 ] }

const person3 = PersonStruct.toJson(Buffer.from("5a0000004a616b65", "hex"));

console.log("Name: %s, age: %d", toString(person3.name), person3.age); // Name: Jake, age: 90
```

Transformers help to transform data.
When a property has transformers, its exposed TypeScript type becomes the transformed type instead of the raw BindedType<T>.
You can have multiple transforms in input/output; each one will receive the last transformed value.

```ts
const PersonStruct = struct<Person, { name: PropertyTransform }>(
  {
    age: DataType.UINT8,
    name: charDataType(4),
  },
  {
    transform: {
      name: {
        // Executed when data is written to the buffer
        input: [(data: string) => toBytes(data)],
        // Executed when data is retrieved from the buffer
        output: [(data: bytes) => toString(data)],
      },
    },
  },
);
const person = new PersonStruct({
  age: 24,
  name: "Dave", // Input transformer
});
person.name = "Jack"; // Input transformer
console.log(person.name); // "Jack", output transformer
```

### Arrays & Nesting

`Array` types are defined with a `type` and a fixed `length` of items:

```ts
const PersonStruct = struct<Person>({
  name: [DataType.UINT8, 4], // or charDataType(4)
});
```

> Strings are represented as a fixed array of `UINT8` if no transformer was applied for that property. Use the shorthand `charDataType`.

You can nest `Structs`:

```ts
interface DeviceConfig {
  mode: byte;
  factor: byte;
} // domain DeviceConfig

interface Device {
  id: string;
  config: DeviceConfig; // Provide the domain type
} // domain Device

const DeviceConfigStruct = struct<DeviceConfig>({
  mode: DataType.UINT8,
  factor: DataType.UINT8,
});

const DeviceStruct = struct<Device>({
  id: charDataType(6),
  config: DeviceConfigStruct, // Provide the struct as type
});

const instance = new DeviceStruct({
  id: Array.from(randomBytes(6)),
  config: {
    // Create a plain object
    // DO NOT use DeviceConfigStruct constructor
    // it will cause unnecessary allocations
    mode: 4,
    factor: 8,
  },
});

console.log(instance.config.factor); // 8
```

You can also store `Structs` or `Arrays` inside of `Arrays`:

```ts
interface Group {
  people: Person[];
} // domain Group

const GroupStruct = struct<Group>({
  people: [PersonStruct, 100],
});

const groupInstance = new GroupStruct({
  people: [
    // Create a plain object
    // DO NOT use PersonStruct constructor
    // it will cause unnecessary allocations
    {
      name: "Jack",
    },
    {
      name: "Rose",
    },
    {
      name: "Dave",
    },
    ...
  ],
});

console.log(groupInstance.people); // Array<100> [ { name: [Getter/Setter] }, ... ]
```

> **Important**
>
> Structs must be instantiated with plain objects when are nested, `do not` use the `Struct's constructor`; doing so will make unnecessary allocations.

### JSON

Instances can be converted to plain JavaScript object with all the resolved properties and nested attributes of your struct using `toJson` method:

```ts
personInstance.toJson(); // { name: [ 68, 97, 118, 101 ], age: 24 }
```

You can serialize directly to a plain JavaScript object from a buffer by using the static method `toJson`:

```ts
PersonStruct.toJson(Buffer.from("4a616b655a000000", "hex")); // { name: [ 68, 97, 118, 101 ], age: 24 }
```

> **Important**
>
> Transformers will also run when serializing JSON.

> Prefer the static `toJson` method when working with raw buffers; there's no point on doing this:
>
> ```ts
> PersonStruct.toJson(personInstance.data());
> // Instead
> personInstance.toJson();
> ```

### Endianness

Data types defined in the enum `DataType` difference between `LE` and `BE` types:

```ts
structure({
  property1: DataType.UINT32BE,
  property2: DataType.INT64LE,
});
```

> **Note**
>
> You can get the `size` of data types with `sizeof`:
>
> ```ts
> console.log(sizeof(DataType.INT16LE)); // 2
> console.log(sizeof(charDataType(6))); // 6
> console.log(sizeof(Structure)); // Or Structure.size
> ```

### Floating point (FLOAT32) precision

NBSP uses IEEE-754 floating point representations for FLOAT32 and FLOAT64, exactly like C, C++, Rust, Java, etc.
This means that some decimal values cannot be represented exactly in binary.

**Why does `0.4` become `0.4000000059604645`?**

FLOAT32 is a 32-bit single-precision IEEE-754 float.

Some decimal numbers, like 0.4, cannot be represented exactly using a finite binary fraction, so the closest representable value is stored instead.

Example:

```ts
const value = 0.4;

instance.floatValue = value;
console.log(instance.floatValue); // 0.4000000059604645
```

This is not a bug in NBSP.
It is the actual value stored in memory and this behavior is universal

The same thing happens in other languages:

```cpp
float x = 0.4f;
printf("%.17f\n", x); // 0.4000000059604645
```

NBSP intentionally exposes the real binary value, without rounding or post-processing, to ensure:

- Full transparency
- Bit-exact compatibility with C/C++ structures
- Deterministic binary payloads

If you need to compare floating point values, never use strict equality:

```ts
a === b; // ❌ unsafe for floats
```

Instead, compare with a tolerance:

```ts
Math.abs(a - b) < 1e-6; // ✅ safe
```

Or, when possible:

- Use integers (scaled values, fixed-point)
- Use FLOAT64 if higher precision is required.
