const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Store = require('electron-store');
const store = new Store();

const consoleElement = document.getElementById('console');
let lastModified = null;
const TEST_MODE = false; // Set to false for production
const API_URL = 'https://api.eso-sales.com/api/v1/sales';

const SAVED_FILE = 'ESOSales.lua';
const NUM_BUCKETS = 10; // Now we'll track 10 buckets

const DEBOUNCE_TIME = 2000; // 2 seconds debounce
const fileWatchers = new Map();
const fileDebounces = new Map();
let isProcessing = false;

function addLog(message, type = 'info') {
  if (!TEST_MODE && (type === 'debug')) {
    return;
  }

  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
  consoleElement.appendChild(logEntry);
  consoleElement.scrollTop = consoleElement.scrollHeight;
}

async function sendToApi(data) {
  if (TEST_MODE) {
    addLog('TEST MODE: Would send to API:', 'debug');
    addLog(JSON.stringify(data, null, 2), 'debug');
    return;
  }

  //addLog(JSON.stringify(data.length, null, 2), 'api-data');

  // Split data into chunks of 100 entries
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  addLog(`Splitting ${data.length} entries into ${chunks.length} chunks`, 'debug');

  for (const chunk of chunks) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ESO-Sales-Launcher/1.0'
        },
        body: JSON.stringify(chunk)
      });

      if (!response.ok) {
        addLog(`API responded with status: ${response.status} ${response.message} ${response.statusText}`, 'error');
        throw new Error(`API responded with status: ${response.status} ${response.message} ${response.statusText}`);
      }

      const result = await response.json();

      // Add a small delay between chunks to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      addLog(`API Error: ${error.message}`, 'error');
    }
  }
}

function parseBucketFile(content, bucketNumber) {
    try {
        const entries = [];
        addLog(`Starting to parse bucket ${bucketNumber}`, 'debug');
        
        // Find the start of the specific bucket
        const bucketStart = content.indexOf(`ESOSales_Bucket${bucketNumber}`);
        if (bucketStart === -1) {
            addLog(`Bucket ${bucketNumber} not found in content`, 'debug');
            return entries;
        }

        // Extract user ID using regex
        const userIdMatch = content.match(/@[\w]+/);
        const reporterName = userIdMatch ? userIdMatch[0] : null;
        
        if (!reporterName) {
            addLog('Could not find user ID in file', 'error');
            return entries;
        } else {
            addLog(`Found user ID: ${reporterName}`, 'debug');
        }

        // Find the start of the next bucket or use end of file for bucket 10
        let bucketEnd;
        if (bucketNumber === NUM_BUCKETS) {
            bucketEnd = content.length;
        } else {
            bucketEnd = content.indexOf(`ESOSales_Bucket${bucketNumber + 1}`);
            if (bucketEnd === -1) bucketEnd = content.length;
        }

        // Extract bucket content
        const bucketContent = content.substring(bucketStart, bucketEnd);
        
        // Convert Lua table syntax to JSON-like structure
        const jsonString = bucketContent
            .replace(/ESOSales_Bucket\d+\s*=/, '') // Remove bucket declaration
            .replace(/\["([^"]+)"\]\s*=/g, '"$1":') // Convert ["key"] = to "key":
            .replace(/=\s*{/g, ':{') // Convert = { to :{
            .replace(/,(\s*})/g, '$1') // Remove trailing commas before closing braces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        // Parse the JSON-like structure
        const bucketData = Function(`return ${jsonString}`)();
        
        // Navigate through the structure to get to entries
        const entriesData = bucketData.Default['@cymi']['$AccountWide'].entries;
        
        // Convert entries to array
        if (entriesData) {
            addLog(`Found ${Object.keys(entriesData).length} entries in bucket ${bucketNumber}`, 'debug');
            const firstEntry = Object.values(entriesData)[0];
            addLog(`First Entry: ${JSON.stringify(firstEntry, null, 2)}`, 'debug');
            Object.values(entriesData).forEach(entry => {
                entries.push({
                    reporterName: reporterName,
                    eventId: entry.eventId,
                    eventType: entry.eventType,
                    itemName: entry.itemName,
                    itemLink: entry.itemLink,
                    itemIcon: entry.itemIcon,
                    itemQuality: entry.itemQuality,
                    quantity: entry.quantity,
                    price: entry.price,
                    tax: entry.tax,
                    sellerName: entry.sellerName,
                    buyerName: entry.buyerName,
                    guildName: entry.guildName,
                    guildId: entry.guildId,
                    timeStamp: entry.timeStamp,
                    isRedacted: entry.isRedacted,
                    trader: entry.trader,
                    megaserver: entry.megaserver
                });
            });
        }

        addLog(`Successfully parsed ${entries.length} entries from bucket ${bucketNumber}`, 'debug');
        return entries;
        
    } catch (error) {
        addLog(`Error parsing ${bucketNumber}: ${error.message}`, 'error');
        addLog(`Stack trace: ${error.stack}`, 'debug');
        return [];
    }
}

