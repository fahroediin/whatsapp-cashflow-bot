// index.js (Diperbarui dengan Fitur Edit Transaksi Terakhir)
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const supabase = require('./supabaseClient');

console.log("Inisialisasi DuitQ...");

const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

// --- STATE MANAGEMENT untuk Fitur Edit ---
const userState = {};

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

    // Cek state pengguna terlebih dahulu untuk alur interaktif (seperti edit)
    if (userState[userNumber]) {
        await handleInteractiveSteps(msg, userNumber, userName);
        return;
    }

    const lowerCaseMessage = messageBody.toLowerCase();

    try {
        const user = await findOrCreateUser(userNumber, userName);
        const parts = lowerCaseMessage.split(' ');
        const command = parts[0];

        if (command === 'batal') { msg.reply("Tidak ada sesi aktif untuk dibatalkan."); return; }

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
            // --- PERINTAH BARU UNTUK EDIT ---
            case 'edit':
            case 'ubah':
                await handleEdit(msg, user);
                break;
            default:
                await handleTransaksi(msg, user, messageBody);
                break;
        }
    } catch (error) {
        console.error(`Error processing message from ${userNumber}:`, error);
        msg.reply("🤖💥 Maaf, sepertinya terjadi sedikit gangguan teknis di sistem saya. Silakan coba beberapa saat lagi.");
    }
});

async function handleBantuan(msg, userName) {
    const { data: categories, error } = await supabase.from('kategori').select('nama_kategori, tipe');
    if (error) { console.error("Error fetching categories:", error); msg.reply("Maaf, gagal memuat daftar kategori."); return; }
    
    const incomeCategories = categories.filter(c => c.tipe === 'INCOME').map(c => `  - ${c.nama_kategori}`).join('\n');
    const expenseCategories = categories.filter(c => c.tipe === 'EXPENSE').map(c => `  - ${c.nama_kategori}`).join('\n');
    
    // --- Menambahkan perintah edit ke menu bantuan ---
    const helpText = `Halo ${userName}! 👋 Ini adalah daftar perintah yang bisa Anda gunakan:\n\n` +
                     `*1. Mencatat Transaksi* 📝\n` +
                     `Gunakan format: \`kategori nominal [catatan]\`\n` +
                     `Contoh: \`makanan 15000 nasi padang\`\n\n` +
                     `*2. Cek Laporan Keuangan* 📈\n` +
                     `Gunakan format: \`cek [periode]\`\n` +
                     `Contoh: \`cek harian\`\n\n` +
                     `*3. Ubah Transaksi Terakhir* ✏️\n` +
                     `Ketik: \`edit\` atau \`ubah\`\n\n` +
                     `---\n\n` +
                     `*KATEGORI PEMASUKAN* 📥\n${incomeCategories}\n\n` +
                     `*KATEGORI PENGELUARAN* 📤\n${expenseCategories}`;
    
    msg.reply(helpText);
}

