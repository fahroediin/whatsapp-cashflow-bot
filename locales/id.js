// locales/id.js (Diperbaiki & Dilengkapi)
module.exports = {
    GREETING: "Halo {userName}! 👋\n\nSaya adalah DuitQ, 🤖 bot pencatat keuangan pribadi Anda. Ketik *bantuan* untuk melihat semua perintah yang bisa saya lakukan?",
    HELP_TEXT: (userName, incomeCategories, expenseCategories) => `Halo ${userName}! 👋 Ini adalah daftar perintah yang bisa Anda gunakan:\n\n` +
        `*1. Mencatat Transaksi* 📝\n` +
        `Gunakan format: \`kategori nominal [catatan]\`\n` +
        `Contoh: \`makanan 15000 nasi padang\`\n\n` +
        `*2. Cek Laporan Keuangan* 📈\n` +
        `Gunakan format: \`cek [periode]\`\n` +
        `Contoh: \`cek harian\`\n` +
        `Periode: *harian, mingguan, bulanan, tahunan*\n\n` +
        `*3. Ubah Transaksi Terakhir* ✏️\n` +
        `Ketik: \`edit\` atau \`ubah\`\n\n` +
        `*4. Atur Bahasa* 🌐\n` +
        `Ketik: \`set lang en\` atau \`set lang id\`\n\n` +
        `---\n\n` +
        `*KATEGORI PEMASUKAN* 📥\n${incomeCategories}\n\n` +
        `*KATEGORI PENGELUARAN* 📤\n${expenseCategories}`,
    TRANSACTION_SUCCESS: (tipeText, kategoriNama, nominal, catatan) => `✅ *Transaksi Berhasil Dicatat!*\n\n` +
        `*Tipe:* ${tipeText}\n` +
        `*Kategori:* ${kategoriNama}\n` +
        `*Nominal:* ${nominal}\n` +
        `*Catatan:* ${catatan || '-'}`,
    EDIT_SUCCESS: "✅ Transaksi berhasil diubah!",
    EDIT_START: (kategori, nominal, catatan) => `Transaksi terakhir yang akan diubah:\n\n` +
        `*Kategori:* ${kategori}\n` +
        `*Nominal:* ${nominal}\n` +
        `*Catatan:* ${catatan || '-'}\n\n` +
        `Apa yang ingin Anda ubah?\n1. Nominal\n2. Catatan\n3. Keduanya\n\n` +
        `Kirim angka pilihan Anda (1/2/3). Ketik *batal* untuk membatalkan.`,
    EDIT_NO_TX: "Tidak ada transaksi terakhir yang bisa diubah. 🤔",
    REPORT_TITLE: "📊 *Laporan Keuangan {period}*",
    REPORT_SUMMARY: (totalIncome, totalExpense, finalBalance) => `📥 *Total Pemasukan:*\n   ${totalIncome}\n\n` + `📤 *Total Pengeluaran:*\n   ${totalExpense}\n\n` + `--------------------\n` + `✨ *Saldo Akhir:*\n   *${finalBalance}*\n` + `--------------------\n`,
    REPORT_NO_TX: "Tidak ada transaksi yang tercatat untuk periode {period} ini. 😊",
    REPORT_INCOME_DETAILS: "*RINCIAN PEMASUKAN* 📥",
    REPORT_EXPENSE_DETAILS: "*RINCIAN PENGELUARAN* 📤",
    LANGUAGE_SET: "Bahasa berhasil diubah ke Bahasa Indonesia. 🇮🇩",
    // Errors and validations
    ERROR_UNKNOWN_COMMAND: "🤔 Perintah tidak dikenali. Ketik *bantuan* untuk melihat daftar perintah.",
    ERROR_INVALID_NOMINAL: "❌ Nominal tidak valid. Harap masukkan angka saja.",
    ERROR_CATEGORY_NOT_FOUND: "❓ Kategori \"{categoryName}\" tidak ditemukan. Cek kembali daftar kategori di menu *bantuan*.",
    ERROR_INSUFFICIENT_BALANCE: (effectiveBalance, newNominal) => `⚠️ *Transaksi Gagal!*\n\nSaldo Anda tidak mencukupi.\n\n` + `💰 Saldo Saat Ini: *${effectiveBalance}*\n💸 Pengeluaran: *${newNominal}*`,
    ERROR_EDIT_INSUFFICIENT_BALANCE: (effectiveBalance, newNominal) => `⚠️ *Edit Gagal!*\nSaldo tidak mencukupi untuk nominal baru.\n\n`+ `Saldo Efektif: *${effectiveBalance}*\n` + `Nominal Baru: *${newNominal}*`,
    ERROR_INTERNAL: "🤖💥 Maaf, sepertinya terjadi sedikit gangguan teknis di sistem saya. Silakan coba beberapa saat lagi.",
    ERROR_INVALID_PERIOD: "❌ Periode \"{period}\" tidak valid. Pilih antara: harian, mingguan, bulanan, tahunan.",
    ERROR_PERIOD_NOT_SPECIFIED: "🤔 Formatnya kurang tepat. Gunakan: `cek [periode]`\nContoh: `cek harian`",
    ERROR_INVALID_EDIT_CHOICE: "Pilihan tidak valid. Harap kirim angka 1, 2, atau 3. Ketik *batal* untuk membatalkan.",
    ERROR_LANGUAGE_NOT_SUPPORTED: "Bahasa tidak didukung. Pilihan tersedia: `id`, `en`."
};