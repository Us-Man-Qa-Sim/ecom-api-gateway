# P0-2 — Database Schemas

> Reference for all service schemas. Prisma SDL for Postgres services; Mongoose `@Schema` class descriptions for MongoDB services.
---

## 1. user-service (Postgres / Prisma)

> Prisma 7 removed `url` from the `datasource` block. `DATABASE_URL` is passed to
> `prisma migrate` via `prisma.config.ts` and to `PrismaClient` at runtime via
> `@prisma/adapter-pg` (see USR-1). Everything else below is unchanged.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  CUSTOMER
  ADMIN
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String   @map("password_hash")
  firstName    String   @map("first_name")
  lastName     String   @map("last_name")
  role         Role     @default(CUSTOMER)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  addresses     Address[]
  refreshTokens RefreshToken[]

  @@map("users")
}

model Address {
  id         String  @id @default(uuid()) @db.Uuid
  userId     String  @map("user_id") @db.Uuid
  label      String? // "Home", "Work", etc.
  street     String
  city       String
  state      String?
  postalCode String  @map("postal_code")
  country    String  @db.Char(2) // ISO 3166-1 alpha-2
  isDefault  Boolean @default(false) @map("is_default")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("addresses")
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash")
  family    String    @db.Uuid // rotation family for reuse detection
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([family])
  @@map("refresh_tokens")
}

model Outbox {
  id            String    @id @default(uuid()) @db.Uuid
  aggregateType String    @map("aggregate_type")
  aggregateId   String    @map("aggregate_id")
  eventType     String    @map("event_type")
  payload       Json
  createdAt     DateTime  @default(now()) @map("created_at")
  sentAt        DateTime? @map("sent_at")

  @@index([sentAt], where: { sentAt: null }) // partial index for relay: poll unsent only
  @@map("outbox")
}
```

### Notes — user-service

- **RefreshToken.family**: all tokens descended from one login share the same `family` UUID. On rotation, the old token is revoked. If a revoked token is presented again (reuse detection), revoke the entire family.
- **Outbox relay**: poll with `SELECT ... WHERE sent_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT N`, publish to Kafka, then `UPDATE ... SET sent_at = now()`. The partial index on `sent_at IS NULL` keeps the relay fast once most rows are sent.
- **Address.isDefault**: at most one per user; enforce in application logic (set `isDefault = false` on siblings in the same transaction).

---

## 2. order-service (Postgres / Prisma)

> Same Prisma 7 note as §1: `url` moves to `prisma.config.ts`; runtime uses `@prisma/adapter-pg`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum OrderStatus {
  PENDING
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

model Order {
  id              String      @id @default(uuid()) @db.Uuid
  userId          String      @map("user_id")       // not FK — cross-service
  status          OrderStatus @default(PENDING)
  totalMinor      Int         @map("total_minor")    // cents
  currency        String      @db.Char(3)            // ISO 4217
  shippingAddress Json        @map("shipping_address") // snapshot of address at order time
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  items         OrderItem[]
  statusHistory OrderStatusHistory[]

  @@index([userId])
  @@index([status])
  @@map("orders")
}

model OrderItem {
  id             String @id @default(uuid()) @db.Uuid
  orderId        String @map("order_id") @db.Uuid
  productId      String @map("product_id")          // not FK — cross-service
  productName    String @map("product_name")         // snapshot
  unitPriceMinor Int    @map("unit_price_minor")     // snapshot, cents
  quantity       Int

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@map("order_items")
}

model OrderStatusHistory {
  id         String       @id @default(uuid()) @db.Uuid
  orderId    String       @map("order_id") @db.Uuid
  fromStatus OrderStatus? @map("from_status")        // null on initial creation
  toStatus   OrderStatus  @map("to_status")
  reason     String?
  changedAt  DateTime     @default(now()) @map("changed_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@map("order_status_history")
}

model Outbox {
  id            String    @id @default(uuid()) @db.Uuid
  aggregateType String    @map("aggregate_type")
  aggregateId   String    @map("aggregate_id")
  eventType     String    @map("event_type")
  payload       Json
  createdAt     DateTime  @default(now()) @map("created_at")
  sentAt        DateTime? @map("sent_at")

  @@index([sentAt], where: { sentAt: null })
  @@map("outbox")
}

model ProcessedEvent {
  id          String   @id @default(uuid()) @db.Uuid
  eventId     String   @unique @map("event_id")     // from Kafka envelope
  eventType   String   @map("event_type")
  processedAt DateTime @default(now()) @map("processed_at")

  @@map("processed_events")
}
```

### Notes — order-service

