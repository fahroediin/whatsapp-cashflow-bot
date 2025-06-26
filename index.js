// index.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const supabase = require('./supabaseClient');

console.log("Inisialisasi DuitQ...");

const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

// --- STATE MANAGEMENT untuk Fitur Edit, Hapus, & Reset ---
const userState = {};

// --- PERBAIKAN: Fungsi parsing nominal yang lebih cerdas untuk desimal ---
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

        // Langkah 1: Deteksi dan pisahkan suffix, tentukan multiplier
        if (str.includes('juta') || str.includes('jt')) {
            multiplier = 1000000;
            str = str.replace(/juta|jt/g, '').trim();
        } else if (str.includes('ribu') || str.includes('rb') || str.includes('k')) {
            multiplier = 1000;
            str = str.replace(/ribu|rb|k/g, '').trim();
        }

        // Langkah 2: Normalisasi koma desimal menjadi titik
        str = str.replace(',', '.');

        // Langkah 3: Jika ada lebih dari satu titik, anggap semua adalah pemisah ribuan dan hapus
        const dotCount = (str.match(/\./g) || []).length;
        if (dotCount > 1) {
            str = str.replace(/\./g, '');
        }

        // Langkah 4: Parse sebagai float dan kalikan
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
// --- AKHIR PERBAIKAN ---

function createTableRow(kategori, nominal, catatan) {
    const KATEGORI_WIDTH = 12;
    const NOMINAL_WIDTH = 15;
    let kategoriCol = kategori.length > KATEGORI_WIDTH ? kategori.substring(0, KATEGORI_WIDTH - 1) + '…' : kategori;
    let nominalCol = formatCurrency(nominal);
    kategoriCol = kategoriCol.padEnd(KATEGORI_WIDTH);
    nominalCol = nominalCol.padEnd(NOMINAL_WIDTH);
    return `${kategoriCol}${nominalCol}${catatan || ''}`;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

client.on('qr', (qr) => console.log('QR Code diterima, scan dengan WhatsApp Anda:', qrcode.generate(qr, { small: true })));
client.on('ready', () => console.log('Client sudah siap dan terhubung ke WhatsApp!'));

async function logActivity(userId, userNumber, activity, details) {
    try {
        const { error } = await supabase.from('log_aktivitas').insert({
            id_user: userId, user_wa_number: userNumber, aktivitas: activity, detail: details
        });
        if (error) console.error('Gagal mencatat aktivitas log:', error.message);
    } catch (e) {
        console.error('Error dalam fungsi logActivity:', e.message);
    }
}

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (chat.isGroup || msg.isStatus) return;

    const contact = await msg.getContact();
    const userNumber = msg.from;
    const userName = contact.pushname || userNumber;
    const messageBody = msg.body.trim();

    try {
        const user = await findOrCreateUser(userNumber, userName);
        
        if (userState[userNumber]) {
            await handleInteractiveSteps(msg, user, userName);
            return;
        }

        const lowerCaseMessage = messageBody.toLowerCase();
        const parts = lowerCaseMessage.split(' ');
        const command = parts[0];

        if (command === 'batal') { 
            await logActivity(user.id, userNumber, 'Perintah Batal', 'Tidak ada sesi aktif.');
            msg.reply("Tidak ada sesi aktif untuk dibatalkan."); 
            return; 
        }

        switch (command) {
            case 'halo': case 'hai': case 'hi': case 'pagi': case 'siang': case 'malam':
                await logActivity(user.id, userNumber, 'Sapaan', messageBody);
                msg.reply(`Halo ${userName}! 👋\n\nSaya adalah DuitQ, 🤖 bot pencatat keuangan pribadi Anda. Ketik *bantuan* untuk melihat semua perintah yang bisa saya lakukan?`);
                break;
            case 'bantuan':
                await logActivity(user.id, userNumber, 'Minta Bantuan', messageBody);
                await handleBantuan(msg, userName);
                break;
            case 'cek':
                await handleCekKeuangan(msg, user, parts, messageBody);
                break;
            case 'edit':
            case 'ubah':
                await handleEdit(msg, user);
                break;
            case 'hapus':
                await handleHapus(msg, user);
                break;
            case 'reset':
                await handleReset(msg, user);
                break;
            default:
                await handleTransaksi(msg, user, messageBody);
                break;
        }
    } catch (error) {
        const userIdForLog = (await findOrCreateUser(userNumber, userName)).id;
        await logActivity(userIdForLog, userNumber, 'FATAL ERROR', error.message);
        console.error(`Error processing message from ${userNumber}:`, error);
        msg.reply("🤖💥 Maaf, sepertinya terjadi sedikit gangguan teknis di sistem saya. Silakan coba beberapa saat lagi.");
    }
});

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

