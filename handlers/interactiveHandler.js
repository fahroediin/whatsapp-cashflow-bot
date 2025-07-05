// handlers/interactiveHandler.js
const supabase = require('../supabaseClient');
const { logActivity, findOrCreateUser, getUserBalance } = require('../utils/db');
const { formatCurrency, parseNominal } = require('../utils/currency');

async function finalizeEdit(msg, userNumber, data, userState) {
    const updateData = {};
    if (data.new_nominal !== undefined) updateData.nominal = data.new_nominal;
    if (data.new_catatan !== undefined) updateData.catatan = data.new_catatan;

    const user = await findOrCreateUser(userNumber, '');

    // Ambil saldo saat ini
    const { data: userData, error: userError } = await supabase.from('users').select('saldo').eq('id', user.id).single();
    if (userError) {
        msg.reply("Gagal mengambil data saldo untuk edit.");
        delete userState[userNumber];
        return;
    }
    const currentBalance = userData.saldo;
    const oldNominal = data.old_nominal || 0;
    
    // Hitung selisih nominal
    const nominalDifference = (updateData.nominal !== undefined) ? updateData.nominal - oldNominal : 0;

    // Hitung saldo yang "dikembalikan" sebelum dihitung ulang
    const revertedBalance = data.tipe === 'INCOME' ? currentBalance - oldNominal : currentBalance + oldNominal;
    
    // Validasi saldo jika ini pengeluaran
    if (data.tipe === 'EXPENSE' && updateData.nominal !== undefined && revertedBalance < updateData.nominal) {
        const logDetail = `Saldo tidak cukup untuk edit. Saldo Efektif: ${revertededBalance}, Nominal Baru: ${updateData.nominal}`;
        await logActivity(user.id, userNumber, 'Gagal Edit', logDetail);
        msg.reply(`⚠️ *Edit Gagal!*\nSaldo tidak mencukupi untuk nominal baru.\n\n`+
                  `Saldo Efektif: *${formatCurrency(revertedBalance)}*\n` +
                  `Nominal Baru: *${formatCurrency(updateData.nominal)}*`);
        delete userState[userNumber];
        return;
    }

    // Update transaksi
    const { error } = await supabase
        .from('transaksi')
        .update(updateData)
        .eq('id', data.tx_id);
    
    if (error) {
        await logActivity(user.id, userNumber, 'Error Edit Transaksi', error.message);
        msg.reply("Maaf, gagal mengubah transaksi. Silakan coba lagi.");
        delete userState[userNumber];
        return;
    }
    
    // Jika nominal diubah, update saldo user
    if (nominalDifference !== 0) {
        const balanceAdjustment = data.tipe === 'INCOME' ? nominalDifference : -nominalDifference;
        const newBalance = currentBalance + balanceAdjustment;
        
        const { error: updateBalanceError } = await supabase.from('users').update({ saldo: newBalance }).eq('id', user.id);
        if (updateBalanceError) {
             await logActivity(user.id, userNumber, 'KRITIS: Gagal Update Saldo (Edit)', `Edit Tx berhasil, saldo gagal. Error: ${updateBalanceError.message}`);
             msg.reply("✅ Transaksi berhasil diubah, namun ada masalah saat memperbarui saldo Anda.");
        } else {
             msg.reply(`✅ Transaksi berhasil diubah!\n\n💰 *Saldo Baru:* ${formatCurrency(newBalance)}`);
        }
    } else {
        msg.reply(`✅ Transaksi berhasil diubah! (Catatan saja)`);
    }

    delete userState[userNumber];
}
async function handleInteractiveSteps(msg, user, userState) {
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
                await finalizeEdit(msg, userNumber, state.data, userState);
            }
            break;

        case 'awaiting_new_catatan':
            state.data.new_catatan = messageBody === '-' ? null : messageBody;
            await logActivity(user.id, userNumber, 'Proses Edit', `Catatan baru diterima: ${state.data.new_catatan || 'dihapus'}`);
            await finalizeEdit(msg, userNumber, state.data, userState);
            break;
    }
}

module.exports = { handleInteractiveSteps };