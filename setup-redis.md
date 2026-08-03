# Redis Cloud Setup (for the Discord notification queue)

FuelDesk uses Redis + BullMQ to queue Discord notifications (bill-created
messages, weekly/monthly summaries) so nothing is lost if the server
restarts mid-send. This guide walks through setting up a free Redis Cloud
database and connecting it to the app.

## 1. Create a Redis Cloud account

1. Go to https://cloud.redis.io and sign up (no credit card required for
   the free tier).
2. Verify your email if prompted.

## 2. Create a free database

1. From the dashboard, click **New Database** (or **Create Database**).
2. Choose the **Free** plan — 30 MB, shared, no cost.
3. Pick any cloud provider/region (closest to where your server runs is
   fine, but it doesn't need to match exactly).
4. Give the database a name, e.g. `fueldesk-queue`.
5. Click **Create Database**. It's usually ready within a minute.

## 3. Get the connection string

1. Click into your new database.
2. Find the **Public endpoint** — looks like:
   `redis-12345.c1.us-east-1-1.ec2.redis.io:12345`
3. Find the **Default user password** (shown on the same page, under
   Security/Access).
4. Your connection URL is:

   ```
   redis://default:<password>@<public-endpoint>
   ```

   Example:
   ```
   redis://default:ZVjJ3FiosA1W6WOBuJV8yL0ubO1dBc9S@paramount-imperishable-curtain-89786.db.redis.io:16274
   ```

   Note: use `redis://`, not `rediss://` — TLS isn't available on the free
   tier, so the plain (non-TLS) URL is correct here.

## 4. Fix the eviction policy

Free databases default to an eviction policy (`volatile-lru`) meant for
caches, where Redis can silently delete keys under memory pressure. The
queue needs **nothing** deleted except by the app itself.

1. In the Redis Cloud console, open your database → **Configuration**
   (or the pencil/edit icon).
2. Find **Eviction policy**.
3. Change it from `volatile-lru` to **`noeviction`**.
4. Save.

With `noeviction`, if the database ever actually fills up, writes fail
loudly (visible in your server logs) instead of quietly losing data —
the correct trade-off for a queue.

## 5. Add it to your `.env`

Copy `.env.example` to `.env` if you haven't already, then add:

```
REDIS_URL=redis://default:<password>@<public-endpoint>
```

using the exact URL from step 3. Keep the password out of anywhere else
(no committing `.env`, no pasting it in chats/tickets) — treat it like
any other secret, and regenerate it from the console if it's ever been
exposed.

## 6. Verify it works

Start the app:

```
npm install
node server.js
```

You should **not** see either of these in the console:

- `Redis connection error (Discord queue): ...` → wrong URL/password, or
  the database isn't reachable (check firewall/network).
- `IMPORTANT! Eviction policy is volatile-lru...` → step 4 wasn't saved
  yet, or you're pointed at a different database than you edited.

Then trigger a real bill or use **Settings → Integrations → Send test
message** and confirm it lands in your Discord channel.

## 7. (Optional) Watch the queue directly

- **RedisInsight**: on the database page in Redis Cloud, open the
  RedisInsight/Browser tab to see keys live.
- **redis-cli**:
  ```
  redis-cli -u <your REDIS_URL> DBSIZE
  redis-cli -u <your REDIS_URL> KEYS "bull:discord-notifications:*"
  ```
  Keys should appear briefly while a message is being sent and disappear
  once it succeeds — that's `removeOnComplete` doing its job.