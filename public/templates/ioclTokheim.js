// (function () {
//     const SCALE = {
//         tagline: 1.18,      // "*** Fuelling Trust ***"
//         stationName: 1.09,
//         addressPhone: 0.91,
//         printedOn: 0.91,
//     };

//     window.BillTemplates.register({
//         id: 'IOCL_TOKHEIM',
//         label: 'IOCL Tokheim',

//         render(data) {
//             const s = data.station;
//             const { formattedBlock, renderLogoBlock, escapeHtml, randomFpId, randomNozzleNo } = window.BillTemplates;
//             const footer = data.footer || '<center>Thank You! Please Visit Again..</center>';

//             const logoBlock = renderLogoBlock(s, `<div class="receipt-logo-box font-bold uppercase">Indian<br/>Oil</div>`);

//             return `
//                 ${logoBlock}
//                 <div class="text-center" style="font-size:${SCALE.tagline}em;letter-spacing:1px;margin-bottom:2px;">*** Fuelling Trust ***</div>
//                 ${formattedBlock(s.name, `font-size:${SCALE.stationName}em;`, 'center')}
//                 ${s.address ? formattedBlock(s.address, `font-size:${SCALE.addressPhone}em;`) : ''}
//                 ${s.phone ? `<div style="font-size:${SCALE.addressPhone}em;">Ph: ${escapeHtml(s.phone)}</div>` : ''}
//                 <div class="my-2"></div>
//                 <div class="grid-3-col">
//                     <span>Bill No.</span><span>:</span><span class="text-right">${data.receiptNo}</span>
//                     <span>DU No.</span><span>:</span><span class="text-right">${randomFpId()}</span>
//                     <span>Nozzle</span><span>:</span><span class="text-right">${randomNozzleNo()}</span>
//                     <span>Product</span><span>:</span><span>${data.productLabel}</span>
//                     <span>Density</span><span>:</span><span>${data.density} Kg/Cu.mtr</span>
//                     <span>Mode</span><span>:</span><span>${data.presetTypeLabel}</span>
//                     <span>Rate/Ltr</span><span>:</span><span class="text-right">${data.rate}</span>
//                     <span>Qty (Ltr)</span><span>:</span><span class="text-right">${data.volume}</span>
//                     <span>Total Amt</span><span>:</span><span class="text-right">${data.amount}</span>
//                 </div>
//                 <div class="my-2"></div>
//                 <div>
//                     <div class="flex-between"><span>Vehicle No:</span><span>${escapeHtml(data.vehicleNo || 'Not Entered')}</span></div>
//                     <div class="flex-between"><span>Mobile No :</span><span>${escapeHtml(data.mobileNo || 'Not Entered')}</span></div>
//                     <div class="flex-between"><span>Operator  :</span><span>${escapeHtml(data.attendantUsername)}</span></div>
//                 </div>
//                 <div class="my-2"></div>
//                 <div>Date : ${data.dateStr}  Time: ${data.timeStr}</div>
//                 <div class="my-3"></div>
//                 <div class="font-bold">${formattedBlock(footer)}</div>
//                 <div class="my-3"></div>
//                 <div class="text-left" style="font-size:${SCALE.printedOn}em;">Printed: ${data.printDateStr} ${data.printTimeStr}</div>
//             `;
//         },
//     });
// })();



