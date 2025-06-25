// supabaseClient.js (Diperbarui untuk Produksi)

// Di lingkungan produksi (seperti Railway), kita tidak menggunakan dotenv.
// Variabel lingkungan akan disuntikkan langsung oleh platform.
// Kita hanya akan memuat dotenv jika berjalan di lingkungan lokal (development).
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { createClient } = require('@supabase/supabase-js');

// Ambil variabel langsung dari environment (process.env)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validasi tetap ada, tetapi pesan error diubah agar lebih jelas
if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;