- **Order.userId / OrderItem.productId**: plain strings, not foreign keys. These reference entities in other services; the order stores snapshots (`productName`, `unitPriceMinor`, `shippingAddress`) to be self-contained.
- **shippingAddress JSON shape**: `{ street, city, state?, postalCode, country }` — same fields as `Address` in user-service, minus `id`/`userId`/`label`/`isDefault`/timestamps.
- **OrderStatusHistory**: one row per transition. `fromStatus = null` marks the initial creation to PENDING.
- **ProcessedEvent** (inbox): before processing a Kafka event, insert `eventId` here inside the same transaction. The unique constraint rejects duplicates, making consumption idempotent.
- **State machine transitions** (enforced in application code):
  - `PENDING → CONFIRMED` (stock-reserved event)
  - `PENDING → CANCELLED` (stock-reservation-failed, or user cancel)
  - `CONFIRMED → SHIPPED` (admin)
  - `CONFIRMED → CANCELLED` (user/admin cancel)
  - `SHIPPED → DELIVERED` (admin)

---

## 3. product-service (MongoDB / Mongoose)

### Product

```typescript
@Schema({ timestamps: true, collection: 'products' })
export class Product {
  // _id: ObjectId (auto)

  @Prop({ required: true })
  name: string;                    // text index

  @Prop({ default: '' })
  description: string;             // text index

  @Prop({ required: true, index: true })
  category: string;

  @Prop({ required: true, min: 0 })
  priceMinor: number;              // cents

  @Prop({ required: true, default: 'USD' })
  currency: string;                // ISO 4217

  @Prop({
    type: {
      available: { type: Number, required: true, min: 0, default: 0 },
      reserved:  { type: Number, required: true, min: 0, default: 0 },
    },
    required: true,
    _id: false,
  })
  stock: { available: number; reserved: number };

  @Prop({ type: Map, of: Schema.Types.Mixed, default: {} })
  attributes: Map<string, any>;    // flexible key-value (color, size, etc.)

  @Prop({ type: [String], default: [] })
  images: string[];                // URLs only (D9)

  @Prop({ default: true, index: true })
  isActive: boolean;

  // createdAt, updatedAt — from timestamps: true
}

// Indexes (declared via @Schema or SchemaFactory, syncIndexes on startup):
//   { name: 'text', description: 'text' }   — full-text search
//   { category: 1 }                         — filter by category
//   { isActive: 1 }                         — filter active products
```

### StockReservation

```typescript
@Schema({ timestamps: true, collection: 'stock_reservations' })
export class StockReservation {
  @Prop({ required: true, unique: true, index: true })
  orderId: string;                               // one reservation per order

  @Prop({
    type: [{
      productId: { type: Schema.Types.ObjectId, required: true },
      quantity:  { type: Number, required: true, min: 1 },
    }],
    required: true,
    _id: false,
  })
  items: Array<{ productId: Types.ObjectId; quantity: number }>;

  @Prop({
    required: true,
    enum: ['ACTIVE', 'RELEASED', 'CONSUMED'],
    default: 'ACTIVE',
    index: true,
  })
  status: string;

  // createdAt, updatedAt — from timestamps: true
}
```

### ProcessedEvent (inbox)

```typescript
@Schema({ collection: 'processed_events' })
export class ProcessedEvent {
  @Prop({ required: true, unique: true })
  eventId: string;                // from Kafka envelope; unique index = idempotency guard

  @Prop({ required: true })
  eventType: string;

  @Prop({ default: () => new Date() })
  processedAt: Date;
}
```

### Outbox

```typescript
@Schema({ collection: 'outbox' })
export class Outbox {
  @Prop({ required: true })
  aggregateType: string;           // "Product", "StockReservation"

  @Prop({ required: true })
  aggregateId: string;

  @Prop({ required: true })
  eventType: string;               // e.g. "order.stock-reserved"

  @Prop({ type: Schema.Types.Mixed, required: true })
  payload: Record<string, any>;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: null })
  sentAt: Date | null;             // null until relay publishes to Kafka

  @Prop({ default: null })
  claimedUntil: Date | null;       // relay lease; expired lease = re-claimable
}

// Index: { sentAt: 1 } — relay queries: { sentAt: null }
// Relay (KFK-3, v1.28): claim with a lease, publish, THEN stamp sentAt:
//   findOneAndUpdate({ sentAt: null, $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }] },
//                    { $set: { claimedUntil: now + ttl } }, { sort: { createdAt: 1 } })
//   publish → updateOne({ _id }, { $set: { sentAt: new Date(), claimedUntil: null } })
//   publish fails → updateOne({ _id }, { $set: { claimedUntil: null } })
// Never stamp sentAt before publishing — a crash in between would drop the event.
```

### Notes — product-service

- **Stock reservation is atomic**: `updateOne({ _id, "stock.available": { $gte: qty } }, { $inc: { "stock.available": -qty, "stock.reserved": qty } })` — if `modifiedCount === 0`, the item has insufficient stock.
- **All-or-nothing for multi-item orders**: wrap the inbox check, all reserve operations, `StockReservation` insert, and outbox insert in a single Mongoose session transaction (`connection.startSession()` + `session.withTransaction()`). If any item fails, the transaction aborts and `stock-reservation-failed` is emitted.
- **autoIndex: false** in production; call `syncIndexes()` on startup or via a migration script.
- **Text index** on `name` + `description` supports the product search/list endpoint.

