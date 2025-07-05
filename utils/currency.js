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
 * Membuat entri rincian bergaya pohon untuk laporan keuangan.
 * @param {string} kategori Nama kategori.
 * @param {number} nominal Jumlah nominal.
 * @param {string|null} catatan Catatan transaksi.
 * @param {string|null} tanggalString String tanggal dari database.
 * @param {'time'|'date'} format Tipe format waktu yang ditampilkan.
 * @returns {string} String multi-baris yang sudah diformat.
 */
function createTableRow(kategori, nominal, catatan, tanggalString, format = 'time') {
    let datePrefix = '';

    if (tanggalString) {
        const dateObj = new Date(tanggalString);
        if (format === 'time') {
            const time = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            datePrefix = `[${time}] `;
        } else if (format === 'date') {
            // === PERUBAHAN DI SINI ===
            // Format tanggal secara manual untuk memastikan hasilnya selalu DD/MM
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // getMonth() adalah 0-indexed, jadi +1
            datePrefix = `[${day}/${month}] `;
        }
    }
    
    const mainLine = `${datePrefix}${kategori}`;
    const formattedNominal = formatCurrency(nominal);

    if (catatan && catatan.trim() !== '') {
        const nominalLine = `  ├─ ${formattedNominal}`;
        const catatanLine = `  └─ ${catatan}`;
        return `${mainLine}\n${nominalLine}\n${catatanLine}`;
    } else {
        const nominalLine = `  └─ ${formattedNominal}`;
        return `${mainLine}\n${nominalLine}`;
    }
}

module.exports = { formatCurrency, parseNominal, createTableRow };