// --- FUNGSI BARU UNTUK MEMULAI PROSES EDIT ---
async function handleEdit(msg, user) {
    await logActivity(user.id, msg.from, 'Mulai Edit Transaksi', msg.body);
    
    // 1. Ambil transaksi terakhir pengguna
    const { data: lastTx, error } = await supabase
        .from('transaksi')
        .select('*, kategori(nama_kategori, tipe)')
        .eq('id_user', user.id)
        .order('tanggal', { ascending: false })
        .limit(1)
        .single();

    if (error || !lastTx) {
        msg.reply("Tidak ada transaksi terakhir yang bisa diubah. 🤔");
        return;
    }

    // 2. Simpan info transaksi di state dan tampilkan ke pengguna
    userState[msg.from] = {
        step: 'awaiting_edit_choice',
        data: {
            tx_id: lastTx.id,
            old_nominal: lastTx.nominal,
            kategori: lastTx.kategori.nama_kategori,
            tipe: lastTx.kategori.tipe
        }
    };

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

// --- FUNGSI BARU UNTUK MENANGANI LANGKAH-LANGKAH INTERAKTIF ---
async function handleInteractiveSteps(msg, userNumber, userName) {
    const state = userState[userNumber];
    const messageBody = msg.body.trim();
    const user = { id: (await findOrCreateUser(userNumber, userName)).id }; // Dapatkan ID user untuk logging

    if (messageBody.toLowerCase() === 'batal') {
        delete userState[userNumber];
        await logActivity(user.id, userNumber, 'Sesi Interaktif Dibatalkan', `Langkah: ${state.step}`);
        msg.reply("Oke, sesi dibatalkan. 👍");
        return;
    }

    switch (state.step) {
        case 'awaiting_edit_choice':
            if (!['1', '2', '3'].includes(messageBody)) {
                msg.reply("Pilihan tidak valid. Harap kirim angka 1, 2, atau 3.");
                return;
            }
            state.choice = messageBody;
            if (messageBody === '1' || messageBody === '3') {
                state.step = 'awaiting_new_nominal';
                msg.reply("Masukkan nominal baru:");
            } else { // Pilihan 2 (hanya catatan)
                state.step = 'awaiting_new_catatan';
                msg.reply("Masukkan catatan baru (ketik - jika ingin dihapus):");
            }
            break;

        case 'awaiting_new_nominal':
            const newNominal = parseInt(messageBody, 10);
            if (isNaN(newNominal)) {
                msg.reply("❌ Nominal tidak valid. Harap masukkan angka saja.");
                return;
            }
            state.data.new_nominal = newNominal;
            if (state.choice === '3') { // Jika pilih 'keduanya'
                state.step = 'awaiting_new_catatan';
                msg.reply("Nominal baru diterima. Sekarang masukkan catatan baru:");
            } else { // Jika hanya 'nominal'
                await finalizeEdit(msg, userNumber, state.data);
            }
            break;

        case 'awaiting_new_catatan':
            state.data.new_catatan = messageBody === '-' ? null : messageBody;
            await finalizeEdit(msg, userNumber, state.data);
            break;
    }
}

// --- FUNGSI BARU UNTUK MENYELESAIKAN PROSES EDIT ---
async function finalizeEdit(msg, userNumber, data) {
    const updateData = {};
    if (data.new_nominal !== undefined) updateData.nominal = data.new_nominal;
    if (data.new_catatan !== undefined) updateData.catatan = data.new_catatan;

    const user = await findOrCreateUser(userNumber, '');

    // Validasi saldo jika nominal diubah dan merupakan pengeluaran
    if (updateData.nominal !== undefined && data.tipe === 'EXPENSE') {
        const balance = await getUserBalance(user.id);
        const oldNominal = data.old_nominal || 0;
        // Saldo sekarang = saldo total + nominal lama (dikembalikan)
        const effectiveBalance = balance + oldNominal; 
        if (effectiveBalance < updateData.nominal) {
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

    // Hapus state setelah selesai
    delete userState[userNumber];
}


async function handleCekKeuangan(msg, user, parts, originalMessage) {
    const periode = parts[1];
    if (!periode) { await logActivity(user.id, msg.from, 'Gagal Cek Laporan', `Periode tidak diisi. Pesan: "${originalMessage}"`); msg.reply("🤔 Formatnya kurang tepat. Gunakan: `cek [periode]`\nContoh: `cek harian`"); return; }
    
    const now = new Date(); let startDate; let endDate = new Date();
    switch (periode) { case 'harian': startDate = new Date(now.setHours(0, 0, 0, 0)); break; case 'mingguan': startDate = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))); startDate.setHours(0, 0, 0, 0); break; case 'bulanan': startDate = new Date(now.getFullYear(), now.getMonth(), 1); startDate.setHours(0, 0, 0, 0); break; case 'tahunan': startDate = new Date(now.getFullYear(), 0, 1); startDate.setHours(0, 0, 0, 0); break; default: await logActivity(user.id, msg.from, 'Gagal Cek Laporan', `Periode tidak valid: ${periode}.`); msg.reply(`❌ Periode "${periode}" tidak valid. Pilih antara: *harian, mingguan, bulanan, tahunan*.`); return; }
    
    const { data: transactions, error } = await supabase.from('transaksi').select(`nominal, catatan, kategori (nama_kategori, tipe)`).eq('id_user', user.id).gte('tanggal', startDate.toISOString()).lte('tanggal', endDate.toISOString()).order('tanggal', { ascending: false });
    if (error) { await logActivity(user.id, msg.from, 'Error Cek Laporan', error.message); console.error("Error fetching transactions:", error); msg.reply("Gagal mengambil data laporan."); return; }
    
    await logActivity(user.id, msg.from, 'Cek Laporan', `Periode: ${periode}`);
    if (transactions.length === 0) { msg.reply(`Tidak ada transaksi yang tercatat untuk periode ${periode} ini. 😊`); return; }

    let totalPemasukan = 0, totalPengeluaran = 0;
    const incomeDetails = [], expenseDetails = [];
    transactions.forEach(t => {
        const rowText = createTableRow(t.kategori.nama_kategori, t.nominal, t.catatan);
        if (t.kategori.tipe === 'INCOME') { totalPemasukan += t.nominal; incomeDetails.push(rowText); } else { totalPengeluaran += t.nominal; expenseDetails.push(rowText); }
    });
    const sisaUang = totalPemasukan - totalPengeluaran;
    
    let reportText = `📊 *Laporan Keuangan ${periode.charAt(0).toUpperCase() + periode.slice(1)}*\n\n` + `📥 *Total Pemasukan:*\n   ${formatCurrency(totalPemasukan)}\n\n` + `📤 *Total Pengeluaran:*\n   ${formatCurrency(totalPengeluaran)}\n\n` + `--------------------\n` + `✨ *Saldo Akhir:*\n   *${formatCurrency(sisaUang)}*\n` + `--------------------\n`;
    if (incomeDetails.length > 0) { reportText += `\n*RINCIAN PEMASUKAN* 📥\n` + "```\n" + incomeDetails.join('\n') + "\n```"; }
    if (expenseDetails.length > 0) { reportText += `\n*RINCIAN PENGELUARAN* 📤\n` + "```\n" + expenseDetails.join('\n') + "\n```"; }
    msg.reply(reportText);
}