---

## 4. notification-service (MongoDB / Mongoose)

### Notification

```typescript
@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, unique: true })
  eventId: string;                 // unique index doubles as inbox (NTF-6)

  @Prop({ default: null })
  orderId: string | null;          // null for user.registered

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({
    required: true,
    enum: ['WELCOME', 'ORDER_CONFIRMED', 'ORDER_CANCELLED', 'ORDER_SHIPPED', 'ORDER_DELIVERED'],
  })
  type: string;

  @Prop({ required: true, enum: ['EMAIL'], default: 'EMAIL' })
  channel: string;

  @Prop({
    required: true,
    enum: ['PENDING', 'SENT', 'FAILED'],
    default: 'PENDING',
    index: true,
  })
  status: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: null })
  lastError: string | null;

  @Prop({ default: null })
  sentAt: Date | null;

  @Prop({ default: null })
  reason: string | null;           // ORDER_CANCELLED only — kept so a retry can re-render it

  // createdAt, updatedAt — from timestamps: true
}

// Indexes:
//   { eventId: 1 }                          — unique, idempotency
//   { userId: 1 }                           — lookup by user
//   { status: 1, attempts: 1, updatedAt: 1 } — retry job (FAILED + stale PENDING)
```

### Notes — notification-service

- **No separate ProcessedEvent/Outbox**: this service is a Kafka **consumer only** (no outgoing events). The `eventId` unique index on `Notification` itself serves as the inbox — inserting a duplicate `eventId` throws, which the consumer catches to skip already-processed events.
- **Retry job**: a scheduled task queries `{ attempts: { $lt: MAX_ATTEMPTS }, $or: [{ status: 'FAILED' }, { status: 'PENDING', updatedAt: { $lt: now - STALE } }] }`. Stale PENDING rows were abandoned by a crash between insert and send; a redelivered event would hit the unique index and skip them, so only this job can recover them. Each row is claimed with `findOneAndUpdate({ _id, status, updatedAt }, { status: 'PENDING', updatedAt: now })` (compare-and-set) so concurrent ticks/instances never double-send. The job then re-attempts the send, increments `attempts`, and sets `status` to `SENT` or `FAILED` with `lastError` updated.
- **Indexes in production**: `autoIndex` is off in production, so the Docker entrypoint runs `syncIndexes()` (`dist/scripts/sync-indexes.js`) before boot. Without it the unique `eventId` index — the inbox — would not exist.

---

## 5. Shared patterns

### Transactional outbox (Postgres services)

```
BEGIN;
  INSERT INTO orders (...) VALUES (...);            -- domain write
  INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('Order', $orderId, 'order.created', $jsonPayload);
COMMIT;
```

The outbox relay runs on a timer (e.g. every 1 s):

```sql
SELECT * FROM outbox
WHERE sent_at IS NULL
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

Publish each row to Kafka, then `UPDATE outbox SET sent_at = now() WHERE id IN (...)`.

`SKIP LOCKED` makes this safe with multiple service instances (order-service scaled to 2 in LB-5).

### Transactional outbox (MongoDB services)

Same pattern but using Mongoose sessions:

```typescript
const session = await this.connection.startSession();
await session.withTransaction(async () => {
  // domain write(s)
  await this.outboxModel.create([{ ... }], { session });
});
```

Relay: claim one doc with a lease (`$set: { claimedUntil: now + ttl }` where `sentAt` is null and no live lease exists), publish, then stamp `sentAt`. On failure, clear the lease. If the relay crashes mid-publish, the lease expires and the row is re-published (at-least-once; consumers dedupe on `eventId`). See the product-service `Outbox` schema above.

### Transactional inbox (both)

Before processing a Kafka event:

1. Inside the same transaction, insert into `processed_events` (Postgres) or the relevant collection (Mongo) with the event's `eventId`.
2. If the insert fails with a unique constraint violation, the event was already processed — skip it and commit the offset.
3. Otherwise, proceed with the domain logic in the same transaction.

### Kafka event envelope

Every Kafka message value follows this shape (defined in `contracts` repo):

```typescript
{
  eventId: string;        // UUID, generated by producer
  eventType: string;      // e.g. "order.created"
  version: number;        // schema version, starts at 1
  occurredAt: string;     // ISO 8601 timestamp
  correlationId: string;  // propagated from the originating HTTP request
  payload: { ... };       // event-specific data
}
```

Kafka message **key** = `orderId` (string) for all order-related topics, ensuring per-order ordering within a partition.

### Shipping address snapshot shape

Stored as JSON in `Order.shippingAddress` and in event payloads:

```typescript
{
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;        // ISO 3166-1 alpha-2
}
```
