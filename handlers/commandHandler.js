// handlers/commandHandler.js (Versi Final dengan Timezone yang Benar & Tanpa Library)
const supabase = require('../supabaseClient');
const { formatCurrency, createTableRow } = require('../utils/currency');
const { logActivity, findOrCreateUser } = require('../utils/db');

// --- Fungsi Helper untuk mendapatkan bagian tanggal di zona waktu tertentu ---
function getLocalDateParts(date, timeZone) {
    // Gunakan Intl.DateTimeFormat untuk mengekstrak bagian tanggal dengan andal
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(date);

    const year = parseInt(parts.find(p => p.type === 'year').value, 10);
    const month = parseInt(parts.find(p => p.type === 'month').value, 10) - 1; // getMonth() adalah 0-indexed
    const day = parseInt(parts.find(p => p.type === 'day').value, 10);

    return { year, month, day };
}

// Bantuan (Tidak ada perubahan)
async function handleBantuan(msg, userName) {
    const { data: categories, error } = await supabase.from('kategori').select('nama_kategori, tipe');
    if (error) { 
        const user = await findOrCreateUser(msg.from, userName);
        await logActivity(user.id, msg.from, 'Error Bantuan', `Gagal fetch kategori: ${error.message}`);
        console.error("Error fetching categories:", error); 
        msg.reply("Maaf, gagal memuat daftar kategori."); 
        return; 
    }
    
    const incomeCategories = categories.filter(c => c.tipe === 'INCOME').map(c => `  - ${c.nama_kategori}`).join('\n');
    const expenseCategories = categories.filter(c => c.tipe === 'EXPENSE').map(c => `  - ${c.nama_kategori}`).join('\n');
    
    const helpText = `Halo ${userName}! 👋 Ini adalah daftar perintah yang bisa Anda gunakan:\n\n` +
                     `*1. Mencatat Transaksi* 📝\n` +
                     `Gunakan format: \`kategori nominal [catatan]\`\n` +
                     `Contoh:\n`+
                     `  • \`makanan 15000 nasi padang\`\n`+
                     `  • \`gaji 5jt\` atau \`gaji 1,5jt\`\n`+
                     `  • \`jajan 12.500\` atau \`jajan 12,5k\`\n\n` +
                     `*2. Cek Laporan Keuangan* 📈\n` +
                     `Gunakan format: \`cek [periode] [opsi]\`\n` +
                     `Periode: \`harian\`, \`mingguan\`, \`bulanan\`, \`tahunan\`\n` +
                     `Contoh:\n` +
                     `  • \`cek harian\`\n` +
                     `  • \`cek bulanan mei 2024\`\n\n` +
                     `*3. Ubah Transaksi Terakhir* ✏️\n` +
                     `Ketik: \`edit\` atau \`ubah\`\n\n` +
                     `*4. Hapus Transaksi* 🗑️\n` +
                     `Ketik: \`hapus\` untuk memilih transaksi bulan ini yang akan dihapus.\n\n` +
                     `*5. Reset Semua Data* ⚠️\n` +
                     `Ketik: \`reset\` untuk menghapus *SEMUA* data transaksi Anda secara permanen. Gunakan dengan sangat hati-hati!\n\n` +
                     `---\n\n` +
                     `*KATEGORI PEMASUKAN* 📥\n${incomeCategories}\n\n` +
                     `*KATEGORI PENGELUARAN* 📤\n${expenseCategories}`;
    
    msg.reply(helpText);
}