async function getUserBalance(userId) {
    const { data: transactions, error } = await supabase.from('transaksi').select('nominal, kategori(tipe)').eq('id_user', userId);
    if (error) throw new Error("Gagal mengambil data saldo untuk validasi.");
    let totalPemasukan = 0, totalPengeluaran = 0;
    transactions.forEach(t => { if (t.kategori) { t.kategori.tipe === 'INCOME' ? totalPemasukan += t.nominal : totalPengeluaran += t.nominal; } });
    return totalPemasukan - totalPengeluaran;
}

async function handleTransaksi(msg, user, originalMessage) {
    const parts = originalMessage.toLowerCase().split(' ');
    if (parts.length < 2) { await logActivity(user.id, msg.from, 'Perintah Tidak Dikenali', originalMessage); msg.reply("🤔 Perintah tidak dikenali. Ketik *bantuan* untuk melihat daftar perintah."); return; }
    
    const kategoriNama = parts[0];
    const nominal = parseInt(parts[1], 10);
    const catatanParts = originalMessage.split(' ').slice(2);
    const catatan = catatanParts.length > 0 ? catatanParts.join(' ') : null;

    if (isNaN(nominal)) { await logActivity(user.id, msg.from, 'Gagal Transaksi', `Nominal tidak valid. Pesan: "${originalMessage}"`); msg.reply("❌ Nominal harus berupa angka. Contoh: `makanan 15000`"); return; }
    
    const { data: kategori, error: kategoriError } = await supabase.from('kategori').select('id, tipe').ilike('nama_kategori', kategoriNama).single();
    if (kategoriError || !kategori) { await logActivity(user.id, msg.from, 'Gagal Transaksi', `Kategori tidak ditemukan. Pesan: "${originalMessage}"`); msg.reply(`❓ Kategori "${kategoriNama}" tidak ditemukan. Cek kembali daftar kategori di menu *bantuan*.`); return; }

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
    if (insertError) { await logActivity(user.id, msg.from, 'Error Transaksi', insertError.message); console.error("Error inserting transaction:", insertError); msg.reply("Maaf, terjadi kesalahan saat menyimpan transaksi. Silakan coba lagi."); return; }
    
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
        user = newUser;
        await logActivity(user.id, userNumber, 'User Baru Terdaftar', `Nama: ${userName}`);
    } else if (user.nama !== userName) {
        await supabase.from('users').update({ nama: userName }).eq('id', user.id);
    }
    return user;
}

client.initialize();