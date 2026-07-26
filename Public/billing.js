const PRODUCT_LABELS = { MS: 'MS (Petrol)', HSD: 'HSD (Diesel)', PREMIUM: 'Premium' };

const productSelect = document.getElementById('product-select');
const modeSelect = document.getElementById('billing-mode');
const inputValue = document.getElementById('input-value');
const inputValueLabel = document.getElementById('input-value-label');
const timeModeSelect = document.getElementById('time-mode');
const customTimeInputs = document.getElementById('custom-time-inputs');
const customDatetime = document.getElementById('custom-datetime');
const printBtn = document.getElementById('print-btn');
const billingAlert = document.getElementById('billing-alert');
const displayRate = document.getElementById('display-rate');
const displayDensity = document.getElementById('display-density');
const whoami = document.getElementById('whoami');

let currentConfig = null;

function showAlert(message) {
    billingAlert.textContent = message;
    billingAlert.classList.add('show');
}
function hideAlert() {
    billingAlert.classList.remove('show');
}

function fieldsForProduct(product) {
    const key = product.toLowerCase();
    return { rateField: `${key}_rate`, densityField: `${key}_density` };
}

function updateLiveStats() {
    if (!currentConfig) return;
    const { rateField, densityField } = fieldsForProduct(productSelect.value);
    displayRate.innerText = Number(currentConfig[rateField]).toFixed(2);
    displayDensity.innerText = currentConfig[densityField];
}

function updateInputLabel() {
    inputValueLabel.textContent = modeSelect.value === 'VOLUME' ? 'Enter Volume (Liters)' : 'Enter Amount (₹)';
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

productSelect.addEventListener('change', updateLiveStats);
modeSelect.addEventListener('change', updateInputLabel);

timeModeSelect.addEventListener('change', (e) => {
    const isBackdate = e.target.value === 'BACKDATE';
    customTimeInputs.style.display = isBackdate ? 'block' : 'none';
    if (isBackdate && !customDatetime.value) {
        customDatetime.value = defaultDatetimeLocalValue();
    }
});

async function loadConfig() {
    const { data, error } = await window.sb.from('daily_config').select('*').eq('id', 1).single();
    if (error || !data) {
        showAlert('Could not load current rates. Pull to refresh or contact an admin.');
        return;
    }
    currentConfig = data;
    updateLiveStats();
}

printBtn.addEventListener('click', async () => {
    hideAlert();

    const inputVal = parseFloat(inputValue.value);
    if (!inputVal || inputVal <= 0) {
        showAlert('Enter a value greater than 0.');
        return;
    }
    if (!currentConfig) {
        showAlert('Rates have not loaded yet. Wait a moment and try again.');
        return;
    }

    const product = productSelect.value;
    const mode = modeSelect.value;
    const { rateField, densityField } = fieldsForProduct(product);
    const rate = Number(currentConfig[rateField]);
    const density = Number(currentConfig[densityField]);

    const volume = mode === 'VOLUME' ? inputVal : +(inputVal / rate).toFixed(2);
    const amount = mode === 'AMOUNT' ? inputVal : +(inputVal * rate).toFixed(2);

    const timeMode = timeModeSelect.value;
    let billDateTime;
    if (timeMode === 'CURRENT') {
        billDateTime = new Date();
    } else {
        if (!customDatetime.value) {
            showAlert('Choose a backdated date & time.');
            return;
        }
        billDateTime = new Date(customDatetime.value);
        if (isNaN(billDateTime.getTime())) {
            showAlert('That backdated date & time is not valid.');
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
            attendant_id: window.currentSession.user.id,
            attendant_username: window.currentProfile.username,
        }])
        .select()
        .single();

    printBtn.disabled = false;
    printBtn.textContent = 'Print Bill';

    if (insertError || !inserted) {
        showAlert('Could not save the bill: ' + (insertError?.message || 'unknown error'));
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
        },
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
    });

    window.print();

    inputValue.value = '';
});

(async function init() {
    const profile = await FuelDeskAuth.requireSession('STATION_STAFF');
    if (!profile) return;

    whoami.textContent = `Logged in as ${profile.username}`;
    updateInputLabel();
    await loadConfig();
})();
