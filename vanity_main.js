// vanity_main.js
const { Worker, isMainThread, workerData } = require('worker_threads');
const os = require('os');
const readline = require('readline');
const fs = require('fs'); // Impor modul File System
const path = require('path'); // Impor modul path untuk operasi file

// Konstanta untuk nama folder output
const OUTPUT_DIR = 'SUKSES DIBUAT';

// Variabel sesi (diatur di main)
let SESSION_FILE_PATH = ''; 
let successCount = 0;

// Fungsi untuk memvalidasi input pola (hanya karakter heksadesimal)
function isValidPattern(str) {
    // Memungkinkan karakter a-f, A-F, dan 0-9
    return /^[0-9a-fA-F]*$/.test(str);
}

// Fungsi untuk menghitung estimasi kesulitan (kesempatan berhasil)
function calculateDifficulty(prefix, suffix) {
    const length = prefix.length + suffix.length;
    return Math.pow(16, length);
}

// Fungsi baru untuk membuat folder dan menyimpan/menambahkan data ke file sesi
function saveFoundAddress(address, privateKey) {
    // Memastikan SESSION_FILE_PATH sudah diinisialisasi
    if (!SESSION_FILE_PATH) {
        console.error('\n[ERROR] File sesi belum diinisialisasi. Tidak dapat menyimpan.');
        return;
    }
    
    try {
        // Konten yang akan ditambahkan ke file
        const fileContent = 
            `\n========================================\n` +
            `Waktu Ditemukan: ${new Date().toISOString()}\n` +
            `Address EVM: ${address}\n` +
            `Private Key: ${privateKey}\n` +
            `========================================\n`;

        // Menggunakan appendFileSync untuk menambahkan data ke file sesi yang sudah ada
        fs.appendFileSync(SESSION_FILE_PATH, fileContent);
        
        // Tambahkan hitungan sukses
        successCount++;
        
        // Output ringkas ke terminal
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`[STATUS] Sukses menemukan ${successCount} address`);
        
    } catch (error) {
        console.error(`\n[ERROR] Gagal menyimpan ke file sesi: ${error.message}`);
    }
}

// ====================================================================
// LOGIKA MAIN THREAD (Dieksekusi jika isMainThread = true)
// ====================================================================

