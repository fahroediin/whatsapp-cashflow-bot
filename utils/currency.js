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

/**
 * Membuat baris tabel teks untuk laporan keuangan.
 * @param {string} kategori Nama kategori.
 * @param {number} nominal Jumlah nominal.
 * @param {string|null} catatan Catatan transaksi.
 * @param {string|null} tanggalString String tanggal dari database.
 * @param {'time'|'date'|'full'} format Tipe format waktu yang ditampilkan.
 * @returns {string} Baris teks yang sudah diformat.
 */
function createTableRow(kategori, nominal, catatan, tanggalString, format = 'time') {
    const KATEGORI_WIDTH = 12;
    const NOMINAL_WIDTH = 15;
    let datePrefix = '';

    if (tanggalString) {
        const dateObj = new Date(tanggalString);
        if (format === 'time') {
            // Format hanya waktu: HH:mm
            datePrefix = `[${dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}] `;
        } else if (format === 'date') {
            // Format tanggal pendek: DD/MM
            datePrefix = `[${dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })}] `;
        }
    }
    
    let kategoriCol = kategori.length > KATEGORI_WIDTH ? kategori.substring(0, KATEGORI_WIDTH - 1) + '…' : kategori;
    let nominalCol = formatCurrency(nominal);
    
    // Gabungkan prefix tanggal dengan kategori, lalu ratakan
    let leftCol = `${datePrefix}${kategoriCol}`.padEnd(KATEGORI_WIDTH + (datePrefix ? 8 : 0));
    
    nominalCol = nominalCol.padEnd(NOMINAL_WIDTH);

    return `${leftCol}${nominalCol}${catatan || ''}`;
}

module.exports = { formatCurrency, parseNominal, createTableRow };