// vanity_worker.js

const { parentPort, workerData } = require('worker_threads');
const { Wallet } = require('ethers');

// Fungsi untuk memeriksa apakah alamat cocok dengan pola yang diinginkan
function checkMatch(address, pattern, isCaseSensitive) {
    // Alamat EVM selalu diawali dengan '0x'. Kita hanya membandingkan sisanya.
    const cleanAddress = address.substring(2); 
    
    // Pola selalu berupa array [prefix, suffix]
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

// Fungsi utama untuk menjalankan pencarian
function findVanityAddress() {
    const { pattern, isCaseSensitive } = workerData;
    let attempts = 0;
    const startTime = Date.now();
    let wallet;

    while (true) {
        // Buat Wallet baru secara acak menggunakan ethers.js
        wallet = Wallet.createRandom();
        const address = wallet.address;
        const privateKey = wallet.privateKey;
        
        attempts++;

        // Periksa kecocokan
        if (checkMatch(address, pattern, isCaseSensitive)) {
            // Jika cocok, kirim hasilnya kembali ke main thread
            // Tambahkan address dan privateKey ke pesan sukses untuk disimpan di Main Thread
            const endTime = Date.now();
            parentPort.postMessage({
                success: true,
                address: address,
                privateKey: privateKey,
                attempts: attempts,
                duration: endTime - startTime
            });
            return;
        }

        // Kirim status kemajuan secara berkala
        if (attempts % 100000 === 0) {
            parentPort.postMessage({
                success: false,
                attempts: attempts,
                duration: Date.now() - startTime
            });
        }
    }
}

findVanityAddress();
