// Discord integration + scheduled jobs. Everything here is server-side
// only — the webhook URL lives in the `integrations` table, which has
// no RLS policies for any browser client (see sql/schema.sql section 5).
//
// Requires Node 18+ for the built-in `fetch`.

const cron = require('node-cron');

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata, fixed, no DST

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Per-fuel look for the "New Bill" embed — distinct emoji + sidebar
// color so a scrolling Discord channel is scannable at a glance.
const PRODUCT_META = {
    MS: { label: 'Petrol (MS)', emoji: '⛽', color: 0x16a34a },
    HSD: { label: 'Diesel (HSD)', emoji: '🛢️', color: 0x2563eb },
    PREMIUM: { label: 'Premium', emoji: '✨', color: 0xca8a04 },
};
function productMeta(product) {
    return PRODUCT_META[product] || { label: product || 'Fuel', emoji: '⛽', color: 0xd97706 };
}

// bill_time is stored as "HH:MM" (24h, the station device's local
// clock — that's IST for a station physically in India). Discord's
// own embed timestamp auto-converts to each viewer's own timezone,
// which is exactly what we DON'T want for a "what time was this
// printed" field, so we render it explicitly instead.
function to12Hour(hhmm) {
    if (!hhmm || !hhmm.includes(':')) return hhmm || '—';
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Start of "today" as an ISO instant, computed against IST regardless
// of what timezone the server process itself runs in.
function startOfTodayIST() {
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const istMidnightUtcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS;
    return new Date(istMidnightUtcMs).toISOString();
}

// Start of the current ISO week (Monday) at 00:00 IST — this is the
// value the "weekly reset" pointer should hold, not the exact instant
// the summary happened to be sent.
function startOfWeekIST(date = new Date()) {
    const istNow = new Date(date.getTime() + IST_OFFSET_MS);
    const dow = istNow.getUTCDay(); // Sun=0 ... Sat=6 (IST wall-clock day)
    const daysSinceMonday = (dow + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
    const istMondayUtcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysSinceMonday);
    return new Date(istMondayUtcMs - IST_OFFSET_MS).toISOString();
}

// Start of the current calendar month, 1st at 00:00 IST — same idea
// for the "monthly reset" pointer.
function startOfMonthIST(date = new Date()) {
    const istNow = new Date(date.getTime() + IST_OFFSET_MS);
    const istFirstUtcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
    return new Date(istFirstUtcMs - IST_OFFSET_MS).toISOString();
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
        const { label, emoji, color } = productMeta(transaction.product);
        const printedAt = `${transaction.bill_date ?? '—'} · ${to12Hour(transaction.bill_time)} IST`;

        const fields = [
            { name: '💰 Amount', value: `₹${Number(transaction.amount).toFixed(2)}`, inline: true },
            { name: '🧪 Volume', value: `${transaction.volume} L`, inline: true },
            { name: '💲 Rate', value: `₹${transaction.rate}/L`, inline: true },
            { name: '👤 Attendant', value: attendantName, inline: true },
            { name: '🚘 Vehicle No.', value: transaction.vehicle_no || '—', inline: true },
        ];
        if (transaction.mobile_no) {
            fields.push({ name: '📱 Mobile', value: transaction.mobile_no, inline: true });
        }
        fields.push({
            name: '🕒 Printed At (IST)',
            value: transaction.is_backdated ? `${printedAt}\n⚠️ *Backdated entry*` : printedAt,
            inline: false,
        });

        enqueue(config.discord_webhook_url, {
            embeds: [{
                author: { name: 'FuelDesk · New Bill' },
                title: `${emoji}  ${label}`,
                description: `Receipt **#${transaction.receipt_no ?? '—'}**`,
                color,
                fields,
                footer: { text: 'FuelDesk' },
                timestamp: new Date().toISOString(),
            }],
        });
    }

    // Super Admins can technically print a bill too (any active login
    // can), but "all staff" summaries should only reflect ADMIN_STAFF
    // and STATION_STAFF activity. Fetching the (small) set of Super
    // Admin ids and excluding just those, rather than requiring an
    // explicit allow-list, keeps deleted-staff bills (attendant_id
    // null, see migration 008) counted — we can't know their old role,
    // but they can't be the currently-active Super Admin's own bills.
    async function getSuperAdminIds() {
        const { data, error } = await supabaseAdmin.from('profiles').select('id').eq('role', 'SUPER_ADMIN');
        if (error) {
            console.error('Could not load Super Admin ids:', error.message);
            return [];
        }
        return (data || []).map((p) => p.id);
    }

    async function buildSummaryPayload(title, sinceIso, { excludeSuperAdmin = false } = {}) {
        const { data: rows, error } = await supabaseAdmin
            .from('transactions')
            .select('attendant_id, attendant_username, amount')
            .gte('created_at', sinceIso);

        if (error) {
            console.error('Could not load transactions for summary:', error.message);
            return null;
        }

        let scopedRows = rows;
        if (excludeSuperAdmin) {
            const superAdminIds = new Set(await getSuperAdminIds());
            scopedRows = rows.filter((r) => !(r.attendant_id && superAdminIds.has(r.attendant_id)));
        }

        // Batch-resolve display names for everyone involved, one query
        // instead of one per row.
        const attendantIds = [...new Set(scopedRows.map((r) => r.attendant_id).filter(Boolean))];
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
        for (const row of scopedRows) {
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
                    { name: '🧾 Total Bills', value: String(scopedRows.length), inline: true },
                    { name: '💰 Total Amount', value: `₹${grandTotal.toFixed(2)}`, inline: true },
                ],
                footer: { text: 'FuelDesk' },
                timestamp: new Date().toISOString(),
            }],
        };
    }

    // Bumps a reset pointer column to the given ISO instant — the next
    // summary of that kind will only count bills from that point
    // forward, which is the "reset the count to 0" behaviour. The
    // stored value is always an IST calendar boundary (Monday 00:00 for
    // weekly, the 1st 00:00 for monthly), not the exact send instant,
    // so the numbers read cleanly on their own.
    async function resetPeriod(column, isoValue) {
        const { error } = await supabaseAdmin
            .from('integrations')
            .update({ [column]: isoValue })
            .eq('id', 1);
        if (error) console.error(`Could not reset ${column}:`, error.message);
    }

    async function sendWeeklySummary() {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_weekly_summary || !config?.discord_webhook_url) return;
        const since = config.discord_weekly_reset_at || new Date(Date.now() - ONE_WEEK_MS).toISOString();
        const payload = await buildSummaryPayload('📊 Weekly Summary (Admin & Staff)', since, { excludeSuperAdmin: true });
        if (!payload) return;
        enqueue(config.discord_webhook_url, payload);
        await resetPeriod('discord_weekly_reset_at', startOfWeekIST());
    }

    async function sendMonthlySummary() {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_monthly_summary || !config?.discord_webhook_url) return;
        const since = config.discord_monthly_reset_at || new Date(Date.now() - ONE_MONTH_MS).toISOString();
        const payload = await buildSummaryPayload('🗓️ Monthly Summary (Admin & Staff)', since, { excludeSuperAdmin: true });
        if (!payload) return;
        enqueue(config.discord_webhook_url, payload);
        await resetPeriod('discord_monthly_reset_at', startOfMonthIST());
    }

    // Manual, on-demand "today so far" summary for Admin Staff + Station
    // Staff (Super Admin's own bills, if any, excluded). Triggered from
    // Settings → Integrations, not on a schedule, and doesn't touch the
    // weekly/monthly reset pointers — "today" is naturally bounded by
    // IST midnight, so there's nothing to reset.
    async function sendTodaySummary() {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_webhook_url) {
            throw new Error('Discord isn\'t enabled or configured yet — set a webhook URL and enable Discord first.');
        }
        const since = startOfTodayIST();
        const payload = await buildSummaryPayload('📅 Today\'s Summary (Admin & Staff)', since, { excludeSuperAdmin: true });
        if (!payload) throw new Error('Could not build today\'s summary — check server logs.');

        // Sent directly (awaited), not through the queue — same reasoning
        // as sendTestMessage: this is a one-off manual action and the
        // admin wants to know right away whether it actually went out.
        const result = await sendWithRetry(config.discord_webhook_url, payload);
        if (!result.ok) throw new Error(result.error || 'Could not send summary');
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

    return { notifyBillCreated, sendTodaySummary, sendWeeklySummary, sendMonthlySummary, sendTestMessage, wipeOldTransactions, scheduleJobs };
}

module.exports = { createDiscordIntegration };
