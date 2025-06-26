// index.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log("Inisialisasi DuitQ...");

// --- State Management Global ---
const userState = {};

// --- Impor Handler dan Utilitas ---
const { logActivity, findOrCreateUser } = require('./utils/db');
const { handleTransaksi } = require('./handlers/transactionHandler');
const { handleInteractiveSteps } = require('./handlers/interactiveHandler');
const {
    handleBantuan,
    handleCekKeuangan,
    handleEdit,
    handleHapus,
    handleReset
} = require('./handlers/commandHandler');

// --- Inisialisasi Client WhatsApp ---
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

// --- Event Listener Utama untuk Pesan ---
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (chat.isGroup || msg.isStatus) return;

    const contact = await msg.getContact();
    const userNumber = msg.from;
    const userName = contact.pushname || userNumber;
    const messageBody = msg.body.trim();

    try {
        const user = await findOrCreateUser(userNumber, userName);
        
        // Alihkan ke handler interaktif jika pengguna dalam sesi
        if (userState[userNumber]) {
            await handleInteractiveSteps(msg, user, userState);
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

        // Router Perintah
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
                await handleEdit(msg, user, userState);
                break;
            case 'hapus':
                await handleHapus(msg, user, userState);
                break;
            case 'reset':
                await handleReset(msg, user, userState);
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

// --- Inisialisasi Bot ---
client.initialize();