// Cek Keuangan (Versi Revisi Final)
async function handleCekKeuangan(msg, user, parts, originalMessage) {
    const periode = parts[1];
    if (!periode) {
        await logActivity(user.id, msg.from, 'Gagal Cek Laporan', `Periode tidak diisi. Pesan: "${originalMessage}"`);
        msg.reply("🤔 Formatnya kurang tepat. Gunakan: `cek [periode]`\nContoh: `cek harian`");
        return;
    }

    const monthMap = {
        januari: 0, feb: 1, februari: 1, mar: 2, maret: 2, apr: 3, april: 3,
        mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, agu: 7, agustus: 7,
        sep: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, des: 11, desember: 11
    };
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    // Fungsi helper lokal untuk format tanggal ke YYYY-MM-DD HH:MM:SS
    function toSupabaseTimestamp(date) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    const now = new Date();
    let startDate, endDate, reportTitle, dateFormatType = 'date';
    
    if (periode === 'harian') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        reportTitle = `Laporan Harian (${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})`;
    } else if (periode === 'mingguan') {
        const dayOfWeek = now.getDay();
        const firstDayOfWeek = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(now.getFullYear(), now.getMonth(), firstDayOfWeek, 0, 0, 0, 0);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6, 23, 59, 59, 999);
        reportTitle = "Laporan Mingguan";
    } else if (periode === 'bulanan') {
        const monthArg = parts[2];
        const yearArg = parts[3] ? parseInt(parts[3], 10) : now.getFullYear();
        let targetYear = isNaN(yearArg) ? now.getFullYear() : yearArg;
        let targetMonth = monthArg ? (!isNaN(monthArg) && monthArg >= 1 && monthArg <= 12 ? monthArg - 1 : monthMap[monthArg.toLowerCase()]) : now.getMonth();
        if (targetMonth === undefined) { msg.reply(`❌ Bulan "${monthArg}" tidak valid.`); return; }
        startDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
        endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
        reportTitle = `Laporan Bulanan (${monthNames[startDate.getMonth()]} ${startDate.getFullYear()})`;
    } else if (periode === 'tahunan') {
        const targetAnnualYear = parts[2] ? parseInt(parts[2], 10) : now.getFullYear();
        if (isNaN(targetAnnualYear)) { msg.reply(`❌ Format tahun "${parts[2]}" tidak valid.`); return; }
        startDate = new Date(targetAnnualYear, 0, 1, 0, 0, 0, 0);
        endDate = new Date(targetAnnualYear, 11, 31, 23, 59, 59, 999);
        reportTitle = `Laporan Tahunan (${targetAnnualYear})`;
    } else {
        await logActivity(user.id, msg.from, 'Gagal Cek Laporan', `Periode tidak valid: ${periode}.`);
        msg.reply(`❌ Periode "${periode}" tidak valid. Pilih antara: *harian, mingguan, bulanan, tahunan*.`);
        return;
    }
    
    // --- LAPORAN DENGAN SALDO ---
    const { data: userData, error: userError } = await supabase.from('users').select('saldo').eq('id', user.id).single();
    if (userError) {
        msg.reply("Gagal mengambil data saldo Anda.");
        return;
    }
    const totalSaldo = userData.saldo || 0;

    // --- PERUBAHAN UTAMA: Panggil RPC Function ---
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_transactions_by_period', {
        user_id_param: user.id,
        start_date_param: toSupabaseTimestamp(startDate),
        end_date_param: toSupabaseTimestamp(endDate)
    });

    if (rpcError) { 
        await logActivity(user.id, msg.from, 'Error Cek Laporan (RPC)', rpcError.message); 
        console.error("Supabase RPC error:", rpcError);
        msg.reply("Gagal mengambil data laporan (RPC)."); 
        return; 
    }
    
    // Data dari RPC perlu sedikit diubah formatnya agar sama seperti SELECT biasa
    const transactions = rpcData.map(t => ({
        tanggal: t.tanggal,
        nominal: t.nominal,
        catatan: t.catatan,
        kategori: {
            nama_kategori: t.kategori_nama,
            tipe: t.kategori_tipe
        }
    }));
    
    let totalPemasukanPeriode = 0, totalPengeluaranPeriode = 0;
    const incomeDetails = [], expenseDetails = [];
    transactions.forEach(t => {
        const rowText = createTableRow(t.kategori.nama_kategori, t.nominal, t.catatan, t.tanggal, dateFormatType);
        if (t.kategori.tipe === 'INCOME') { 
            totalPemasukanPeriode += t.nominal; 
            incomeDetails.push(rowText); 
        } else { 
            totalPengeluaranPeriode += t.nominal; 
            expenseDetails.push(rowText); 
        }
    });

    const selisihPeriode = totalPemasukanPeriode - totalPengeluaranPeriode;

    let reportText = `📊 *${reportTitle}*\n\n` +
                    `📥 *Pemasukan (Periode Ini):*\n   ${formatCurrency(totalPemasukanPeriode)}\n\n` +
                    `📤 *Pengeluaran (Periode Ini):*\n   ${formatCurrency(totalPengeluaranPeriode)}\n\n` +
                    `--------------------\n` +
                    `✨ *Selisih (Periode Ini):*\n   *${formatCurrency(selisihPeriode)}*\n` +
                    `--------------------\n\n` +
                    `💰 *Saldo Anda:*\n   *${formatCurrency(totalSaldo)}*\n`;
    
    if (transactions.length > 0) {
        if (incomeDetails.length > 0) { reportText += `\n*RINCIAN PEMASUKAN* 📥\n` + "```\n" + incomeDetails.join('\n') + "\n```"; }
        if (expenseDetails.length > 0) { reportText += `\n*RINCIAN PENGELUARAN* 📤\n` + "```\n" + expenseDetails.join('\n') + "\n```"; }
    } else {
        reportText += `\n_Tidak ada transaksi pada periode ini._`;
    }

    msg.reply(reportText);
}

