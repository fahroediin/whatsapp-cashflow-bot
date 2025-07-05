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
        const logDetail = `Saldo tidak cukup untuk edit. Saldo Efektif: ${revertedBalance}, Nominal Baru: ${updateData.nominal}`;
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
            // ... (Tidak ada perubahan)
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
            // ... (Tidak ada perubahan)
            if (messageBody.toLowerCase() !== 'reset data saya sekarang') {
                await logActivity(user.id, userNumber, 'Reset Dibatalkan (Final)', `Input tidak sesuai: ${messageBody}`);
                delete userState[userNumber];
                msg.reply("Reset dibatalkan. Data Anda tetap aman. Fiuh! 😮‍💨");
                return;
            }

            // Saat reset, hapus transaksi DAN set saldo ke 0
            await logActivity(user.id, userNumber, 'Eksekusi Reset', 'Menghapus semua transaksi pengguna.');
            const { error: deleteError } = await supabase
                .from('transaksi')
                .delete()
                .eq('id_user', user.id);
            
            // Set saldo user kembali ke 0
            const { error: resetSaldoError } = await supabase
                .from('users')
                .update({ saldo: 0 })
                .eq('id', user.id);

            if (deleteError || resetSaldoError) {
                const errorMessage = (deleteError?.message || '') + ' ' + (resetSaldoError?.message || '');
                await logActivity(user.id, userNumber, 'Error Reset Data', errorMessage);
                msg.reply("Maaf, terjadi kesalahan teknis saat mencoba mereset data Anda.");
            } else {
                await logActivity(user.id, userNumber, 'Sukses Reset Data', 'Semua transaksi dan saldo telah direset.');
                msg.reply("✅ *Reset Berhasil!* Semua data transaksi Anda telah dihapus dan saldo direset ke 0.");
            }
            
            delete userState[userNumber];
            break;

        // === BAGIAN YANG DIUBAH ADA DI SINI ===
        case 'awaiting_delete_choice':
            const choiceIndex = parseInt(messageBody, 10) - 1;
            if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= state.transactions.length) {
                await logActivity(user.id, userNumber, 'Gagal Hapus', `Pilihan tidak valid: ${messageBody}`);
                msg.reply("Pilihan tidak valid. Harap kirim nomor yang ada di daftar.");
                return;
            }

            const txToDelete = state.transactions[choiceIndex];

            // 1. Ambil saldo user saat ini
            const { data: userData, error: userError } = await supabase.from('users').select('saldo').eq('id', user.id).single();
            if (userError) {
                await logActivity(user.id, userNumber, 'Error Hapus', `Gagal mengambil saldo user: ${userError.message}`);
                msg.reply("Maaf, gagal mengambil data saldo untuk proses penghapusan.");
                delete userState[userNumber];
                return;
            }
            const currentBalance = userData.saldo;

            // 2. Hitung saldo baru
            const nominalToDelete = txToDelete.nominal;
            const tipeToDelete = txToDelete.kategori.tipe;
            const newBalance = tipeToDelete === 'INCOME' ? currentBalance - nominalToDelete : currentBalance + nominalToDelete;

            // 3. Hapus transaksi DARI database
            const { error: singleDeleteError } = await supabase
                .from('transaksi')
                .delete()
                .eq('id', txToDelete.id);

            if (singleDeleteError) {
                await logActivity(user.id, userNumber, 'Error Hapus Transaksi', `ID: ${txToDelete.id}, Error: ${singleDeleteError.message}`);
                msg.reply("Maaf, terjadi kesalahan saat menghapus transaksi. Silakan coba lagi.");
                delete userState[userNumber];
                return;
            }
            
            // 4. Update saldo di tabel 'users'
            const { error: updateBalanceError } = await supabase
                .from('users')
                .update({ saldo: newBalance })
                .eq('id', user.id);
            
            if (updateBalanceError) {
                 await logActivity(user.id, userNumber, 'KRITIS: Gagal Update Saldo (Hapus)', `Hapus Tx berhasil, saldo gagal. Error: ${updateBalanceError.message}`);
                 msg.reply("✅ Transaksi berhasil dihapus, namun ada masalah saat mengembalikan saldo Anda.");
            } else {
                await logActivity(user.id, userNumber, 'Sukses Hapus Transaksi', `ID: ${txToDelete.id}, Saldo Dikembalikan: ${newBalance}`);
                msg.reply(`✅ Transaksi "${txToDelete.kategori.nama_kategori} - ${formatCurrency(txToDelete.nominal)}" berhasil dihapus.\n\n💰 *Saldo Baru Anda:* ${formatCurrency(newBalance)}`);
            }

            delete userState[userNumber];
            break;

        case 'awaiting_edit_choice':
            // ... (Tidak ada perubahan)
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
            // ... (Tidak ada perubahan)
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
            // ... (Tidak ada perubahan)
            state.data.new_catatan = messageBody === '-' ? null : messageBody;
            await logActivity(user.id, userNumber, 'Proses Edit', `Catatan baru diterima: ${state.data.new_catatan || 'dihapus'}`);
            await finalizeEdit(msg, userNumber, state.data, userState);
            break;
    }
}

module.exports = { handleInteractiveSteps };