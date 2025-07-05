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
        const dateObj = new Date(tanggalString);
        if (format === 'time') {
            // Format HANYA WAKTU: [HH:mm]
            const time = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            datePrefix = `[${time}] `;
        } else if (format === 'date') {
            // Format HANYA TANGGAL: [DD/MM]
            const date = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jakarta' });
            datePrefix = `[${date}] `;
        }
    }
    
    // Kolom kiri (Tanggal + Kategori)
    let leftCol = `${datePrefix}${kategori}`;
    leftCol = leftCol.padEnd(KATEGORI_WIDTH + 8); // 8 untuk [HH:mm] atau [DD/MM] + spasi

    // Kolom tengah (Nominal)
    let nominalCol = formatCurrency(nominal).padEnd(NOMINAL_WIDTH);

    return `${leftCol}${nominalCol}${catatan || ''}`;
}

module.exports = { formatCurrency, parseNominal, createTableRow };