const PRODUCT_LABELS = { MS: 'MS (Petrol)', HSD: 'HSD (Diesel)', PREMIUM: 'Premium' };
const PRODUCT_OPTIONS = [
    { value: 'MS', label: 'Petrol (MS)' },
    { value: 'HSD', label: 'Diesel (HSD)' },
    { value: 'PREMIUM', label: 'Premium' },
];
const MODE_OPTIONS = [
    { value: 'VOLUME', label: 'By Volume (Liters)' },
    { value: 'AMOUNT', label: 'By Amount (₹)' },
    { value: 'VOLUME_PRESET', label: 'Volume Preset' },
];
const TIME_MODE_OPTIONS = [
    { value: 'CURRENT', label: 'Current Time' },
    { value: 'BACKDATE', label: 'Backdated (Custom)' },
];

const inputValue = document.getElementById('input-value');
const inputValueLabel = document.getElementById('input-value-label');
const amountPreviewBox = document.getElementById('amount-preview-box');
const amountPreviewMain = document.getElementById('amount-preview-main');
const amountPreviewWords = document.getElementById('amount-preview-words');
const volumePresetHint = document.getElementById('volume-preset-hint');
const vehicleNoInput = document.getElementById('vehicle-no');
const mobileNoInput = document.getElementById('mobile-no');
const customTimeInputs = document.getElementById('custom-time-inputs');
const customDatetime = document.getElementById('custom-datetime');
const customRateField = document.getElementById('custom-rate-input');
const backdateRateInput = document.getElementById('backdate-rate');
const printBtn = document.getElementById('print-btn');
const displayRate = document.getElementById('display-rate');
const displayDensity = document.getElementById('display-density');
const whoami = document.getElementById('whoami');
const roleBadge = document.getElementById('role-badge');

let currentConfig = null;

const productPicker = makePickerField({
    buttonEl: document.getElementById('product-picker-btn'),
    labelEl: document.getElementById('product-picker-label'),
    title: 'Select Product',
    options: PRODUCT_OPTIONS,
    initialValue: 'HSD',
});
document.getElementById('product-picker-btn').addEventListener('picker-change', updateLiveStats);

const modePicker = makePickerField({
    buttonEl: document.getElementById('mode-picker-btn'),
    labelEl: document.getElementById('mode-picker-label'),
    title: 'Select Billing Mode',
    options: MODE_OPTIONS,
    initialValue: 'AMOUNT',
});
document.getElementById('mode-picker-btn').addEventListener('picker-change', () => {
    updateInputLabel();
    updateAmountPreview();
    volumePresetHint.style.display = modePicker.get() === 'VOLUME_PRESET' ? 'block' : 'none';
});
inputValue.addEventListener('input', updateAmountPreview);

const timeModePicker = makePickerField({
    buttonEl: document.getElementById('time-mode-picker-btn'),
    labelEl: document.getElementById('time-mode-picker-label'),
    title: 'Bill Timestamp',
    options: TIME_MODE_OPTIONS,
    initialValue: 'CURRENT',
});
document.getElementById('time-mode-picker-btn').addEventListener('picker-change', (e) => {
    const isBackdate = e.detail === 'BACKDATE';
    customTimeInputs.style.display = isBackdate ? 'flex' : 'none';
    customRateField.style.display = isBackdate ? 'flex' : 'none';
    if (isBackdate && !customDatetime.value) customDatetime.value = defaultDatetimeLocalValue();
    if (isBackdate && !backdateRateInput.value && currentConfig) {
        const { rateField } = fieldsForProduct(productPicker.get());
        backdateRateInput.value = Number(currentConfig[rateField]).toFixed(2);
    }
});

function fieldsForProduct(product) {
    const key = product.toLowerCase();
    return { rateField: `${key}_rate`, densityField: `${key}_density` };
}

