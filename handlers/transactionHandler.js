// handlers/transactionHandler.js
const supabase = require('../supabaseClient');
const { formatCurrency, parseNominal } = require('../utils/currency');
const { logActivity, getUserBalance } = require('../utils/db');

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

module.exports = { handleTransaksi };