// ... sisa file tetap sama ...
async function handleEdit(msg, user, userState) {
    await logActivity(user.id, msg.from, 'Mulai Edit Transaksi', msg.body);
    
    const { data: lastTx, error } = await supabase
        .from('transaksi')
        .select('*, kategori(nama_kategori, tipe)')
        .eq('id_user', user.id)
        .order('tanggal', { ascending: false })
        .limit(1)
        .single();

    if (error || !lastTx) {
        await logActivity(user.id, msg.from, 'Gagal Edit', 'Tidak ada transaksi terakhir ditemukan.');
        msg.reply("Tidak ada transaksi terakhir yang bisa diubah. 🤔");
        return;
    }

    userState[msg.from] = {
        step: 'awaiting_edit_choice',
        data: {
            tx_id: lastTx.id,
            old_nominal: lastTx.nominal,
            kategori: lastTx.kategori.nama_kategori,
            tipe: lastTx.kategori.tipe
        }
    };
    
    await logActivity(user.id, msg.from, 'Proses Edit', 'Menampilkan pilihan edit (1/2/3)');
    const infoText = `Transaksi terakhir yang akan diubah:\n\n` +
                     `*Kategori:* ${lastTx.kategori.nama_kategori}\n` +
                     `*Nominal:* ${formatCurrency(lastTx.nominal)}\n` +
                     `*Catatan:* ${lastTx.catatan || '-'}\n\n` +
                     `Apa yang ingin Anda ubah?\n` +
                     `1. Nominal\n` +
                     `2. Catatan\n` +
                     `3. Keduanya\n\n` +
                     `Kirim angka pilihan Anda (1/2/3). Ketik *batal* untuk membatalkan.`;
    
    msg.reply(infoText);
}

async function handleHapus(msg, user, userState) {
    await logActivity(user.id, msg.from, 'Mulai Hapus Transaksi', msg.body);
    
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const { data: transactions, error } = await supabase
        .from('transaksi')
        .select(`id, tanggal, nominal, catatan, kategori (nama_kategori, tipe)`)
        .eq('id_user', user.id)
        .gte('tanggal', startDate.toISOString())
        .lte('tanggal', endDate.toISOString())
        .order('tanggal', { ascending: false });

    if (error) {
        await logActivity(user.id, msg.from, 'Error Hapus', `Gagal fetch tx: ${error.message}`);
        msg.reply("Maaf, gagal mengambil daftar transaksi. Coba lagi nanti.");
        return;
    }

    if (transactions.length === 0) {
        await logActivity(user.id, msg.from, 'Info Hapus', 'Tidak ada transaksi bulan ini');
        msg.reply("Tidak ada transaksi yang tercatat di bulan ini untuk dihapus.");
        return;
    }

    userState[msg.from] = {
        step: 'awaiting_delete_choice',
        transactions: transactions
    };

    let listText = "Pilih transaksi yang ingin Anda hapus dengan mengirimkan nomornya:\n\n";
    transactions.forEach((tx, index) => {
        const tgl = new Date(tx.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        const tipeEmoji = tx.kategori.tipe === 'INCOME' ? '📥' : '📤';
        listText += `*${index + 1}.* ${tipeEmoji} [${tgl}] ${tx.kategori.nama_kategori} - ${formatCurrency(tx.nominal)}\n`;
        if (tx.catatan) {
            listText += `   Catatan: _${tx.catatan}_\n`;
        }
    });

    listText += "\nKetik *batal* untuk membatalkan.";
    msg.reply(listText);
}

async function handleReset(msg, user, userState) {
    await logActivity(user.id, msg.from, 'Mulai Reset Data', msg.body);
    
    userState[msg.from] = {
        step: 'awaiting_reset_confirmation'
    };

    const warningText = `*PERINGATAN KERAS!* ⚠️\n\n` +
                        `Anda akan menghapus *SEMUA DATA TRANSAKSI* Anda secara permanen. Tindakan ini *TIDAK BISA DIBATALKAN*.\n\n` +
                        `Jika Anda benar-benar yakin, balas pesan ini dengan kata *YA*.\n\n` +
                        `Ketik *batal* atau kata lain untuk membatalkan.`;
    
    msg.reply(warningText);
}

module.exports = { handleBantuan, handleCekKeuangan, handleEdit, handleHapus, handleReset };