function setupFileWatcher() {
    const userHome = os.homedir();
    const savedVarsPath = path.join(userHome, 'Documents', 'Elder Scrolls Online', 'live', 'SavedVariables');
    const filePath = path.join(savedVarsPath, SAVED_FILE);
    
    // Check if file exists and process it immediately
    if (fs.existsSync(filePath)) {
        addLog('Found existing sales file, processing...', 'debug');
        handleFileChange(filePath);
    }

    // Create single watcher for the file
    const watcher = fs.watch(savedVarsPath, (eventType, filename) => {
        if (filename === SAVED_FILE) {
            addLog('File changed, processing...', 'debug');
            handleFileChange(filePath);
        }
    });

    fileWatchers.set(SAVED_FILE, watcher);
    addLog('Monitoring for sales...', 'processing');
}

async function handleFileChange(filePath) {
    // Prevent concurrent execution
    if (isProcessing) {
        addLog("Already processing file changes, skipping...", 'debug');
        return;
    }

    // Clear existing debounce timeout
    if (fileDebounces.has(filePath)) {
        clearTimeout(fileDebounces.get(filePath));
    }

    // Set new debounce timeout
    fileDebounces.set(filePath, setTimeout(async () => {
        try {
            isProcessing = true;
            const content = await fs.promises.readFile(filePath, 'utf8');

            // Process each bucket
            for (let i = 1; i <= NUM_BUCKETS; i++) {
                const entries = parseBucketFile(content, i);
                if (entries && entries.length > 0) {
                    addLog(`Found ${entries.length} entries in bucket ${i}`, 'debug');
                    await sendToApi(entries);
                }
            }
            addLog('Finished syncing latest sales.', 'success')

            // Clear entries and reset bucket counts
            const updatedContent = content
                // Clear entries in each bucket
                .replace(
                    /(\["entries"\]\s*=\s*){[\s\S]*?}(,?\s*\n\s*\["(?:version|locked)"]\s*=)/g,
                    '$1{}$2'
                )
                // Reset bucket counts to 0
                .replace(
                    /(\["bucketCounts"\]\s*=\s*\n\s*{)([\s\S]*?)(},)/,
                    '$1\n                    [1] = 0,\n                    [2] = 0,\n                    [3] = 0,\n                    [4] = 0,\n                    [5] = 0,\n                    [6] = 0,\n                    [7] = 0,\n                    [8] = 0,\n                    [9] = 0,\n                    [10] = 0,\n                $3'
                )
                // Reset currentBucket to 1
                .replace(
                    /(\["currentBucket"\]\s*=\s*)\d+/,
                    '$11'
                );

            // Write the updated content back to the file
            await fs.promises.writeFile(filePath, updatedContent, 'utf8');

        } catch (error) {
            addLog(`Error processing file: ${error.message}`, 'error');
        } finally {
            isProcessing = false;
        }
    }, DEBOUNCE_TIME));
}

// Cleanup function for watchers
function cleanup() {
    fileWatchers.forEach((watcher) => {
        watcher.close();
    });
    fileWatchers.clear();
    fileDebounces.clear();
}

// Handle process termination
process.on('SIGINT', () => {
    cleanup();
    process.exit();
});

process.on('SIGTERM', () => {
    cleanup();
    process.exit();
});

// Initialize watchers

setupFileWatcher();

// Optional: Periodic check for watcher health
setInterval(() => {
    fileWatchers.forEach((watcher, bucketFile) => {
        if (!watcher || watcher.closed) {
            addLog(`Monitoring ${bucketFile}...`, 'info');
            setupFileWatcher();
        }
    });
}, 30000); // Check every 30 seconds