async function handleReset(msg, user) {
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

async function handleHapus(msg, user) {
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

async function handleEdit(msg, user) {
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

async function handleInteractiveSteps(msg, user, userName) {
    const state = userState[msg.from];
    const messageBody = msg.body.trim();
    const userNumber = msg.from;

    if (messageBody.toLowerCase() === 'batal') {
        await logActivity(user.id, userNumber, 'Sesi Interaktif Dibatalkan', `Langkah: ${state.step}`);
        delete userState[userNumber];
        msg.reply("Oke, sesi dibatalkan. 👍");
        return;
    }

    switch (state.step) {
        case 'awaiting_reset_confirmation':
            if (messageBody.toLowerCase() !== 'ya') {
                await logActivity(user.id, userNumber, 'Reset Dibatalkan', `Input tidak sesuai: ${messageBody}`);
                delete userState[userNumber];
                msg.reply("Reset dibatalkan. Data Anda aman. 😊");
                return;
            }
            
            state.step = 'awaiting_final_reset_confirmation';
            const finalWarningText = `*KONFIRMASI AKHIR* ‼️\n\n` +
                                     `Ini adalah kesempatan terakhir Anda untuk membatalkan. ` +
                                     `Untuk melanjutkan, salin dan tempel (copy-paste) atau ketik teks di bawah ini *persis* tanpa tanda kutip:\n\n` +
                                     `\`\`\`reset data saya sekarang\`\`\`\n\n` +
                                     `Salah ketik akan membatalkan proses ini.`;
            await logActivity(user.id, userNumber, 'Proses Reset', 'Meminta konfirmasi final.');
            msg.reply(finalWarningText);
            break;

        case 'awaiting_final_reset_confirmation':
            if (messageBody.toLowerCase() !== 'reset data saya sekarang') {
                await logActivity(user.id, userNumber, 'Reset Dibatalkan (Final)', `Input tidak sesuai: ${messageBody}`);
                delete userState[userNumber];
                msg.reply("Reset dibatalkan. Data Anda tetap aman. Fiuh! 😮‍💨");
                return;
            }

            await logActivity(user.id, userNumber, 'Eksekusi Reset', 'Menghapus semua transaksi pengguna.');
            const { error: deleteError } = await supabase
                .from('transaksi')
                .delete()
                .eq('id_user', user.id);

            if (deleteError) {
                await logActivity(user.id, userNumber, 'Error Reset Data', deleteError.message);
                msg.reply("Maaf, terjadi kesalahan teknis saat mencoba mereset data Anda. Silakan coba lagi nanti.");
            } else {
                await logActivity(user.id, userNumber, 'Sukses Reset Data', 'Semua transaksi telah dihapus.');
                msg.reply("✅ *Reset Berhasil!* Semua data transaksi Anda telah dihapus secara permanen. Anda bisa memulai pencatatan dari awal.");
            }
            
            delete userState[userNumber];
            break;

        case 'awaiting_delete_choice':
            const choiceIndex = parseInt(messageBody, 10) - 1;
            if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= state.transactions.length) {
                await logActivity(user.id, userNumber, 'Gagal Hapus', `Pilihan tidak valid: ${messageBody}`);
                msg.reply("Pilihan tidak valid. Harap kirim nomor yang ada di daftar.");
                return;
            }

            const txToDelete = state.transactions[choiceIndex];
            
            const { error: singleDeleteError } = await supabase
                .from('transaksi')
                .delete()
                .eq('id', txToDelete.id);

            if (singleDeleteError) {
                await logActivity(user.id, userNumber, 'Error Hapus Transaksi', `ID: ${txToDelete.id}, Error: ${singleDeleteError.message}`);
                msg.reply("Maaf, terjadi kesalahan saat menghapus transaksi. Silakan coba lagi.");
            } else {
                await logActivity(user.id, userNumber, 'Sukses Hapus Transaksi', `ID: ${txToDelete.id}, Detail: ${JSON.stringify(txToDelete)}`);
                msg.reply(`✅ Transaksi "${txToDelete.kategori.nama_kategori} - ${formatCurrency(txToDelete.nominal)}" berhasil dihapus.`);
            }

            delete userState[userNumber];
            break;

        case 'awaiting_edit_choice':
            if (!['1', '2', '3'].includes(messageBody)) {
                await logActivity(user.id, userNumber, 'Gagal Edit', `Pilihan tidak valid: ${messageBody}`);
                msg.reply("Pilihan tidak valid. Harap kirim angka 1, 2, atau 3.");
                return;
            }
            state.choice = messageBody;
            await logActivity(user.id, userNumber, 'Proses Edit', `Pilihan diterima: ${messageBody}`);
            
            if (messageBody === '1' || messageBody === '3') {
                state.step = 'awaiting_new_nominal';
                msg.reply("Masukkan nominal baru:");
            } else {
                state.step = 'awaiting_new_catatan';
                msg.reply("Masukkan catatan baru (ketik - jika ingin dihapus):");
            }
            break;

        case 'awaiting_new_nominal':
            const newNominal = parseNominal(messageBody);
            if (newNominal === null) {
                await logActivity(user.id, userNumber, 'Gagal Edit', `Nominal baru tidak valid: ${messageBody}`);
                msg.reply("❌ Format nominal tidak valid. Harap masukkan angka (contoh: 50000, 50rb, 1.5jt).");
                return;
            }
            state.data.new_nominal = newNominal;
            await logActivity(user.id, userNumber, 'Proses Edit', `Nominal baru diterima: ${newNominal}`);
            
            if (state.choice === '3') {
                state.step = 'awaiting_new_catatan';
                msg.reply("Nominal baru diterima. Sekarang masukkan catatan baru:");
            } else {
                await finalizeEdit(msg, userNumber, state.data);
            }
            break;

        case 'awaiting_new_catatan':
            state.data.new_catatan = messageBody === '-' ? null : messageBody;
            await logActivity(user.id, userNumber, 'Proses Edit', `Catatan baru diterima: ${state.data.new_catatan || 'dihapus'}`);
            await finalizeEdit(msg, userNumber, state.data);
            break;
    }
}

async function finalizeEdit(msg, userNumber, data) {
    const updateData = {};
    if (data.new_nominal !== undefined) updateData.nominal = data.new_nominal;
    if (data.new_catatan !== undefined) updateData.catatan = data.new_catatan;

    const user = await findOrCreateUser(userNumber, '');

    if (updateData.nominal !== undefined && data.tipe === 'EXPENSE') {
        const balance = await getUserBalance(user.id);
        const oldNominal = data.old_nominal || 0;
        const effectiveBalance = balance + oldNominal; 
        if (effectiveBalance < updateData.nominal) {
            const logDetail = `Saldo tidak cukup untuk edit. Saldo Efektif: ${effectiveBalance}, Nominal Baru: ${updateData.nominal}`;
            await logActivity(user.id, userNumber, 'Gagal Edit', logDetail);
            msg.reply(`⚠️ *Edit Gagal!*\nSaldo tidak mencukupi untuk nominal baru.\n\n`+
                      `Saldo Efektif: *${formatCurrency(effectiveBalance)}*\n` +
                      `Nominal Baru: *${formatCurrency(updateData.nominal)}*`);
            delete userState[userNumber];
            return;
        }
    }

    const { error } = await supabase
        .from('transaksi')
        .update(updateData)
        .eq('id', data.tx_id);
    
    if (error) {
        await logActivity(user.id, userNumber, 'Error Edit Transaksi', error.message);
        msg.reply("Maaf, gagal mengubah transaksi. Silakan coba lagi.");
    } else {
        await logActivity(user.id, userNumber, 'Sukses Edit Transaksi', `ID: ${data.tx_id}, Data: ${JSON.stringify(updateData)}`);
        msg.reply(`✅ Transaksi berhasil diubah!`);
    }

    delete userState[userNumber];
}

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
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);

            const { data: allTransactions, error: allError } = await supabase
                .from('transaksi')
                .select(`nominal, kategori (tipe)`)
                .eq('id_user', user.id)
                .lte('tanggal', endDate.toISOString());

            if (allError) {
                await logActivity(user.id, msg.from, 'Error Cek Laporan Kumulatif', allError.message);
                msg.reply("Gagal menghitung saldo kumulatif.");
                return;
            }

            let totalPemasukanKumulatif = 0, totalPengeluaranKumulatif = 0;
            allTransactions.forEach(t => {
                if (t.kategori.tipe === 'INCOME') totalPemasukanKumulatif += t.nominal;
                else totalPengeluaranKumulatif += t.nominal;
            });
            const saldoKumulatif = totalPemasukanKumulatif - totalPengeluaranKumulatif;
            
            const { data: dailyTransactions, error: dailyError } = await supabase
                .from('transaksi')
                .select(`nominal, catatan, kategori (nama_kategori, tipe)`)
                .eq('id_user', user.id)
                .gte('tanggal', startDate.toISOString())
                .lte('tanggal', endDate.toISOString())
                .order('tanggal', { ascending: false });

            if (dailyError) {
                await logActivity(user.id, msg.from, 'Error Cek Laporan Harian', dailyError.message);
                msg.reply("Gagal mengambil data laporan harian.");
                return;
            }

            if (dailyTransactions.length === 0) {
                msg.reply(`Tidak ada transaksi hari ini. 😊\n\nSaldo kumulatif Anda saat ini adalah *${formatCurrency(saldoKumulatif)}*`);
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

            let reportTextHarian = `📊 *Laporan Harian & Saldo Kumulatif*\n\n` +
                             `📥 *Total Pemasukan (Kumulatif):*\n   ${formatCurrency(totalPemasukanKumulatif)}\n\n` +
                             `📤 *Total Pengeluaran (Kumulatif):*\n   ${formatCurrency(totalPengeluaranKumulatif)}\n\n` +
                             `--------------------\n` +
                             `✨ *Saldo Akhir (Kumulatif):*\n   *${formatCurrency(saldoKumulatif)}*\n` +
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
            const dayOfWeek = startDate.getDay();
            const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
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
                    msg.reply(`❌ Bulan "${monthArg}" tidak valid. Gunakan nama bulan (e.g., 'mei') atau angka (1-12).`);
                    return;
                }
                
                startDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
                endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
                reportTitle = `Laporan Bulanan (${monthNames[targetMonth]} ${targetYear})`;

            } else {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                reportTitle = `Laporan Bulanan (Bulan Ini)`;
            }
            break;

        case 'tahunan':
            const targetAnnualYear = parts[2] ? parseInt(parts[2], 10) : now.getFullYear();
            if (isNaN(targetAnnualYear)) {
                msg.reply(`❌ Format tahun "${parts[2]}" tidak valid.`);
                return;
            }
            startDate = new Date(targetAnnualYear, 0, 1, 0, 0, 0, 0);
            endDate = new Date(targetAnnualYear, 11, 31, 23, 59, 59, 999);
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