function updateLiveStats() {
    if (!currentConfig) return;
    const { rateField, densityField } = fieldsForProduct(productPicker.get());
    displayRate.innerText = Number(currentConfig[rateField]).toFixed(2);
    displayDensity.innerText = currentConfig[densityField];
}

function updateInputLabel() {
    inputValueLabel.textContent = modePicker.get() === 'AMOUNT' ? 'Enter Amount (₹)' : 'Enter Volume (Liters)';
}

// ---- Live yellow preview under the amount/volume field ----

const NUM_WORDS_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const NUM_WORDS_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n) {
    if (n < 20) return NUM_WORDS_ONES[n];
    const t = Math.floor(n / 10), o = n % 10;
    return NUM_WORDS_TENS[t] + (o ? '-' + NUM_WORDS_ONES[o] : '');
}

function threeDigitWords(n) {
    const h = Math.floor(n / 100), rest = n % 100;
    let s = '';
    if (h) s += NUM_WORDS_ONES[h] + ' Hundred';
    if (rest) s += (s ? ' ' : '') + twoDigitWords(rest);
    return s;
}

// Indian numbering system: ...crore, lakh, thousand, hundred.
function numberToWordsIndian(num) {
    num = Math.floor(num);
    if (num === 0) return 'Zero';
    let n = num;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const hundred = n;

    const parts = [];
    if (crore) parts.push(threeDigitWords(crore) + ' Crore');
    if (lakh) parts.push(threeDigitWords(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigitWords(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigitWords(hundred));
    return parts.join(' ');
}

function amountToWords(amount) {
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);
    let words = numberToWordsIndian(rupees) + ' Rs';
    if (paise > 0) {
        words += ` and ${numberToWordsIndian(paise)} Paise`;
    }
    return words;
}

function formatIndianCommas(n) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateAmountPreview() {
    const raw = inputValue.value;
    const val = parseFloat(raw);

    if (!raw || isNaN(val) || val <= 0) {
        amountPreviewBox.classList.remove('visible');
        amountPreviewMain.textContent = '';
        amountPreviewWords.textContent = '';
        return;
    }

    if (modePicker.get() === 'AMOUNT') {
        amountPreviewMain.textContent = `₹${formatIndianCommas(val)}`;
        amountPreviewWords.textContent = amountToWords(val);
    } else {
        amountPreviewMain.textContent = `${formatIndianCommas(val)} ltr`;
        amountPreviewWords.textContent = '';
    }
    amountPreviewBox.classList.add('visible');
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDateTime(d) {
    return {
        dateStr: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`,
        timeStr: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
}

function defaultDatetimeLocalValue() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // shift so toISOString() reads as local time
    return d.toISOString().slice(0, 16);
}

function setPrintButtonLoading(isLoading) {
    printBtn.disabled = isLoading;
    printBtn.textContent = isLoading ? 'Loading rates...' : 'Print Bill';
}

// Rates/density are always fetched fresh — no stale-cache shortcut.
// Billing is blocked (Print stays disabled) until this succeeds, so
// nobody can accidentally bill against out-of-date numbers.
async function loadConfig(inFlightPromise) {
    setPrintButtonLoading(true);

    const { data, error } = await (inFlightPromise || window.sb.from('daily_config').select('*').eq('id', 1).single());
    if (error || !data) {
        Toast.show('Could not load current rates. Check your connection and reload.', { error: true, duration: 6000 });
        return;
    }
    currentConfig = data;
    updateLiveStats();
    setPrintButtonLoading(false);

    renderSubscriptionBanner(data.subscription_expiry_date);
}

// Live sync: if an admin changes rates/density (or anything else in
// daily_config) while this page is open, pick it up immediately instead
// of requiring a reload. Requires Realtime enabled on daily_config (see
// sql/schema.sql / the migration — it's enabled by default there).
function subscribeToConfigChanges() {
    window.sb
        .channel('daily_config-sync')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'daily_config' }, (payload) => {
            currentConfig = payload.new;
            updateLiveStats();
            Toast.show('Rates were just updated by an admin.');
        })
        .subscribe();
}

printBtn.addEventListener('click', async () => {
    const inputVal = parseFloat(inputValue.value);
    if (!inputVal || inputVal <= 0) {
        Toast.show('Enter a value greater than 0.', { error: true });
        return;
    }
    if (!currentConfig) {
        Toast.show('Rates have not loaded yet. Wait a moment and try again.', { error: true });
        return;
    }

    const mobileNo = mobileNoInput.value.trim();
    if (mobileNo && !/^[0-9]{10}$/.test(mobileNo)) {
        Toast.show('Mobile number must be 10 digits (or left blank).', { error: true });
        return;
    }

    const product = productPicker.get();
    const mode = modePicker.get();
    const { rateField, densityField } = fieldsForProduct(product);
    const density = Number(currentConfig[densityField]);

    const timeMode = timeModePicker.get();
    let billDateTime;
    let rate;

    if (timeMode === 'CURRENT') {
        billDateTime = new Date();
        rate = Number(currentConfig[rateField]);
    } else {
        if (!customDatetime.value) {
            Toast.show('Choose a backdated date & time.', { error: true });
            return;
        }
        billDateTime = new Date(customDatetime.value);
        if (isNaN(billDateTime.getTime())) {
            Toast.show('That backdated date & time is not valid.', { error: true });
            return;
        }
        rate = parseFloat(backdateRateInput.value);
        if (!rate || rate <= 0) {
            Toast.show('Enter the rate that was in effect on that day.', { error: true });
            return;
        }
    }

    // "Volume Preset" behaves exactly like "By Volume" for the actual math
    // and what's stored — the only difference is purely cosmetic on the
    // printed receipt (see presetOverride below). Only "By Amount" computes
    // volume from the input; both volume-based modes take it as-is.
    const volume = mode === 'AMOUNT' ? +(inputVal / rate).toFixed(2) : inputVal;
    const amount = mode === 'AMOUNT' ? inputVal : +(inputVal * rate).toFixed(2);

    const { dateStr, timeStr } = formatDateTime(billDateTime);

    printBtn.disabled = true;
    printBtn.textContent = 'Saving...';

    const { data: inserted, error: insertError } = await window.sb
        .from('transactions')
        .insert([{
            product,
            rate,
            density,
            volume,
            amount,
            // The database only accepts 'VOLUME' or 'AMOUNT' (see
            // sql/schema.sql) — "Volume Preset" is a volume-mode bill as
            // far as the database and every report/total are concerned;
            // it only changes the printed Preset line, not what's saved.
            preset_type: mode === 'VOLUME_PRESET' ? 'VOLUME' : mode,
            bill_datetime: billDateTime.toISOString(),
            bill_date: dateStr,
            bill_time: timeStr,
            is_backdated: timeMode === 'BACKDATE',
            vehicle_no: vehicleNoInput.value.trim().toUpperCase() || null,
            mobile_no: mobileNo || null,
            attendant_id: window.currentSession.user.id,
            attendant_username: window.currentProfile.username,
        }])
        .select()
        .single();

    printBtn.disabled = false;
    printBtn.textContent = 'Print Bill';

    if (insertError || !inserted) {
        Toast.show('Could not save the bill: ' + (insertError?.message || 'unknown error'), { error: true, duration: 5000 });
        return;
    }

    // Fire-and-forget: let the server relay this to Discord if that's
    // configured and enabled. Never blocks printing.
    notifyBillCreated(inserted.id);

    const now = new Date();
    const printedAt = formatDateTime(now);

    const template = window.BillTemplates.get(currentConfig.active_template);
    const rendered = template.render({
        station: {
            name: currentConfig.station_name,
            address: currentConfig.station_address,
            phone: currentConfig.station_phone,
            logoUrl: currentConfig.logo_url,
            logoWidthMm: currentConfig.logo_width_mm,
            logoPositionPct: currentConfig.logo_position_pct,
            logoRatioLocked: currentConfig.logo_ratio_locked,
            logoHeightMm: currentConfig.logo_height_mm,
        },
        footer: currentConfig.receipt_footer || '<center>Thank You! Please Visit Again..</center>',
        receiptNo: inserted.receipt_no,
        transactionId: String(inserted.id).padStart(16, '0'),
        billDateTimeIso: billDateTime.toISOString(),
        product,
        productLabel: PRODUCT_LABELS[product] || product,
        density: density,
        presetTypeLabel: mode === 'AMOUNT' ? 'Amount' : 'Volume',
        rate: rate.toFixed(2),
        volume: volume.toFixed(2),
        amount: amount.toFixed(2),
        dateStr,
        timeStr,
        printDateStr: printedAt.dateStr,
        printTimeStr: printedAt.timeStr,
        attendantUsername: FuelDeskAuth.displayName(window.currentProfile),
        vehicleNo: vehicleNoInput.value.trim().toUpperCase(),
        mobileNo,
        presetOverride: mode === 'VOLUME_PRESET' ? '999L' : null,
    });

    const receiptEl = document.getElementById('thermal-receipt');
    receiptEl.innerHTML = window.BillTemplates.wrapForOutput(rendered, {
        marginMm: currentConfig.receipt_margin_mm,
        lineSpacing: currentConfig.receipt_line_spacing,
        baseFontPx: currentConfig.receipt_base_font_px,
        printDarknessPct: currentConfig.receipt_print_darkness_pct,
        textThicknessPct: currentConfig.receipt_text_thickness_pct,
    });

    applyReceiptWidth(currentConfig.receipt_width_cm);
    // Make sure the logo has actually finished loading before printing —
    // otherwise printing right after typing a bill can capture the
    // receipt before a freshly-set <img src> has downloaded, leaving the
    // logo blank until you print again (once the browser has cached it).
    await waitForReceiptImages(receiptEl);
    window.print();

    inputValue.value = '';
    vehicleNoInput.value = '';
    mobileNoInput.value = '';
    backdateRateInput.value = '';
    updateAmountPreview();
});

// Belt-and-braces copy protection to match the CSS user-select:none above —
// blocks copy/cut of anything outside a real input/textarea field, even if
// triggered via keyboard shortcut or browser extension rather than a mouse
// selection.
document.addEventListener('copy', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
});
document.addEventListener('cut', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
});

async function notifyBillCreated(transactionId) {
    try {
        const { data: { session } } = await window.sb.auth.getSession();
        await fetch('/api/notify/bill-created', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ transactionId }),
        });
    } catch {
        // Non-critical — never interrupt billing over a notification failing.
    }
}

(async function init() {
    // Fired off immediately, in parallel with the auth/role check below —
    // reading daily_config only needs "authenticated", which is already
    // true the instant a session exists in the client, so there's no
    // reason to wait for the separate profile-role lookup to finish
    // first. Shaves a full network round-trip off every page load.
    const configPromise = window.sb.from('daily_config').select('*').eq('id', 1).single();

    const profile = await FuelDeskAuth.requireSession(); // any active, logged-in user
    if (!profile) return;

    whoami.textContent = `Logged in as ${FuelDeskAuth.displayName(profile)}`;
    roleBadge.textContent = FuelDeskAuth.roleLabel(profile.role);
    updateInputLabel();
    FuelDeskAuth.renderPanelSwitcher('billing');

    if (profile.role === 'SUPER_ADMIN' || profile.role === 'ADMIN_STAFF') {
        const staffBtn = document.getElementById('staff-nav-btn');
        staffBtn.style.display = 'flex';
        staffBtn.addEventListener('click', () => window.location.href = '/staff.html');
    }

    await loadConfig(configPromise);
    subscribeToConfigChanges();
    window.PageLoader?.ready();
})();
