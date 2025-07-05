// handlers/transactionHandler.js
const supabase = require('../supabaseClient');
const { formatCurrency, parseNominal } = require('../utils/currency');
const { logActivity } = require('../utils/db');

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

    const catatan = originalMessage.split(' ').slice(2).join(' ') || null;
    
    const { data: kategori, error: kategoriError } = await supabase.from('kategori').select('id, tipe').ilike('nama_kategori', kategoriNama).single();
    if (kategoriError || !kategori) { 
        await logActivity(user.id, msg.from, 'Gagal Transaksi', `Kategori tidak ditemukan. Pesan: "${originalMessage}"`); 
        msg.reply(`❓ Kategori "${kategoriNama}" tidak ditemukan. Cek kembali daftar kategori di menu *bantuan*.`); 
        return; 
    }

    // --- LOGIKA SALDO BARU ---
    // 1. Ambil saldo user saat ini
    const { data: userData, error: userError } = await supabase.from('users').select('saldo').eq('id', user.id).single();
    if (userError) {
        await logActivity(user.id, msg.from, 'Error Transaksi', `Gagal mengambil data user: ${userError.message}`);
        msg.reply("Gagal mengambil data saldo Anda.");
        return;
    }
    const currentBalance = userData.saldo || 0;

    // 2. Validasi jika pengeluaran
    if (kategori.tipe === 'EXPENSE' && currentBalance < nominal) {
        const logDetail = `Saldo tidak cukup. Saldo: ${currentBalance}, Pengeluaran: ${nominal}`;
        await logActivity(user.id, msg.from, 'Gagal Transaksi', logDetail);
        const replyText = `⚠️ *Transaksi Gagal!*\n\nSaldo Anda tidak mencukupi untuk transaksi ini.\n\n💰 Saldo Saat Ini: *${formatCurrency(currentBalance)}*\n💸 Pengeluaran: *${formatCurrency(nominal)}*`;
        msg.reply(replyText);
        return;
    }

    // 3. Masukkan transaksi ke tabel 'transaksi'
    const { error: insertError } = await supabase.from('transaksi').insert({ id_user: user.id, id_kategori: kategori.id, nominal: nominal, catatan: catatan });
    if (insertError) { 
        await logActivity(user.id, msg.from, 'Error Transaksi', insertError.message); 
        msg.reply("Maaf, terjadi kesalahan saat menyimpan transaksi."); 
        return; 
    }
    
    // 4. Update saldo di tabel 'users'
    const newBalance = kategori.tipe === 'INCOME' ? currentBalance + nominal : currentBalance - nominal;
    const { error: updateError } = await supabase.from('users').update({ saldo: newBalance }).eq('id', user.id);
    
    if (updateError) {
        // Ini adalah state kritis, transaksi tercatat tapi saldo gagal diupdate. Perlu penanganan khusus/logging.
        await logActivity(user.id, msg.from, 'KRITIS: Gagal Update Saldo', `Tx berhasil, tapi saldo gagal diupdate. Error: ${updateError.message}`);
        msg.reply("✅ Transaksi tercatat, namun ada masalah saat memperbarui saldo Anda. Harap hubungi admin.");
        return;
    }
    
    await logActivity(user.id, msg.from, 'Mencatat Transaksi', `Kategori: ${kategoriNama}, Nominal: ${nominal}, Saldo Baru: ${newBalance}`);
    
    const tipeText = kategori.tipe === 'INCOME' ? '📥 Pemasukan' : '📤 Pengeluaran';
    const confirmationText = `✅ *Transaksi Berhasil Dicatat!*\n\n` + 
        `*Tipe:* ${tipeText}\n*Kategori:* ${kategoriNama}\n*Nominal:* ${formatCurrency(nominal)}\n*Catatan:* ${catatan || '-'}\n\n` +
        `💰 *Saldo Anda Sekarang:* ${formatCurrency(newBalance)}`;
    msg.reply(confirmationText);
}

module.exports = { handleTransaksi };