function main() {
    // 1. Persiapan File Log Sesi
    const now = new Date();
    const timestampFormat = now.getFullYear().toString() + 
                            (now.getMonth() + 1).toString().padStart(2, '0') + 
                            now.getDate().toString().padStart(2, '0') + 
                            '_' + 
                            now.getHours().toString().padStart(2, '0') + 
                            now.getMinutes().toString().padStart(2, '0') + 
                            now.getSeconds().toString().padStart(2, '0');
    
    const sessionFileName = `Session_Log_${timestampFormat}.txt`;
    
    // Pastikan folder output ada sebelum memulai
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    SESSION_FILE_PATH = path.join(OUTPUT_DIR, sessionFileName);
    fs.writeFileSync(SESSION_FILE_PATH, `--- Log Sesi Pencarian Vanity Address dimulai pada ${now.toISOString()} ---\n\n`);
    successCount = 0; // Reset counter untuk sesi baru
    
    // Konfigurasi Worker Threads
    const NUM_WORKERS = os.cpus().length;
    let mainLoopRunning = true; // Status untuk loop update terminal
    
    // --- Konfigurasi Spinner ---
    const spinner = ['|', '/', '-', '\\'];
    let spinnerFrame = 0;

    console.log("========================================");
    console.log("Generator Vanity Address EVM Node.js");
    console.log(`Menggunakan ${NUM_WORKERS} worker (sesuai jumlah core CPU Anda)`);
    console.log("========================================");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Membersihkan terminal untuk tampilan update
    function clearTerminalLine() {
        if (mainLoopRunning) {
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
        }
    }
    
    // 1. Ambil input Prefix
    rl.question('Masukkan Prefix (karakter hex 0-F, contoh: BADE): 0x', (prefix) => {
        prefix = prefix.trim();
        
        if (!isValidPattern(prefix)) {
            console.error('\n[ERROR] Prefix tidak valid. Gunakan hanya karakter 0-9 dan a-f/A-F.');
            rl.close();
            return;
        }

        // 2. Ambil input Suffix
        rl.question('Masukkan Suffix (karakter hex 0-F, contoh: DEAD): ', (suffix) => {
            suffix = suffix.trim();

            if (!isValidPattern(suffix)) {
                console.error('\n[ERROR] Suffix tidak valid. Gunakan hanya karakter 0-9 dan a-f/A-F.');
                rl.close();
                return;
            }

            if (prefix.length + suffix.length > 40) {
                 console.error('\n[ERROR] Total panjang prefix dan suffix tidak boleh melebihi 40 karakter.');
                rl.close();
                return;
            }

            // 3. Tentukan Case-Sensitivity
            rl.question('Sensitif terhadap huruf besar/kecil? (y/n, default: n): ', (caseSensitiveInput) => {
                const isCaseSensitive = caseSensitiveInput.toLowerCase() === 'y';
                rl.close();
                mainLoopRunning = false; // Hentikan loop sebelum memulai pencarian serius

                if (prefix.length === 0 && suffix.length === 0) {
                    console.error('\n[ERROR] Anda harus memasukkan setidaknya Prefix atau Suffix.');
                    return;
                }
                
                const pattern = [prefix, suffix];
                const difficulty = calculateDifficulty(prefix, suffix);
                
                console.log("\n========================================");
                console.log(`Pola Dicari: 0x${isCaseSensitive ? prefix : prefix.toLowerCase()}...${isCaseSensitive ? suffix : suffix.toLowerCase()}`);
                console.log(`Sensitifitas Huruf: ${isCaseSensitive ? 'YA' : 'TIDAK'}`);
                console.log(`Estimasi Kesulitan (1 dari): ${difficulty.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);
                if (difficulty > 1e12) {
                    console.log("[PERINGATAN] Pencarian mungkin memakan waktu SANGAT LAMA (hari/minggu)!");
                }
                console.log("========================================");
                console.log(`[LOG] Hasil sesi akan disimpan di: ${path.basename(SESSION_FILE_PATH)}\n`);


                let totalAttempts = 0;
                let found = false;
                const workers = [];
                const searchStartTime = Date.now();
                
                // Fungsi untuk menampilkan status (minimalis)
                function updateTerminalStatus() {
                    if (found || workers.length === 0) return;

                    const currentSpinner = spinner[spinnerFrame % spinner.length];
                    spinnerFrame++;
                    
                    // Output minimalis
                    readline.cursorTo(process.stdout, 0);
                    process.stdout.write(`[STATUS] Sukses menemukan ${successCount} address (${currentSpinner})`);
                    
                    // Jadwalkan update berikutnya
                    setTimeout(updateTerminalStatus, 150); // Update lebih cepat untuk efek spinner
                }

                // Inisialisasi dan jalankan Worker
                for (let i = 0; i < NUM_WORKERS; i++) {
                    const worker = new Worker(__filename, {
                        workerData: {
                            pattern: pattern,
                            isCaseSensitive: isCaseSensitive,
                        }
                    });

                    workers.push(worker);

                    worker.on('message', (msg) => {
                        // Jika alamat ditemukan
                        if (msg.success) {
                            // Panggil fungsi penyimpanan file di Main Thread
                            saveFoundAddress(msg.address, msg.privateKey);
                            
                            // Worker yang berhasil tidak di-terminate, Main Thread akan terus menerima hasilnya
                            // Worker akan secara otomatis berhenti di sisi Worker Thread
                        } else {
                            // Logika ini sekarang hanya berfungsi untuk menjaga loop spinner tetap berjalan (opsional)
                            totalAttempts += msg.attempts;
                        }
                    });

                    worker.on('error', (err) => {
                        console.error(`\n[ERROR Worker ${i}] Terjadi kesalahan:`, err.message);
                    });

                    worker.on('exit', (code) => {
                        if (code !== 0 && !found) {
                            console.error(`\n[ERROR Worker ${i}] Keluar dengan kode ${code}.`);
                        }
                        workers.splice(workers.indexOf(worker), 1);
                        if (workers.length === 0 && !found && successCount === 0) {
                            // Hanya tampilkan jika semua worker berhenti dan tidak ada hasil
                            clearTerminalLine();
                            console.log('\n[STATUS] Semua worker selesai, tidak ditemukan hasil.');
                        }
                    });
                }
                
                // Mulai loop update terminal
                updateTerminalStatus();
            });
        });
    });
}

// ====================================================================
// LOGIKA WORKER THREAD (Dieksekusi jika isMainThread = false)
// ====================================================================

function findVanityAddress() {
    const { parentPort, workerData } = require('worker_threads');
    // Memastikan ethers di-require hanya di worker thread
    const { Wallet } = require('ethers');

    const { pattern, isCaseSensitive } = workerData;
    let attempts = 0;
    const startTime = Date.now();
    
    // Fungsi untuk memeriksa apakah alamat cocok dengan pola yang diinginkan
    function checkMatch(address, pattern, isCaseSensitive) {
        const cleanAddress = address.substring(2); 
        const prefix = pattern[0];
        const suffix = pattern[1];

        if (isCaseSensitive) {
            return cleanAddress.startsWith(prefix) && cleanAddress.endsWith(suffix);
        } else {
            const lowerAddress = cleanAddress.toLowerCase();
            const lowerPrefix = prefix.toLowerCase();
            const lowerSuffix = suffix.toLowerCase();
            return lowerAddress.startsWith(lowerPrefix) && lowerAddress.endsWith(lowerSuffix);
        }
    }

    while (true) {
        const wallet = Wallet.createRandom();
        const address = wallet.address;
        const privateKey = wallet.privateKey;
        
        attempts++;

        if (checkMatch(address, pattern, isCaseSensitive)) {
            const endTime = Date.now();
            parentPort.postMessage({
                success: true,
                address: address,
                privateKey: privateKey,
                attempts: attempts,
                duration: endTime - startTime
            });
            // Worker selesai setelah menemukan alamat
            return;
        }

        // Kirim status kemajuan setiap 100,000 upaya
        if (attempts % 100000 === 0) {
            parentPort.postMessage({
                success: false,
                attempts: 100000, // Kirim jumlah upaya dari batch terakhir
            });
            attempts = 0; // Reset attempts di worker untuk batch berikutnya
        }
    }
}

// Periksa apakah skrip dijalankan sebagai worker atau main thread
if (isMainThread) {
    // Jika ini adalah main thread, jalankan fungsi main
    main();
} else {
    // Jika ini adalah worker thread, jalankan logika worker
    findVanityAddress();
}
