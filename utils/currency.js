// utils/currency.js

const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

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

/**
 * Membuat baris tabel teks untuk laporan keuangan.
 * @param {string} kategori Nama kategori.
 * @param {number} nominal Jumlah nominal.
 * @param {string|null} catatan Catatan transaksi.
 * @param {string|null} tanggalString String tanggal dari database.
 * @param {'time'|'date'} format Tipe format waktu yang ditampilkan.
 * @returns {string} Baris teks yang sudah diformat.
 */
function createTableRow(kategori, nominal, catatan, tanggalString, format = 'time') {
    const KATEGORI_WIDTH = 12;
    const NOMINAL_WIDTH = 15;
    let datePrefix = '';

    if (tanggalString) {
        // Pisahkan tanggal dan waktu dari string, misal: "2025-06-28 02:14:19.784757+07"
        const [datePart, timePartWithOffset] = tanggalString.split(' ');

        if (format === 'time' && timePartWithOffset) {
            // Ambil 5 karakter pertama dari bagian waktu (HH:mm)
            const time = timePartWithOffset.substring(0, 5);
            datePrefix = `[${time}] `;
        } else if (format === 'date' && datePart) {
            // Ambil bagian tanggal, pisahkan, dan format ulang ke DD/MM
            const [year, month, day] = datePart.split('-');
            datePrefix = `[${day}/${month}] `;
        }
    }
    
    let kategoriCol = kategori.length > KATEGORI_WIDTH ? kategori.substring(0, KATEGORI_WIDTH - 1) + '…' : kategori;
    let nominalCol = formatCurrency(nominal);
    
    // Gabungkan prefix tanggal dengan kategori, lalu ratakan
    // [HH:mm] = 7 chars, [DD/MM] = 7 chars.
    let leftCol = `${datePrefix}${kategoriCol}`.padEnd(KATEGORI_WIDTH + (datePrefix ? 7 : 0));
    
    nominalCol = nominalCol.padEnd(NOMINAL_WIDTH);

    return `${leftCol}${nominalCol}${catatan || ''}`;
}

module.exports = { formatCurrency, parseNominal, createTableRow };