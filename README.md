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
  header: number;
  id: string;
  method: string;
  content: string;
} // domain Packet

// Transformers

// Transforms string <-> number[]
const stringTransform = {
  input: [(data: string) => toUint8Array(data)],
  output: [(data: bytes) => toString(data)],
};

// Transforms hex string <-> hex number[]
const hexStringTransform = {
  input: [(data: string) => toUint8Array(data, true)],
  output: [(data: bytes) => toString(data, true)],
};

const AckPacketStructure = structure<AckPacket, Transformers<AckPacket>>(
  {
    id: charDataType(6),
  },
  {
    packed: true,
    transform: {
      id: hexStringTransform,
    },
  },
); // AckPacketStructure Constructor (class)

const PacketStructure = structure<Packet, Transformers<Packet>>(
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
); // PacketStructure Constructor (class)

console.log(AckPacketStructure.size); // 6 (Unpacked: 10)
console.log(PacketStructure.size); // 78 (Unpacked: 128)

mqttClient.on("message", (topic, msg) => {
  const packet = PacketStructure.from(msg);

  processMessage(topic, packet.id, packet.method, packet.content).then(() => {
    const ackMessage = AckPacketStructure.from(msg, sizeof(DataType.UINT32LE)); // Offset the 'header' property

    mqttClient.publish("ack", ackMessage.data());
  });
});
```

### Structure Constructor methods

| Method | Description                                                       | Arguments                                          | Returned type  |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------- | -------------- |
| from   | Creates a new instance and copies the buffer content from target. | `(target: Structure \| Buffer,offset: number = 0)` | `Structure<T>` |
| toJson | Creates a plain object, resolving with the data of the buffer.    |                                                    | T              |

### Structure methods

| Method | Description                            | Arguments                                           | Returned type |
| ------ | -------------------------------------- | --------------------------------------------------- | ------------- |
| data   | Returns the internal buffer (no copy). |                                                     | `boolean`     |
| reset  | Zero the internal buffer content.      |                                                     | `void`        |
| toJson | Returns a plain object.                |                                                     | `T`           |
| copy   | Copies the buffer content from target. | `(target: Buffer \| Structure, offset: number = 0)` | `void`        |

### Structure Options

Second argument in `structure` function.

| Property  | Description                                                                                                                                                | Type              | Default |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| packed    | When false, fields of the structure are aligned or padded. This is really important especially for binary communications, improving performance and usage. | `boolean`         | `false` |
| transform | An object that contains keys from the domain object. Transforms the data obtained from the buffer data.                                                    | `Transformers<T>` | `{}`    |

## Usage

1. Create a domain interface.

- This will represent your data.

```ts
interface Person {
  age: number;
  name: string;
} // domain Person
```

2. Create a Structure for your domain interface. Calling `structure` will return a new class; it is not intended to be extended.

```ts
const PersonStructure = structure<Person>({
  age: DataType.UINT8,
  name: charDataType(4), // strings are arrays of UINT8. charDataType(n) is equivalent to [DataType.UINT8, n]
});
```

3. Now, you can instantiate the structure by using `new` or the `StructureConstructor`'s static method `from`. Instance exposes getters and setters to update and retrieve data directly from the fields of the structure in the buffer as well as some other methods to manage it:

```ts
const person1 = new PersonStructure({
  age: 24,
  name: toUint8Array("Dave"), // Transform the string to UTF-8 UINT8 array
});
console.log("Name: %s, age: %d", toString(person1.name), person1.age); // Name: Dave, age: 24

const person2 = PersonStructure.from(Buffer.from("526f73655a000000", "hex"));

console.log("Name: %s, age: %d", toString(person2.name), person2.age); // Name: Rose, age: 90

console.log(person2.data()); //  <Buffer 52 6f 73 65 5a 00 00 00>

console.log(person2.toJson()); // { name: [ 82, 111, 115, 101 ], age: 90 }

const person3 = PersonStructure.toJson(Buffer.from("4a616b655a000000", "hex"));

console.log("Name: %s, age: %d", toString(person3.name), person3.age); // Name: Jake, age: 90

// Transformers help to transform data.
// When a property has transformers, its exposed TypeScript type becomes the transformed type instead of the raw BindedType<T>.
// You can have multiple transforms in input/output; each one will receive the last transformed value.

const PersonStructure = structure<Person, { name: PropertyTransform }>(
  {
    age: DataType.UINT8,
    name: charDataType(4),
  },
  {
    transform: {
      name: {
        // Executed when data is written to the buffer
        input: [(data: string) => toUint8Array(data)],
        // Executed when data is retrieved from the buffer
        output: [(data: bytes) => toString(data)],
      },
    },
  },
);
const person = new PersonStructure({
  age: 24,
  name: "Dave", // Input transformer
});
person.name = "Jack"; // Input transformer
console.log(person.name); // "Jack", output transformer
```

### Arrays & Nesting

`Arrays` are defined with a `type` and a fixed `length` of items:

```ts
const PersonStructure = structure<Person>({
  name: [DataType.UINT8, 4], // or charDataType(4)
});
```

> Strings are represented as a fixed array of `UINT8` if no transformer was applied for that property.

You can nest `Structures`:

```ts
interface DeviceConfig {
  mode: number;
  factor: number;
} // domain DeviceConfig

interface Device {
  id: string;
  config: DeviceConfig; // Provide the domain type
} // domain Device

const DeviceConfigStructure = structure<DeviceConfig>({
  mode: DataType.UINT8,
  factor: DataType.UINT8,
});

const DeviceStructure = structure<Device>({
  id: charDataType(6),
  config: DeviceConfigStructure, // Provide the structure as type
});

const instance = new DeviceStructure({
  id: Array.from(randomBytes(6)),
  config: {
    // Create a plain object
    // DO NOT use DeviceConfigStructure constructor
    // it will cause unnecessary allocations
    mode: 4,
    factor: 8,
  },
});

console.log(instance.config.factor); // Prints '8'
```

You can also store `Structures` or `Arrays` inside of `Arrays`:

```ts
interface Group {
  people: Person[];
} // domain Group

const GroupStructure = structure<Group>({
  people: [PersonStructure, 100],
});

const groupInstance = new GroupStructure({
  people: [
    // Create a plain object
    // DO NOT use PersonStructure constructor
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
> Structures must be instantiated with plain objects when are nested, `do not` use the `Structure's constructor`; doing so will make unnecessary allocations.

### JSON

Instances can be converted to plain JavaScript object with all the resolved properties and nested attributes of your structure using `toJson` method:

```ts
personInstance.toJson(); // { name: [ 68, 97, 118, 101 ], age: 24 }
```

You can serialize directly to a plain JavaScript object from a buffer by using the static method `toJson`:

```ts
PersonStructure.toJson(Buffer.from("4a616b655a000000", "hex")); // { name: [ 68, 97, 118, 101 ], age: 24 }
```

> **Important**
>
> Transformers will also run when serializing JSON.

> Prefer the static `toJson` when working with raw buffers; there's no point on doing this:
>
> ```ts
> PersonStructure.toJson(personInstance.data());
> ```

### Endianness

Data types defined in the enum `DataType` difference between `LE` and `BE` types:

```ts
structure({
  property1: DataType.UINT32BE,
  property2: DataType.INT64LE,
});
```

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

a === b // ❌ unsafe for floats

Instead, compare with a tolerance:

```ts
Math.abs(a - b) < 1e-6; // ✅ safe
```

Or, when possible:

- Use integers (scaled values, fixed-point)
- Use FLOAT64 if higher precision is required.
