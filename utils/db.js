// utils/db.js
const supabase = require('../supabaseClient');

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

module.exports = { logActivity, findOrCreateUser, getUserBalance };