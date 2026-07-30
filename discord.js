// Discord integration + scheduled jobs. Everything here is server-side
// only — the webhook URL lives in the `integrations` table, which has
// no RLS policies for any browser client (see sql/schema.sql section 5).
//
// Requires Node 18+ for the built-in `fetch`.

const cron = require('node-cron');

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function createDiscordIntegration(supabaseAdmin) {
    async function getConfig() {
        const { data, error } = await supabaseAdmin.from('integrations').select('*').eq('id', 1).single();
        if (error) {
            console.error('Could not load integrations config:', error.message);
            return null;
        }
        return data;
    }

    async function postToDiscord(webhookUrl, payload) {
        try {
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                console.error('Discord webhook responded with an error:', res.status, await res.text().catch(() => ''));
            }
        } catch (err) {
            console.error('Could not reach Discord webhook:', err.message);
        }
    }

    async function notifyBillCreated(transaction) {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_bill_created || !config?.discord_webhook_url) return;

        await postToDiscord(config.discord_webhook_url, {
            embeds: [{
                title: '🧾 New Bill',
                color: 0xd97706,
                fields: [
                    { name: 'Receipt No.', value: String(transaction.receipt_no ?? '—'), inline: true },
                    { name: 'Product', value: String(transaction.product ?? '—'), inline: true },
                    { name: 'Amount', value: `₹${transaction.amount}`, inline: true },
                    { name: 'Volume', value: `${transaction.volume} L`, inline: true },
                    { name: 'Attendant', value: transaction.attendant_username || 'Unknown', inline: true },
                ],
                timestamp: new Date().toISOString(),
            }],
        });
    }

    async function buildSummaryPayload(title, sinceIso) {
        const { data: rows, error } = await supabaseAdmin
            .from('transactions')
            .select('attendant_username, amount')
            .gte('created_at', sinceIso);

        if (error) {
            console.error('Could not load transactions for summary:', error.message);
            return null;
        }

        const totals = {};
        let grandTotal = 0;
        for (const row of rows) {
            const key = row.attendant_username || 'Unknown';
            totals[key] = (totals[key] || 0) + Number(row.amount);
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
        if (payload) await postToDiscord(config.discord_webhook_url, payload);
    }

    async function sendMonthlySummary() {
        const config = await getConfig();
        if (!config?.discord_enabled || !config?.discord_notify_monthly_summary || !config?.discord_webhook_url) return;
        const since = new Date(Date.now() - ONE_MONTH_MS).toISOString();
        const payload = await buildSummaryPayload('🗓️ Monthly Summary (all staff)', since);
        if (payload) await postToDiscord(config.discord_webhook_url, payload);
    }

    async function sendTestMessage() {
        const config = await getConfig();
        if (!config?.discord_webhook_url) throw new Error('No webhook URL saved yet — enter one first.');
        await postToDiscord(config.discord_webhook_url, {
            content: '✅ FuelDesk is connected to this channel. Test message sent from Settings → Integrations.',
        });
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