async function getUserBalance(userId) {
    const { data: transactions, error } = await supabase.from('transaksi').select('nominal, kategori(tipe)').eq('id_user', userId);
    if (error) {
        const userNumber = (await supabase.from('users').select('nomer_whatsapp').eq('id', userId).single()).data.nomer_whatsapp;
        await logActivity(userId, userNumber || 'N/A', 'Error Internal', `Gagal ambil saldo: ${error.message}`);
        throw new Error("Gagal mengambil data saldo untuk validasi.");
    }
    let totalPemasukan = 0, totalPengeluaran = 0;
    transactions.forEach(t => { if (t.kategori) { t.kategori.tipe === 'INCOME' ? totalPemasukan += t.nominal : totalPengeluaran += t.nominal; } });
    return totalPemasukan - totalPengeluaran;
}

async function handleTransaksi(msg, user, originalMessage) {
    const parts = originalMessage.split(' ');
    if (parts.length < 2) { 
        await logActivity(user.id, msg.from, 'Perintah Tidak Dikenali', originalMessage); 
        msg.reply("🤔 Perintah tidak dikenali. Ketik *bantuan* untuk melihat daftar perintah."); 
        return; 
    }
    
    const kategoriNama = parts[0].toLowerCase();
    const nominalStr = parts[1];
    
    const nominal = parseNominal(nominalStr);
    
    if (nominal === null) {
        await logActivity(user.id, msg.from, 'Gagal Transaksi', `Nominal tidak valid. Pesan: "${originalMessage}"`); 
        msg.reply(`❌ Format nominal "${nominalStr}" tidak valid. Contoh: \`50000\`, \`50rb\`, \`1.5jt\`.`); 
        return; 
    }

    const catatanParts = originalMessage.split(' ').slice(2);
    const catatan = catatanParts.length > 0 ? catatanParts.join(' ') : null;
    
    const { data: kategori, error: kategoriError } = await supabase.from('kategori').select('id, tipe').ilike('nama_kategori', kategoriNama).single();
    if (kategoriError || !kategori) { 
        await logActivity(user.id, msg.from, 'Gagal Transaksi', `Kategori tidak ditemukan. Pesan: "${originalMessage}"`); 
        msg.reply(`❓ Kategori "${kategoriNama}" tidak ditemukan. Cek kembali daftar kategori di menu *bantuan*.`); 
        return; 
    }

    if (kategori.tipe === 'EXPENSE') {
        const currentBalance = await getUserBalance(user.id);
        if (currentBalance < nominal) {
            const logDetail = `Saldo tidak cukup. Saldo: ${currentBalance}, Pengeluaran: ${nominal}`;
            await logActivity(user.id, msg.from, 'Gagal Transaksi', logDetail);
            const replyText = `⚠️ *Transaksi Gagal!*\n\nSaldo Anda tidak mencukupi untuk transaksi ini.\n\n💰 Saldo Saat Ini: *${formatCurrency(currentBalance)}*\n💸 Pengeluaran: *${formatCurrency(nominal)}*`;
            msg.reply(replyText);
            return;
        }
    }

    const { error: insertError } = await supabase.from('transaksi').insert({ id_user: user.id, id_kategori: kategori.id, nominal: nominal, catatan: catatan });
    if (insertError) { 
        await logActivity(user.id, msg.from, 'Error Transaksi', insertError.message); 
        console.error("Error inserting transaction:", insertError); 
        msg.reply("Maaf, terjadi kesalahan saat menyimpan transaksi. Silakan coba lagi."); 
        return; 
    }
    
    const logDetail = `Kategori: ${kategoriNama}, Nominal: ${nominal}, Catatan: ${catatan || '-'}`;
    await logActivity(user.id, msg.from, 'Mencatat Transaksi', logDetail);
    
    const tipeText = kategori.tipe === 'INCOME' ? '📥 Pemasukan' : '📤 Pengeluaran';
    const confirmationText = `✅ *Transaksi Berhasil Dicatat!*\n\n` + `*Tipe:* ${tipeText}\n*Kategori:* ${kategoriNama}\n*Nominal:* ${formatCurrency(nominal)}\n*Catatan:* ${catatan || '-'}`;
    msg.reply(confirmationText);
}

async function findOrCreateUser(userNumber, userName) {
    let { data: user, error } = await supabase.from('users').select('id, nama').eq('nomer_whatsapp', userNumber).single();
    if (error && error.code !== 'PGRST116') { throw new Error(error.message); }
    if (!user) {
        console.log(`User baru terdeteksi: ${userNumber}. Membuat entri baru...`);
        const { data: newUser, error: insertError } = await supabase.from('users').insert({ nomer_whatsapp: userNumber, nama: userName }).select('id').single();
        if (insertError) throw new Error(insertError.message);
        user = { id: newUser.id, nama: userName }; 
        await logActivity(user.id, userNumber, 'User Baru Terdaftar', `Nama: ${userName}`);
    } else if (user.nama !== userName) {
        await logActivity(user.id, userNumber, 'Info User', `Nama diupdate dari "${user.nama}" menjadi "${userName}"`);
        await supabase.from('users').update({ nama: userName }).eq('id', user.id);
    }
    return user;
}

client.initialize();