// Discord integration + scheduled jobs. Everything here is server-side
// only — the webhook URL lives in the `integrations` table, which has
// no RLS policies for any browser client (see sql/schema.sql section 5).
//
// Requires Node 18+ for the built-in `fetch`.

const cron = require('node-cron');

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDiscordIntegration(supabaseAdmin) {
    // ---------------------------------------------------------------
    // Delivery queue. Every message goes through here, one at a time,
    // in the order it was enqueued — never sent concurrently. Two
    // problems this fixes on its own:
    //   1. Messages arriving out of order: firing several webhook POSTs
    //      concurrently doesn't guarantee they land at Discord in the
    //      order you sent them, since network timing isn't guaranteed.
    //      A single sequential worker guarantees send order.
    //   2. Missing bills: Discord webhooks are rate-limited (roughly
    //      5 requests / 2 seconds). Several bills printed back-to-back
    //      as fire-and-forget POSTs could get 429'd and silently
    //      dropped. The queue paces sends and retries on 429 (honoring
    //      Discord's retry_after) and on transient network errors.
    // ---------------------------------------------------------------
    const queue = [];
    let draining = false;

    function enqueue(webhookUrl, payload) {
        queue.push({ webhookUrl, payload });
        drainQueue();
    }

    async function drainQueue() {
        if (draining) return;
        draining = true;
        while (queue.length > 0) {
            const job = queue.shift();
            await sendWithRetry(job.webhookUrl, job.payload);
            await sleep(700); // stay comfortably under Discord's rate limit between sends
        }
        draining = false;
    }

    async function sendWithRetry(webhookUrl, payload, attempt = 1) {
        const MAX_ATTEMPTS = 5;
        try {
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.status === 429) {
                const body = await res.json().catch(() => ({}));
                const retryAfterMs = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
                if (attempt < MAX_ATTEMPTS) {
                    console.warn(`Discord rate-limited us, retrying in ${retryAfterMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
                    await sleep(retryAfterMs);
                    return sendWithRetry(webhookUrl, payload, attempt + 1);
                }
                console.error('Discord webhook still rate-limited after max retries — message dropped.');
                return { ok: false, error: 'Discord is rate-limiting this webhook — try again shortly.' };
            }

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                if (attempt < MAX_ATTEMPTS) {
                    await sleep(1000 * attempt);
                    return sendWithRetry(webhookUrl, payload, attempt + 1);
                }
                console.error('Discord webhook failed permanently:', res.status, text);
                return { ok: false, error: `Discord responded with ${res.status}` };
            }

            return { ok: true };
        } catch (err) {
            if (attempt < MAX_ATTEMPTS) {
                await sleep(1000 * attempt);
                return sendWithRetry(webhookUrl, payload, attempt + 1);
            }
            console.error('Could not reach Discord webhook after retries:', err.message);
            return { ok: false, error: err.message };
        }
    }

    async function getConfig() {
        const { data, error } = await supabaseAdmin.from('integrations').select('*').eq('id', 1).single();
        if (error) {
            console.error('Could not load integrations config:', error.message);
            return null;
        }
        return data;
    }

    // Display name lookup — Discord messages should show what staff
    // actually see on screen ("Logged in as ..."), not the login
    // username. attendant_username on the transaction is a stable
    // fallback (works even if the staff account was later deleted,
    // since attendant_id can be null then — see migration 008).
    async function resolveDisplayName(attendantId, fallbackUsername) {
        if (attendantId) {
            const { data } = await supabaseAdmin
                .from('profiles')
                .select('display_name, username')
                .eq('id', attendantId)
                .single();
            if (data) return data.display_name || data.username;
        }
        return fallbackUsername || 'Unknown';
    }

    async function notifyBillCreated(transaction) {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_bill_created || !config?.discord_webhook_url) return;

        const attendantName = await resolveDisplayName(transaction.attendant_id, transaction.attendant_username);

        enqueue(config.discord_webhook_url, {
            embeds: [{
                title: '🧾 New Bill',
                color: 0xd97706,
                fields: [
                    { name: 'Receipt No.', value: String(transaction.receipt_no ?? '—'), inline: true },
                    { name: 'Product', value: String(transaction.product ?? '—'), inline: true },
                    { name: 'Amount', value: `₹${transaction.amount}`, inline: true },
                    { name: 'Volume', value: `${transaction.volume} L`, inline: true },
                    { name: 'Attendant', value: attendantName, inline: true },
                ],
                timestamp: new Date().toISOString(),
            }],
        });
    }

    async function buildSummaryPayload(title, sinceIso) {
        const { data: rows, error } = await supabaseAdmin
            .from('transactions')
            .select('attendant_id, attendant_username, amount')
            .gte('created_at', sinceIso);

        if (error) {
            console.error('Could not load transactions for summary:', error.message);
            return null;
        }

        // Batch-resolve display names for everyone involved, one query
        // instead of one per row.
        const attendantIds = [...new Set(rows.map((r) => r.attendant_id).filter(Boolean))];
        const nameById = {};
        if (attendantIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
                .from('profiles')
                .select('id, display_name, username')
                .in('id', attendantIds);
            for (const p of profiles || []) {
                nameById[p.id] = p.display_name || p.username;
            }
        }

        const totals = {};
        let grandTotal = 0;
        for (const row of rows) {
            const name = (row.attendant_id && nameById[row.attendant_id]) || row.attendant_username || 'Unknown';
            totals[name] = (totals[name] || 0) + Number(row.amount);
            grandTotal += Number(row.amount);
        }

        const description = Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .map(([name, amt]) => `**${name}** — ₹${amt.toFixed(2)}`)
            .join('\n') || 'No bills in this period.';

        return {
            embeds: [{
                title,
                color: 0x0b3556,
                description,
                fields: [
                    { name: 'Total Bills', value: String(rows.length), inline: true },
                    { name: 'Total Amount', value: `₹${grandTotal.toFixed(2)}`, inline: true },
                ],
                timestamp: new Date().toISOString(),
            }],
        };
    }

    async function sendWeeklySummary() {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_weekly_summary || !config?.discord_webhook_url) return;
        const since = new Date(Date.now() - ONE_WEEK_MS).toISOString();
        const payload = await buildSummaryPayload('📊 Weekly Summary (all staff)', since);
        if (payload) enqueue(config.discord_webhook_url, payload);
    }

    async function sendMonthlySummary() {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_monthly_summary || !config?.discord_webhook_url) return;
        const since = new Date(Date.now() - ONE_MONTH_MS).toISOString();
        const payload = await buildSummaryPayload('🗓️ Monthly Summary (all staff)', since);
        if (payload) enqueue(config.discord_webhook_url, payload);
    }

    async function sendTestMessage() {
        const config = await getConfig();
        if (!config?.discord_webhook_url) throw new Error('No webhook URL saved yet — enter one first.');
        // Sent directly (awaited), not through the queue — this is a
        // one-off user action that wants an immediate real result on
        // screen, not "queued, we'll see."
        const result = await sendWithRetry(config.discord_webhook_url, {
            content: '✅ FuelDesk is connected to this channel. Test message sent from Settings → Integrations.',
        });
        if (!result.ok) throw new Error(result.error || 'Could not send test message');
    }

    async function wipeOldTransactions() {
        const cutoff = new Date(Date.now() - ONE_MONTH_MS).toISOString();
        const { error, count } = await supabaseAdmin
            .from('transactions')
            .delete({ count: 'exact' })
            .lt('created_at', cutoff);
        if (error) console.error('Monthly transaction wipe failed:', error.message);
        else if (count) console.log(`Wiped ${count} transaction(s) older than 1 month.`);
    }

    // Daily wipe check at 2am, weekly summary Monday 9am, monthly summary
    // on the 1st at 9am — all server-local time. Only runs while the
    // Node process is up, like any cron job.
    function scheduleJobs() {
        cron.schedule('0 2 * * *', () => wipeOldTransactions().catch((e) => console.error('wipeOldTransactions error:', e)));
        cron.schedule('0 9 * * 1', () => sendWeeklySummary().catch((e) => console.error('sendWeeklySummary error:', e)));
        cron.schedule('0 9 1 * *', () => sendMonthlySummary().catch((e) => console.error('sendMonthlySummary error:', e)));
        console.log('Scheduled jobs: daily 1-month transaction wipe, weekly summary (Mon), monthly summary (1st).');
    }

    return { notifyBillCreated, sendWeeklySummary, sendMonthlySummary, sendTestMessage, wipeOldTransactions, scheduleJobs };
}

module.exports = { createDiscordIntegration };
