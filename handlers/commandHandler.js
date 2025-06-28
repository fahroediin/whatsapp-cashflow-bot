// handlers/commandHandler.js
const supabase = require('../supabaseClient');
const { formatCurrency, createTableRow } = require('../utils/currency');
const { logActivity, findOrCreateUser } = require('../utils/db');

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

// Cek Keuangan
async function handleCekKeuangan(msg, user, parts, originalMessage) {
    const periode = parts[1];
    if (!periode) {
        await logActivity(user.id, msg.from, 'Gagal Cek Laporan', `Periode tidak diisi. Pesan: "${originalMessage}"`);
        msg.reply("🤔 Formatnya kurang tepat. Gunakan: `cek [periode]`\nContoh: `cek harian`");
        return;
    }

    const now = new Date();
    let startDate, endDate;
    let reportTitle = `Laporan Keuangan ${periode.charAt(0).toUpperCase() + periode.slice(1)}`;

    const monthMap = {
        januari: 0, feb: 1, februari: 1, mar: 2, maret: 2, apr: 3, april: 3,
        mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, agu: 7, agustus: 7,
        sep: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, des: 11, desember: 11
    };
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];


    switch (periode) {
        case 'harian':
            // --- START PERBAIKAN KEMBALI KE DASAR ---
            
            // 1. Tentukan awal dan akhir hari ini secara lokal
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);

            // 2. Tentukan awal bulan ini untuk kalkulasi saldo
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);

            // 3. Ambil transaksi BULAN INI untuk saldo
            const { data: monthlyTransactions, error: balanceError } = await supabase
                .from('transaksi')
                .select(`nominal, kategori (tipe)`)
                .eq('id_user', user.id)
                .gte('tanggal', startOfMonth.toISOString())
                .lte('tanggal', endOfToday.toISOString());

            if (balanceError) {
                await logActivity(user.id, msg.from, 'Error Cek Saldo Bulanan', balanceError.message);
                msg.reply("Gagal menghitung saldo bulanan.");
                return;
            }

            let totalPemasukanBulanIni = 0, totalPengeluaranBulanIni = 0;
            monthlyTransactions.forEach(t => {
                if (t.kategori.tipe === 'INCOME') totalPemasukanBulanIni += t.nominal;
                else totalPengeluaranBulanIni += t.nominal;
            });
            const saldoBulanIni = totalPemasukanBulanIni - totalPengeluaranBulanIni;
            
            // 4. Ambil transaksi HARI INI SAJA untuk rincian
            const { data: dailyTransactions, error: dailyError } = await supabase
                .from('transaksi')
                .select(`nominal, catatan, kategori (nama_kategori, tipe)`)
                .eq('id_user', user.id)
                .gte('tanggal', startOfToday.toISOString())
                .lte('tanggal', endOfToday.toISOString())
                .order('tanggal', { ascending: false });

            // --- END PERBAIKAN ---

            if (dailyError) {
                await logActivity(user.id, msg.from, 'Error Cek Laporan Harian', dailyError.message);
                msg.reply("Gagal mengambil data laporan harian.");
                return;
            }

            if (dailyTransactions.length === 0) {
                msg.reply(`Tidak ada transaksi hari ini. 😊\n\nSaldo Anda bulan ini adalah *${formatCurrency(saldoBulanIni)}*`);
                return;
            }

            let totalPemasukanHarian = 0;
            let totalPengeluaranHarian = 0;
            const incomeDetailsDaily = [], expenseDetailsDaily = [];

            dailyTransactions.forEach(t => {
                const rowText = createTableRow(t.kategori.nama_kategori, t.nominal, t.catatan);
                if (t.kategori.tipe === 'INCOME') {
                    totalPemasukanHarian += t.nominal;
                    incomeDetailsDaily.push(rowText);
                } else {
                    totalPengeluaranHarian += t.nominal;
                    expenseDetailsDaily.push(rowText);
                }
            });

            let reportTextHarian = `📊 *Laporan Harian & Saldo Bulan Ini*\n\n` +
                             `📥 *Total Pemasukan (Bulan Ini):*\n   ${formatCurrency(totalPemasukanBulanIni)}\n\n` +
                             `📤 *Total Pengeluaran (Bulan Ini):*\n   ${formatCurrency(totalPengeluaranBulanIni)}\n\n` +
                             `--------------------\n` +
                             `✨ *Saldo Akhir (Bulan Ini):*\n   *${formatCurrency(saldoBulanIni)}*\n` +
                             `--------------------\n\n`;

            if (totalPemasukanHarian > 0) {
                reportTextHarian += `📥 *Total Pemasukan Hari Ini:*\n   *${formatCurrency(totalPemasukanHarian)}*\n`;
            }
            if (totalPengeluaranHarian > 0) {
                reportTextHarian += `📤 *Total Pengeluaran Hari Ini:*\n   *${formatCurrency(totalPengeluaranHarian)}*\n`;
            }
            
            if (incomeDetailsDaily.length > 0) { reportTextHarian += `\n*RINCIAN HARI INI (Pemasukan)* 📥\n` + "```\n" + incomeDetailsDaily.join('\n') + "\n```"; }
            if (expenseDetailsDaily.length > 0) { reportTextHarian += `\n*RINCIAN HARI INI (Pengeluaran)* 📤\n` + "```\n" + expenseDetailsDaily.join('\n') + "\n```"; }
            
            msg.reply(reportTextHarian);
            return;

        case 'mingguan':
            startDate = new Date(now);
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Senin sebagai awal minggu
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);

            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;

        case 'bulanan':
            const monthArg = parts[2];
            const yearArg = parts[3] ? parseInt(parts[3], 10) : now.getFullYear();
            let targetYear = isNaN(yearArg) ? now.getFullYear() : yearArg;
            let targetMonth;

            if (monthArg) {
                if (!isNaN(monthArg) && monthArg >= 1 && monthArg <= 12) {
                    targetMonth = monthArg - 1;
                } else {
                    targetMonth = monthMap[monthArg.toLowerCase()];
                }
                if (targetMonth === undefined) {
                    msg.reply(`❌ Bulan "${monthArg}" tidak valid.`);
                    return;
                }
                startDate = new Date(targetYear, targetMonth, 1);
                endDate = new Date(targetYear, targetMonth + 1, 0); // Ambil hari terakhir di bulan tsb
            } else {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            }
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            reportTitle = `Laporan Bulanan (${monthNames[startDate.getMonth()]} ${startDate.getFullYear()})`;
            break;

        case 'tahunan':
            const targetAnnualYear = parts[2] ? parseInt(parts[2], 10) : now.getFullYear();
            if (isNaN(targetAnnualYear)) {
                msg.reply(`❌ Format tahun "${parts[2]}" tidak valid.`);
                return;
            }
            startDate = new Date(targetAnnualYear, 0, 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(targetAnnualYear, 11, 31);
            endDate.setHours(23, 59, 59, 999);
            reportTitle = `Laporan Tahunan (${targetAnnualYear})`;
            break;

        default:
            await logActivity(user.id, msg.from, 'Gagal Cek Laporan', `Periode tidak valid: ${periode}.`);
            msg.reply(`❌ Periode "${periode}" tidak valid. Pilih antara: *harian, mingguan, bulanan, tahunan*.`);
            return;
    }
    
    const { data: transactions, error } = await supabase
        .from('transaksi')
        .select(`nominal, catatan, kategori (nama_kategori, tipe)`)
        .eq('id_user', user.id)
        .gte('tanggal', startDate.toISOString())
        .lte('tanggal', endDate.toISOString())
        .order('tanggal', { ascending: false });

    if (error) { 
        await logActivity(user.id, msg.from, 'Error Cek Laporan', error.message); 
        console.error("Error fetching transactions:", error); 
        msg.reply("Gagal mengambil data laporan."); 
        return; 
    }
    
    await logActivity(user.id, msg.from, 'Cek Laporan', `Periode: ${periode}`);
    if (transactions.length === 0) { 
        await logActivity(user.id, msg.from, 'Info Cek Laporan', `Tidak ada transaksi untuk periode ${periode}`);
        msg.reply(`Tidak ada transaksi yang tercatat untuk periode ${reportTitle}. 😊`); 
        return; 
    }

    let totalPemasukan = 0, totalPengeluaran = 0;
    const incomeDetails = [], expenseDetails = [];
    transactions.forEach(t => {
        const rowText = createTableRow(t.kategori.nama_kategori, t.nominal, t.catatan);
        if (t.kategori.tipe === 'INCOME') { 
            totalPemasukan += t.nominal; 
            incomeDetails.push(rowText); 
        } else { 
            totalPengeluaran += t.nominal; 
            expenseDetails.push(rowText); 
        }
    });
    const sisaUangPeriode = totalPemasukan - totalPengeluaran;
    
    let reportText = `📊 *${reportTitle}*\n\n` +
                     `📥 *Total Pemasukan (Periode Ini):*\n   ${formatCurrency(totalPemasukan)}\n\n` +
                     `📤 *Total Pengeluaran (Periode Ini):*\n   ${formatCurrency(totalPengeluaran)}\n\n` +
                     `--------------------\n` +
                     `✨ *Selisih (Periode Ini):*\n   *${formatCurrency(sisaUangPeriode)}*\n` +
                     `--------------------\n`;
    if (incomeDetails.length > 0) { reportText += `\n*RINCIAN PEMASUKAN* 📥\n` + "```\n" + incomeDetails.join('\n') + "\n```"; }
    if (expenseDetails.length > 0) { reportText += `\n*RINCIAN PENGELUARAN* 📤\n` + "```\n" + expenseDetails.join('\n') + "\n```"; }
    msg.reply(reportText);
}

// Edit (Tidak ada perubahan)
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

// Hapus (Tidak ada perubahan)
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

// Reset (Tidak ada perubahan)
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