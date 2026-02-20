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

const AckPacketStructure = structure<AckPacket>(
  {
    id: charDataType(6),
  },
  {
    packed: true,
  },
);

const PacketStructure = structure<Packet>(
  {
    header: DataType.UINT32LE,
    id: charDataType(6),
    method: charDataType(4),
    content: charDataType(64),
  },
  {
    packed: true,
  },
);

console.log(AckPacketStructure.size); // 6 (Unpacked: 10)
console.log(PacketStructure.size); // 78 (Unpacked: 128)

mqttClient.on("message", (topic, msg) => {
  const packet = PacketStructure.from(msg);

  processMessage(
    topic,
    toString(packet.id),
    toString(packet.method),
    toString(packet.content),
  ).then(() => {
    const ackMessage = new AckPacketStructure({
      id: packet.id,
    });

    mqttClient.publish("ack", ackMessage.data());
  });
});
```

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
```

4. You can create a plain object using `toJson` instance or static methods:

```ts
console.log(person2.toJson()); // { name: [ 82, 111, 115, 101 ], age: 90 }

const person3 = PersonStructure.toJson(Buffer.from("4a616b655a000000", "hex"));

console.log("Name: %s, age: %d", toString(person3.name), person3.age); // Name: Jake, age: 90
```

### Packing

When creating a `Structure`, you can provide the argument `packed` (default is `false`):

```ts
const PacketStructure = structure<Packet>(
  {
    header: DataType.UINT32LE,
    id: charDataType(6),
    content: charDataType(64),
  },
  {
    packed: true,
  },
);
```

When `packed` is `true`, no padding or alignment will be applied to the fields. This is really important especially for binary communications, improving performance and usage.

```ts
console.log(PersonStructure.size); // Unpacked: 8 bytes
console.log(PersonStructure.size); // Packed: 5 bytes
```

### Strings

NBSP does not store strings dynamically.
Strings are represented as fixed-length arrays of `UINT8`. You can use `charDataType` as a shorthand:

```ts
charDataType(6); // returns [DataType.UINT8, 6]
```

This is intentional and ensures:

- Deterministic payload size
- Protocol compatibility
- Zero dynamic allocation

### Working with hex

You can serialize/retrieve hex data:

```ts
interface User {
  id: string;
  role: number;
} // domain Person

const UserStructure = structure<User>({
  id: charDataType(4),
  role: DataType.UINT8,
});

const instance = new UserStructure({
  id: toUint8Array("1a2b4c6d", true), // Transform to hex array
  role: 2,
});
// HEX string length 8 -> HEX array length 4

console.log(instance.name); // Prints [ 26, 43, 76, 109 ]
console.log(toString(instance.name, true)); // "1a2b4c6d"
```

### Arrays

`Arrays` are defined with a `type` and a fixed `length` of items:

```ts
interface Person {
  name: string;
} // domain Person

const PersonStructure = structure<Person>({
  name: charDataType(4), // [ DataType.UINT8, 4 ]
});

const person = new PersonStructure({
  name: toUint8Array("Jake"),
});
```

This specifies that there will be `4` items in this field, each of them of type `DataType.UINT8` (strings will always be stored as arrays of `DataType.UINT8`).

### Nested Structures

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
      name: toUint8Array("Jack"),
    },
    {
      name: toUint8Array("Rose"),
    },
    {
      name: toUint8Array("Dave"),
    },
    ...
  ],
});

console.log(groupInstance.people); // Array<100> [ { name: [Getter/Setter] }, ... ]
```

> **Important**
>
> Structures must be instantiated with plain objects when are nested, `do not` use the `Structure's constructor`; doing so will make unnecessary allocations.

### Buffer and copying

You can access the `buffer` of the `instance` with `data` method:

```ts
instance.data(); // Returns the internal Buffer (no copy)
```

You can reset the `buffer` of the `instance` with `reset` method:

```ts
instance.reset(); // Resets the internal Buffer (0)
```

You can `copy` the data from other `instance` or `buffer`:

```ts
instance.copy(instanceOrBuffer);
```

You can create a `new instance` of the `Structure`, copying the data `from` other `buffer` or `instance`:

```ts
const copiedInstance = PersonStructure.from(instanceOrBuffer);
```

> **Important**
>
> Buffers must be the same size when copying.
>
> Each instance has its own buffer.

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
> Strings are still represented as numeric arrays in JSON output.

### Endianness

`DataType` difference between `LE` and `BE` types:

```ts
structure({
  property1: DataType.UINT32BE,
  property2: DataType.INT64LE,
});
```