// IOCL Gilbarco — HTML preview + ESC/POS direct-print template
(function () {
    const TEXT_SCALE = {
        stationName: 1.0,
        addressPhone: 1.0,
        fieldBlock: 1.0,
        labelColWidth: 4.9,
        footer: 1.0,
    };

    const FUEL_NAMES = {
        MS: 'PETROL',
        HSD: 'DIESEL',
        PREMIUM: 'PREMIUM',
    };

    const ESC = 0x1b;
    const GS = 0x1d;

    function pad2(number) {
        return String(number).padStart(2, '0');
    }

    function randomBillNo() {
        const digits = String(
            Math.floor(Math.random() * 1000000)
        ).padStart(6, '0');

        return `${digits}-ORGNL`;
    }

    function randomTransactionId() {
        const last9 = String(
            Math.floor(Math.random() * 1000000000)
        ).padStart(9, '0');

        return `0000000${last9}`;
    }

    function safeText(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value);
    }

    function stripHtml(value) {
        const text = safeText(value);

        const container = document.createElement('div');
        container.innerHTML = text;

        return (container.textContent || container.innerText || '')
            .replace(/\u00a0/g, ' ')
            .trim();
    }

    function encodeText(value) {
        /*
         * Works for ordinary English receipt text.
         * Avoid using the ₹ symbol unless the printer supports it.
         */
        return new TextEncoder().encode(safeText(value));
    }

    function concatBytes(...parts) {
        const validParts = parts.filter(
            part => part instanceof Uint8Array && part.length > 0
        );

        const totalLength = validParts.reduce(
            (sum, part) => sum + part.length,
            0
        );

        const output = new Uint8Array(totalLength);

        let offset = 0;

        for (const part of validParts) {
            output.set(part, offset);
            offset += part.length;
        }

        return output;
    }

    function command(...bytes) {
        return new Uint8Array(bytes);
    }

    function textLine(value = '') {
        return encodeText(`${safeText(value)}\n`);
    }

    function mmToDots(mm, dpi = 203) {
        return Math.max(
            1,
            Math.round((Number(mm) / 25.4) * dpi)
        );
    }

    function getPaperDots(paperWidthMm) {
        return Number(paperWidthMm) === 80 ? 576 : 384;
    }

    function getCharactersPerLine(paperWidthMm, fontType) {
        if (Number(paperWidthMm) === 80) {
            return fontType === 'B' ? 64 : 48;
        }

        return fontType === 'B' ? 42 : 32;
    }

    function wrapText(value, width) {
        const text = safeText(value).trim();

        if (!text) {
            return [''];
        }

        const result = [];

        for (const originalLine of text.split(/\r?\n/)) {
            if (!originalLine.trim()) {
                result.push('');
                continue;
            }

            const words = originalLine.trim().split(/\s+/);
            let currentLine = '';

            for (const word of words) {
                const candidate = currentLine
                    ? `${currentLine} ${word}`
                    : word;

                if (candidate.length <= width) {
                    currentLine = candidate;
                    continue;
                }

                if (currentLine) {
                    result.push(currentLine);
                }

                if (word.length <= width) {
                    currentLine = word;
                    continue;
                }

                for (let i = 0; i < word.length; i += width) {
                    result.push(word.slice(i, i + width));
                }

                currentLine = '';
            }

            if (currentLine) {
                result.push(currentLine);
            }
        }

        return result;
    }

    function makeFieldLines(label, value, contentWidth) {
        const labelWidth = 9;
        const cleanLabel = safeText(label).slice(0, labelWidth);
        const prefix = `${cleanLabel.padEnd(labelWidth, ' ')}:`;
        const valueWidth = Math.max(
            1,
            contentWidth - prefix.length - 1
        );

        const wrapped = wrapText(value, valueWidth);

        if (!wrapped.length) {
            return [`${prefix} `];
        }

        const lines = [
            `${prefix} ${wrapped[0]}`,
        ];

        const continuationPrefix =
            ' '.repeat(prefix.length + 1);

        for (let index = 1; index < wrapped.length; index += 1) {
            lines.push(
                `${continuationPrefix}${wrapped[index]}`
            );
        }

        return lines;
    }

    function loadImage(source) {
        return new Promise((resolve, reject) => {
            if (!source) {
                resolve(null);
                return;
            }

            const image = new Image();

            /*
             * Data URLs and local same-origin images work normally.
             * Remote URLs must allow CORS.
             */
            image.crossOrigin = 'anonymous';

            image.onload = () => resolve(image);

            image.onerror = () => {
                reject(
                    new Error(`Unable to load receipt logo: ${source}`)
                );
            };

            image.src = source;
        });
    }

    function getLogoSource(station) {
        return (
            station.logoDataUrl ||
            station.logoUrl ||
            station.logoPhoto ||
            station.logoSrc ||
            station.logo ||
            ''
        );
    }

    function canvasToEscPosRaster(canvas, threshold = 180) {
        const context = canvas.getContext('2d', {
            willReadFrequently: true,
        });

        if (!context) {
            throw new Error('Unable to create logo canvas context.');
        }

        const width = canvas.width;
        const height = canvas.height;
        const bytesPerRow = Math.ceil(width / 8);

        const pixels = context.getImageData(
            0,
            0,
            width,
            height
        ).data;

        const raster = new Uint8Array(
            bytesPerRow * height
        );

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixelIndex = (y * width + x) * 4;

                const red = pixels[pixelIndex];
                const green = pixels[pixelIndex + 1];
                const blue = pixels[pixelIndex + 2];
                const alpha = pixels[pixelIndex + 3];

                const brightness = alpha === 0
                    ? 255
                    : (
                        red * 0.299 +
                        green * 0.587 +
                        blue * 0.114
                    );

                const isBlack = brightness < threshold;

                if (!isBlack) {
                    continue;
                }

                const byteIndex =
                    (y * bytesPerRow) + Math.floor(x / 8);

                const bitIndex = 7 - (x % 8);

                raster[byteIndex] |= (1 << bitIndex);
            }
        }

        /*
         * GS v 0 — print raster bitmap.
         */
        const header = command(
            GS,
            0x76,
            0x30,
            0x00,
            bytesPerRow & 0xff,
            (bytesPerRow >> 8) & 0xff,
            height & 0xff,
            (height >> 8) & 0xff
        );

        return concatBytes(header, raster);
    }

    async function buildLogoRaster(station, settings) {
        const logoSource = getLogoSource(station);

        if (!logoSource) {
            return null;
        }

        const image = await loadImage(logoSource);

        if (!image) {
            return null;
        }

        const paperDots = getPaperDots(
            settings.paperWidth
        );

        let logoWidthDots = mmToDots(
            settings.logoWidthMm
        );

        logoWidthDots = Math.min(
            paperDots,
            logoWidthDots
        );

        let logoHeightDots;

        if (settings.logoLockRatio) {
            logoHeightDots = Math.round(
                logoWidthDots *
                (image.naturalHeight / image.naturalWidth)
            );
        } else {
            logoHeightDots = mmToDots(
                settings.logoHeightMm
            );
        }

        logoHeightDots = Math.max(
            1,
            logoHeightDots
        );

        const freeSpace = Math.max(
            0,
            paperDots - logoWidthDots
        );

        const xPercent = Math.min(
            100,
            Math.max(
                0,
                Number(settings.logoXPercent)
            )
        );

        const leftDots = Math.round(
            freeSpace * (xPercent / 100)
        );

        /*
         * Canvas is the full printable width. Blank pixels provide
         * the requested horizontal position.
         */
        const canvas = document.createElement('canvas');

        canvas.width = paperDots;
        canvas.height = logoHeightDots;

        const context = canvas.getContext('2d', {
            willReadFrequently: true,
        });

        if (!context) {
            throw new Error('Unable to prepare receipt logo.');
        }

        context.fillStyle = '#ffffff';
        context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        /*
         * Since your logo is already black and white, disabling
         * smoothing helps preserve sharp edges.
         */
        context.imageSmoothingEnabled = false;

        context.drawImage(
            image,
            leftDots,
            0,
            logoWidthDots,
            logoHeightDots
        );

        return canvasToEscPosRaster(
            canvas,
            settings.logoThreshold
        );
    }

    function resolveEscPosSettings(formatSettings = {}) {
        const paperWidth = Number(
            formatSettings.paperWidth ||
            formatSettings.paperWidthMm ||
            58
        );

        /*
         * Map your existing receipt text-size slider to Font A/B.
         * Font B is smaller and generally prints lighter.
         */
        const receiptTextSize = Number(
            formatSettings.receiptTextSize ||
            formatSettings.baseTextSize ||
            formatSettings.textSize ||
            12
        );

        const explicitFont =
            formatSettings.escPosFont === 'B'
                ? 'B'
                : formatSettings.escPosFont === 'A'
                    ? 'A'
                    : null;

        const fontType =
            explicitFont ||
            (receiptTextSize <= 11 ? 'B' : 'A');

        return {
            paperWidth:
                paperWidth === 80 ? 80 : 58,

            sideMarginMm: Number(
                formatSettings.sideMarginMm ?? 2.5
            ),

            receiptTextSize,

            fontType,

            logoXPercent: Number(
                formatSettings.logoXPercent ??
                formatSettings.logoPosition ??
                50
            ),

            logoWidthMm: Number(
                formatSettings.logoWidthMm ?? 22
            ),

            logoHeightMm: Number(
                formatSettings.logoHeightMm ?? 25
            ),

            logoLockRatio: Boolean(
                formatSettings.logoLockRatio ??
                formatSettings.keepLogoRatio ??
                false
            ),

            logoThreshold: Number(
                formatSettings.logoThreshold ?? 180
            ),

            logoTopLines: Math.max(
                0,
                Math.round(
                    Number(
                        formatSettings.logoTopLines ?? 0
                    )
                )
            ),

            bottomFeedLines: Math.max(
                1,
                Math.round(
                    Number(
                        formatSettings.bottomFeedLines ?? 3
                    )
                )
            ),
        };
    }

    window.BillTemplates.register({
        id: 'IOCL_TOKHEIM',
        label: 'IOCL Tokheim',

        /*
         * Existing HTML preview/PDF renderer.
         */
        render(data) {
            const station = data.station || {};

            const {
                formattedBlock,
                renderLogoBlock,
                escapeHtml,
                randomFpId,
                randomNozzleNo,
            } = window.BillTemplates;

            const footer =
                data.footer ||
                '<center>Thank You! Please Visit Again..</center>';

            const logoBlock = renderLogoBlock(
                station,
                '<div class="classic-circle-logo"></div>'
            );

            const line = (label, value) => `
                <div
                    class="classic-line"
                    style="font-size:${TEXT_SCALE.fieldBlock}em;"
                >
                    <span
                        class="classic-label"
                        style="width:${TEXT_SCALE.labelColWidth}em;"
                    >${label}</span><span>:${escapeHtml(value)}</span>
                </div>
            `;

            const fuelName =
                FUEL_NAMES[data.product] ||
                data.productLabel ||
                data.product ||
                '';

            const preset =
                data.presetTypeLabel === 'Amount'
                    ? `Rs.${data.amount}`
                    : `${data.volume}L`;

            const dateTime = data.billDateTimeIso
                ? new Date(data.billDateTimeIso)
                : new Date();

            const dateString =
                `${pad2(dateTime.getDate())}/` +
                `${pad2(dateTime.getMonth() + 1)}/` +
                `${dateTime.getFullYear()}`;

            const timeString =
                `${pad2(dateTime.getHours())}:` +
                `${pad2(dateTime.getMinutes())}:` +
                `${pad2(dateTime.getSeconds())}`;

            return `
                ${logoBlock}

                ${formattedBlock(
                    station.name,
                    `font-size:${TEXT_SCALE.stationName}em;`
                )}

                ${
                    station.address
                        ? formattedBlock(
                            station.address,
                            `font-size:${TEXT_SCALE.addressPhone}em;`
                        )
                        : ''
                }

                ${
                    station.phone
                        ? `
                            <div
                                style="font-size:${TEXT_SCALE.addressPhone}em;"
                            >
                                PH. ${escapeHtml(station.phone)}
                            </div>
                        `
                        : ''
                }

                <div class="my-2"></div>

                ${line('Bill No', randomBillNo())}
                ${line('Trns.ID', randomTransactionId())}
                ${line('Atnd.ID', '')}
                ${line(
                    'Vehi.No',
                    data.vehicleNo || 'Not Entered'
                )}
                ${line('Date', dateString)}
                ${line('Time', timeString)}
                ${line('FP. ID', randomFpId())}
                ${line('Nozl No', randomNozzleNo())}
                ${line('Fuel', fuelName)}
                ${line(
                    'Density',
                    `${data.density}kg/m3`
                )}
                ${line('Preset', preset)}
                ${line('Rate', `Rs.${data.rate}`)}
                ${line('Sale', `Rs.${data.amount}`)}
                ${line('Volume', `${data.volume}L`)}

                ${
                    data.mobileNo
                        ? line('Mobile', data.mobileNo)
                        : ''
                }

                <div class="my-3"></div>

                <div style="font-size:${TEXT_SCALE.footer}em;">
                    ${formattedBlock(footer)}
                </div>
            `;
        },

        /*
         * Direct ESC/POS printer renderer.
         *
         * Returns Uint8Array. Your Capacitor Bluetooth printer
         * code must send these bytes directly to the printer.
         */
        async buildEscPos(data, formatSettings = {}) {
            const station = data.station || {};

            const {
                randomFpId,
                randomNozzleNo,
            } = window.BillTemplates;

            const settings =
                resolveEscPosSettings(formatSettings);

            const charactersPerLine =
                getCharactersPerLine(
                    settings.paperWidth,
                    settings.fontType
                );

            const marginCharacters = Math.max(
                0,
                Math.round(
                    (
                        settings.sideMarginMm /
                        settings.paperWidth
                    ) * charactersPerLine
                )
            );

            const contentWidth = Math.max(
                16,
                charactersPerLine -
                (marginCharacters * 2)
            );

            const margin = ' '.repeat(
                marginCharacters
            );

            const output = [];

            /*
             * ESC @ — reset/initialize printer.
             */
            output.push(
                command(ESC, 0x40)
            );

            /*
             * ESC E 0 — bold disabled.
             */
            output.push(
                command(ESC, 0x45, 0x00)
            );

            /*
             * GS ! 0 — normal width and height.
             */
            output.push(
                command(GS, 0x21, 0x00)
            );

            /*
             * ESC M:
             * 0 = Font A
             * 1 = Font B
             */
            output.push(
                command(
                    ESC,
                    0x4d,
                    settings.fontType === 'B'
                        ? 0x01
                        : 0x00
                )
            );

            /*
             * ESC 2 — default line spacing.
             */
            output.push(
                command(ESC, 0x32)
            );

            /*
             * Left alignment.
             */
            output.push(
                command(ESC, 0x61, 0x00)
            );

            for (
                let index = 0;
                index < settings.logoTopLines;
                index += 1
            ) {
                output.push(textLine());
            }

            /*
             * Print uploaded logo as a raster image.
             */
            try {
                const logoRaster = await buildLogoRaster(
                    station,
                    settings
                );

                if (logoRaster) {
                    output.push(logoRaster);
                    output.push(textLine());
                }
            } catch (error) {
                console.error(
                    'ESC/POS logo error:',
                    error
                );
            }

            function addLine(value = '') {
                output.push(
                    textLine(`${margin}${safeText(value)}`)
                );
            }

            function addWrapped(value) {
                const lines = wrapText(
                    stripHtml(value),
                    contentWidth
                );

                for (const line of lines) {
                    addLine(line);
                }
            }

            function addField(label, value) {
                const lines = makeFieldLines(
                    label,
                    safeText(value),
                    contentWidth
                );

                for (const line of lines) {
                    addLine(line);
                }
            }

            if (station.name) {
                addWrapped(station.name);
            }

            if (station.address) {
                addWrapped(station.address);
            }

            if (station.phone) {
                addWrapped(`PH. ${station.phone}`);
            }

            addLine();

            const fuelName =
                FUEL_NAMES[data.product] ||
                data.productLabel ||
                data.product ||
                '';

            const preset =
                data.presetTypeLabel === 'Amount'
                    ? `Rs.${safeText(data.amount)}`
                    : `${safeText(data.volume)}L`;

            const dateTime = data.billDateTimeIso
                ? new Date(data.billDateTimeIso)
                : new Date();

            const dateString =
                `${pad2(dateTime.getDate())}/` +
                `${pad2(dateTime.getMonth() + 1)}/` +
                `${dateTime.getFullYear()}`;

            const timeString =
                `${pad2(dateTime.getHours())}:` +
                `${pad2(dateTime.getMinutes())}:` +
                `${pad2(dateTime.getSeconds())}`;

            addField('Bill No', randomBillNo());
            addField('Trns.ID', randomTransactionId());
            addField('Atnd.ID', '');
            addField(
                'Vehi.No',
                data.vehicleNo || 'Not Entered'
            );
            addField('Date', dateString);
            addField('Time', timeString);
            addField('FP. ID', randomFpId());
            addField('Nozl No', randomNozzleNo());
            addField('Fuel', fuelName);
            addField(
                'Density',
                `${safeText(data.density)}kg/m3`
            );
            addField('Preset', preset);
            addField(
                'Rate',
                `Rs.${safeText(data.rate)}`
            );
            addField(
                'Sale',
                `Rs.${safeText(data.amount)}`
            );
            addField(
                'Volume',
                `${safeText(data.volume)}L`
            );

            if (data.mobileNo) {
                addField('Mobile', data.mobileNo);
            }

            addLine();

            /*
             * Centre footer.
             */
            output.push(
                command(ESC, 0x61, 0x01)
            );

            const footer = stripHtml(
                data.footer ||
                'Thank You! Please Visit Again..'
            );

            for (const footerLine of wrapText(
                footer,
                contentWidth
            )) {
                output.push(
                    textLine(footerLine)
                );
            }

            /*
             * Restore left alignment.
             */
            output.push(
                command(ESC, 0x61, 0x00)
            );

            for (
                let index = 0;
                index < settings.bottomFeedLines;
                index += 1
            ) {
                output.push(textLine());
            }

            return concatBytes(...output);
        },
    });
})();