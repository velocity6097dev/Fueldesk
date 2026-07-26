const PRODUCT_LABELS = { MS: 'MS (Petrol)', HSD: 'HSD (Diesel)', PREMIUM: 'Premium' };
const PRODUCT_OPTIONS = [
    { value: 'MS', label: 'Petrol (MS)' },
    { value: 'HSD', label: 'Diesel (HSD)' },
    { value: 'PREMIUM', label: 'Premium' },
];
const MODE_OPTIONS = [
    { value: 'VOLUME', label: 'By Volume (Liters)' },
    { value: 'AMOUNT', label: 'By Amount (₹)' },
];
const TIME_MODE_OPTIONS = [
    { value: 'CURRENT', label: 'Current Time' },
    { value: 'BACKDATE', label: 'Backdated (Custom)' },
];

const inputValue = document.getElementById('input-value');
const inputValueLabel = document.getElementById('input-value-label');
const vehicleNoInput = document.getElementById('vehicle-no');
const mobileNoInput = document.getElementById('mobile-no');
const customTimeInputs = document.getElementById('custom-time-inputs');
const customDatetime = document.getElementById('custom-datetime');
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
    initialValue: 'MS',
});
document.getElementById('product-picker-btn').addEventListener('picker-change', updateLiveStats);

const modePicker = makePickerField({
    buttonEl: document.getElementById('mode-picker-btn'),
    labelEl: document.getElementById('mode-picker-label'),
    title: 'Select Billing Mode',
    options: MODE_OPTIONS,
    initialValue: 'VOLUME',
});
document.getElementById('mode-picker-btn').addEventListener('picker-change', updateInputLabel);

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
    if (isBackdate && !customDatetime.value) customDatetime.value = defaultDatetimeLocalValue();
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
    inputValueLabel.textContent = modePicker.get() === 'VOLUME' ? 'Enter Volume (Liters)' : 'Enter Amount (₹)';
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

async function loadConfig() {
    const { data, error } = await window.sb.from('daily_config').select('*').eq('id', 1).single();
    if (error || !data) {
        Toast.show('Could not load current rates. Pull to refresh or contact an admin.', { error: true });
        return;
    }
    currentConfig = data;
    updateLiveStats();
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
    const rate = Number(currentConfig[rateField]);
    const density = Number(currentConfig[densityField]);

    const volume = mode === 'VOLUME' ? inputVal : +(inputVal / rate).toFixed(2);
    const amount = mode === 'AMOUNT' ? inputVal : +(inputVal * rate).toFixed(2);

    const timeMode = timeModePicker.get();
    let billDateTime;
    if (timeMode === 'CURRENT') {
        billDateTime = new Date();
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
    }
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
            preset_type: mode,
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

    const now = new Date();
    const printedAt = formatDateTime(now);

    const template = window.BillTemplates.get(currentConfig.active_template);
    document.getElementById('thermal-receipt').innerHTML = template.render({
        station: {
            name: currentConfig.station_name,
            address: currentConfig.station_address,
            phone: currentConfig.station_phone,
            gstin: currentConfig.station_gstin,
            logoUrl: currentConfig.logo_url,
            logoWidthMm: currentConfig.logo_width_mm,
        },
        footer: currentConfig.receipt_footer,
        receiptNo: inserted.receipt_no,
        productLabel: PRODUCT_LABELS[product] || product,
        density: density,
        presetTypeLabel: mode === 'VOLUME' ? 'Volume' : 'Amount',
        rate: rate.toFixed(2),
        volume: volume.toFixed(2),
        amount: amount.toFixed(2),
        dateStr,
        timeStr,
        printDateStr: printedAt.dateStr,
        printTimeStr: printedAt.timeStr,
        attendantUsername: window.currentProfile.username,
        vehicleNo: vehicleNoInput.value.trim().toUpperCase(),
        mobileNo,
    });

    window.print();

    inputValue.value = '';
    vehicleNoInput.value = '';
    mobileNoInput.value = '';
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession(); // any active, logged-in user (admin or staff)
    if (!profile) return;

    whoami.textContent = `Logged in as ${profile.username}`;
    roleBadge.textContent = profile.role === 'ADMIN_STAFF' ? 'Admin' : 'Staff';
    updateInputLabel();
    FuelDeskAuth.renderPanelSwitcher('billing');
    await loadConfig();
})();
