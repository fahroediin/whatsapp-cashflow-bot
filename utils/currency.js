// utils/currency.js

const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

/**
 * Mengubah string nominal yang fleksibel (e.g., "50.000", "50rb", "1.5jt", "1,9juta") menjadi angka integer.
 * @param {string} nominalStr String nominal dari input user.
 * @returns {number|null} Angka integer jika valid, atau null jika tidak valid.
 */
function parseNominal(nominalStr) {
    if (!nominalStr) return null;

    try {
        let str = nominalStr.toLowerCase().trim();
        let multiplier = 1;

        if (str.includes('juta') || str.includes('jt')) {
            multiplier = 1000000;
            str = str.replace(/juta|jt/g, '').trim();
        } else if (str.includes('ribu') || str.includes('rb') || str.includes('k')) {
            multiplier = 1000;
            str = str.replace(/ribu|rb|k/g, '').trim();
        }

        str = str.replace(',', '.');

        const dotCount = (str.match(/\./g) || []).length;
        if (dotCount > 1) {
            str = str.replace(/\./g, '');
        }

        const value = parseFloat(str);
        if (isNaN(value)) {
            return null;
        }

        return Math.round(value * multiplier);

    } catch (error) {
        console.error("Error parsing nominal:", error);
        return null;
    }
}

function createTableRow(kategori, nominal, catatan) {
    const KATEGORI_WIDTH = 12;
    const NOMINAL_WIDTH = 15;
    let kategoriCol = kategori.length > KATEGORI_WIDTH ? kategori.substring(0, KATEGORI_WIDTH - 1) + '…' : kategori;
    let nominalCol = formatCurrency(nominal);
    kategoriCol = kategoriCol.padEnd(KATEGORI_WIDTH);
    nominalCol = nominalCol.padEnd(NOMINAL_WIDTH);
    return `${kategoriCol}${nominalCol}${catatan || ''}`;
}

module.exports = { formatCurrency, parseNominal, createTableRow };