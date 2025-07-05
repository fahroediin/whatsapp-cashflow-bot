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
 * Membuat entri rincian bergaya pohon untuk laporan keuangan, sesuai format yang diminta.
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
            // Format HANYA WAKTU: [HH:mm]
            const time = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            datePrefix = `[${time}] `;
        } else if (format === 'date') {
            // Format HANYA TANGGAL: [DD/MM]
            const date = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jakarta' });
            datePrefix = `[${date}] `;
        }
    }
    
    // Baris utama dengan tanggal dan kategori
    const mainLine = `${datePrefix}${kategori}`;
    const formattedNominal = formatCurrency(nominal);

    if (catatan && catatan.trim() !== '') {
        // Jika ada catatan, buat struktur dua cabang seperti di gambar
        // Karakter '├' dan '└' akan membentuk struktur pohon di font monospace (seperti di WA)
        const nominalLine = `  ├─ ${formattedNominal}`;
        const catatanLine = `  └─ ${catatan}`;
        return `${mainLine}\n${nominalLine}\n${catatanLine}`;
    } else {
        // Jika tidak ada catatan, buat struktur satu cabang untuk nominal
        const nominalLine = `  └─ ${formattedNominal}`;
        return `${mainLine}\n${nominalLine}`;
    }
}

module.exports = { formatCurrency, parseNominal, createTableRow };